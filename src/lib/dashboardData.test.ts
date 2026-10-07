import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { buildConfiabilidadeMap } from "./confiabilidade";
import { parseTaskDate, todayDateISO_SP } from "./datetime";
import {
  agruparPorTarefa,
  aplicarSeMudou,
  assinatura,
  carregarTabelasDashboard,
  DASHBOARD_JANELA_DIAS,
  filtrarAtivas,
  ordenarFupRecentePrimeiro,
  recortesDashboard,
  type BancoLeitura,
  type Linha,
  type TabelasDashboard,
  type TarefaLinha,
} from "./dashboardData";

// SQLite de verdade (node:sqlite) — o ponto é provar que a janela de dados nova
// mostra EXATAMENTE os mesmos cards que a carga antiga (tabelas inteiras).
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const DIA = 86_400_000;

function aleatorio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function criarBanco(n: number, semente = 7) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, data_tarefa TEXT, empresa TEXT, cidade_uf TEXT,
      status_tarefa TEXT, ativo INTEGER, is_overnight INTEGER, validacao_status TEXT);
    CREATE TABLE chapas (id TEXT PRIMARY KEY, id_tarefa INTEGER, nome_chapa TEXT, cpf TEXT, telefone_chapa TEXT,
      status_contato TEXT, validacao_presenca TEXT);
    CREATE TABLE fup_log (id TEXT PRIMARY KEY, id_tarefa INTEGER, canal TEXT, data_disparo TEXT);
    CREATE TABLE chat_links (id_tarefa INTEGER, umbler_chat_id TEXT);
  `);
  const r = aleatorio(semente);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const agora = Date.now();
  const status = ["Aguardando Início", "Em Andamento", "Finalizado", "Finalizado", "Cancelado", "Cancelado pelo cliente", "Em Aberto", null];
  const ativo = [1, 1, 1, 0, null];
  const validacao = [null, "aguardando", "aguardando", "pendente", "subido_meu_chapa", "validacao_recebida"];
  const empresas = ["Alfa", "Beta Ltda", "Gama S.A.", "Delta", "Fora do Escopo"];
  const insT = db.prepare("INSERT INTO tarefas VALUES (?,?,?,?,?,?,?,?)");
  const insC = db.prepare("INSERT INTO chapas VALUES (?,?,?,?,?,?,?)");
  const insF = db.prepare("INSERT INTO fup_log VALUES (?,?,?,?)");
  const insL = db.prepare("INSERT INTO chat_links VALUES (?,?)");
  db.exec("BEGIN");
  for (let i = 1; i <= n; i++) {
    // de -150 dias a +5 dias, horários variados (inclui madrugada, pra pegar overnight/fuso)
    const ms = agora + (Math.floor(r() * 156) - 150) * DIA + Math.floor(r() * DIA);
    const iso = new Date(ms).toISOString().replace("Z", "-03:00");
    insT.run(i, iso, pick(empresas), pick(["São Paulo/SP", "Manaus/AM", null]), pick(status), pick(ativo), r() < 0.2 ? 1 : 0, pick(validacao));
    const nc = Math.floor(r() * 5);
    for (let c = 0; c < nc; c++) {
      insC.run(`${i}-${c}`, i, r() < 0.1 ? null : `Chapa ${i % 40}`, r() < 0.5 ? `${10000000000 + (i % 40)}` : null,
        `1199${String(1000000 + ((i * 7 + c) % 40)).slice(-6)}`, pick(["pendente", "confirmado", "removido", "cancelado"]),
        pick([null, "presente", "ausente"]));
    }
    const nf = Math.floor(r() * 4);
    for (let f = 0; f < nf; f++) {
      // mistura formatos de data (ISO com Z e "AAAA-MM-DD HH:MM:SS") como o app já gravou
      const d = new Date(ms + f * 60_000);
      insF.run(`${i}f${f}`, i, "umbler_talk", r() < 0.2 ? d.toISOString().replace("T", " ").slice(0, 19) : d.toISOString());
    }
    if (r() < 0.5) insL.run(i, `chat${i}`);
  }
  // Casos fixos pra nenhum recorte ficar vazio com a semente: overnight de ONTEM (vários
  // estados de validação, um já subido, um cancelado) e tarefas de HOJE.
  const [Y, M, D] = todayDateISO_SP().split("-").map(Number);
  const dia = (delta: number) => new Date(Date.UTC(Y, M - 1, D + delta)).toISOString().slice(0, 10);
  const fixos: Array<[string, string, number, string | null, number | null]> = [
    [`${dia(-1)}T23:30:00-03:00`, "Em Andamento", 1, "aguardando", 1],
    [`${dia(-1)}T22:00:00-03:00`, "Finalizado", 1, "pendente", 1],
    [`${dia(-1)}T23:00:00-03:00`, "Em Andamento", 1, "subido_meu_chapa", 1],
    [`${dia(-1)}T21:00:00-03:00`, "Cancelado", 1, null, 1],
    [`${dia(0)}T08:00:00-03:00`, "Aguardando Início", 0, "aguardando", 1],
    [`${dia(0)}T10:00:00-03:00`, "Em Andamento", 0, null, 1],
    [`${dia(1)}T09:00:00-03:00`, "Aguardando Início", 0, "aguardando", 1],
  ];
  fixos.forEach(([iso, st, ov, val, at], k) => {
    const id = 900000 + k;
    insT.run(id, iso, k % 2 ? "Alfa" : "Beta Ltda", "São Paulo/SP", st, at, ov, val);
    insC.run(`${id}-0`, id, `Chapa ${k}`, null, `1198800000${k}`, "confirmado", null);
    insF.run(`${id}f0`, id, "umbler_talk", new Date().toISOString());
  });
  db.exec("COMMIT");
  return db;
}

function adaptador(db: InstanceType<typeof DatabaseSync>): BancoLeitura {
  return {
    select: async <T,>(sql: string) => db.prepare(sql).all() as unknown as T,
    execute: async (sql: string) => db.prepare(sql).run(),
  };
}

const inCarteira = (empresa: string) => empresa !== "Fora do Escopo";

// ── pipeline NOVO (o que o Dashboard.load faz agora) ──────────────────────────
function cardsNovo(t: TabelasDashboard, nowMs: number) {
  const ativas = filtrarAtivas(t.tarefas);
  for (const x of ativas) {
    if ((x.validacao_status ?? "aguardando") === "aguardando" && parseTaskDate(x.data_tarefa, x.cidade_uf as string | null).getTime() <= nowMs) {
      x.validacao_status = "pendente";
    }
  }
  const { todaysTasks, yesterdayOvernight, allDatesTasks } = recortesDashboard(ativas, todayDateISO_SP(), inCarteira);
  const mc = agruparPorTarefa(t.chapas as Array<Linha & { id_tarefa: number }>);
  const mf = agruparPorTarefa(ordenarFupRecentePrimeiro(t.fup as Array<Linha & { data_disparo: string; id_tarefa: number }>));
  const ml = agruparPorTarefa(t.chatLinks as Array<Linha & { id_tarefa: number }>);
  const card = (x: TarefaLinha) => ({
    id: x.id_tarefa,
    status: x.status_tarefa,
    validacao: x.validacao_status,
    chapas: (mc.get(x.id_tarefa) ?? []).map((c) => c.id),
    fup: (mf.get(x.id_tarefa) ?? []).map((f) => f.id),
    links: (ml.get(x.id_tarefa) ?? []).map((l) => l.umbler_chat_id),
  });
  const porData = (a: TarefaLinha, b: TarefaLinha) => new Date(a.data_tarefa).getTime() - new Date(b.data_tarefa).getTime();
  return {
    overnight: [...yesterdayOvernight].sort(porData).map(card),
    hoje: [...todaysTasks].sort(porData).map(card),
    todas: [...allDatesTasks].sort(porData).map(card),
    confiabilidade: buildConfiabilidadeMap(t.tarefas as never, t.chapas as never),
    transicionadas: ativas.filter((x) => x.validacao_status === "pendente").map((x) => x.id_tarefa),
  };
}

// ── pipeline ANTIGO (cópia fiel do que existia: tabelas inteiras + .filter por card) ──
function cardsAntigo(t: TabelasDashboard, nowMs: number) {
  const ativas = (t.tarefas as TarefaLinha[]).filter(
    (x) => x.ativo !== false && x.ativo !== 0 && !x.status_tarefa?.toLowerCase().startsWith("cancel"),
  );
  const sortedFup = [...t.fup].sort(
    (a, b) => new Date(b.data_disparo as string).getTime() - new Date(a.data_disparo as string).getTime(),
  );
  for (const x of ativas) {
    if ((x.validacao_status ?? "aguardando") === "aguardando" && parseTaskDate(x.data_tarefa, x.cidade_uf as string | null).getTime() <= nowMs) {
      x.validacao_status = "pendente";
    }
  }
  const todayISO = todayDateISO_SP();
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const hoje = ativas.filter((x) => {
    if (x.status_tarefa === "Finalizado") return false;
    if (x.status_tarefa?.toLowerCase().startsWith("cancel")) return false;
    if (fmt(x.data_tarefa) < todayISO) return false;
    return inCarteira(x.empresa);
  });
  const y = new Date(`${todayISO}T00:00:00-03:00`);
  y.setDate(y.getDate() - 1);
  const yISO = y.toISOString().slice(0, 10);
  const overnight = ativas.filter((x) => {
    if (!x.is_overnight) return false;
    if (x.status_tarefa?.toLowerCase().startsWith("cancel")) return false;
    if (fmt(x.data_tarefa) !== yISO) return false;
    if ((x.validacao_status ?? "aguardando") === "subido_meu_chapa") return false;
    return inCarteira(x.empresa);
  });
  const todas = ativas.filter((x) => {
    if (x.status_tarefa === "Finalizado") return false;
    if (x.status_tarefa?.toLowerCase().startsWith("cancel")) return false;
    return inCarteira(x.empresa);
  });
  const card = (x: TarefaLinha) => ({
    id: x.id_tarefa,
    status: x.status_tarefa,
    validacao: x.validacao_status,
    chapas: t.chapas.filter((c) => c.id_tarefa === x.id_tarefa).map((c) => c.id),
    fup: sortedFup.filter((f) => f.id_tarefa === x.id_tarefa).map((f) => f.id),
    links: t.chatLinks.filter((l) => l.id_tarefa === x.id_tarefa).map((l) => l.umbler_chat_id),
  });
  const porData = (a: TarefaLinha, b: TarefaLinha) => new Date(a.data_tarefa).getTime() - new Date(b.data_tarefa).getTime();
  return {
    overnight: [...overnight].sort(porData).map(card),
    hoje: [...hoje].sort(porData).map(card),
    todas: [...todas].sort(porData).map(card),
    confiabilidade: buildConfiabilidadeMap(t.tarefas as never, t.chapas as never),
    transicionadas: ativas.filter((x) => x.validacao_status === "pendente").map((x) => x.id_tarefa),
  };
}

async function cargaCompleta(db: InstanceType<typeof DatabaseSync>): Promise<TabelasDashboard> {
  const s = adaptador(db);
  return {
    tarefas: await s.select<TarefaLinha[]>("SELECT * FROM tarefas"),
    chapas: await s.select<Linha[]>("SELECT * FROM chapas"),
    fup: await s.select<Linha[]>("SELECT * FROM fup_log"),
    chatLinks: await s.select<Linha[]>("SELECT * FROM chat_links"),
  };
}

// o load() grava no banco as tarefas que transicionaram (UPDATE ... IN (...))
function gravarTransicao(db: InstanceType<typeof DatabaseSync>, ids: number[]) {
  if (ids.length === 0) return;
  db.prepare(`UPDATE tarefas SET validacao_status = 'pendente' WHERE id_tarefa IN (${ids.join(",")})`).run();
}

describe("carga do Dashboard por janela de dados", () => {
  it.each([1, 2, 3])("mostra exatamente os mesmos cards que a carga antiga (semente %i)", async (semente) => {
    const agora = Date.now();

    // banco A: carga ANTIGA (tabelas inteiras)
    const dbA = criarBanco(3000, semente);
    const antigo = cardsAntigo(await cargaCompleta(dbA), agora);
    gravarTransicao(dbA, antigo.transicionadas);

    // banco B: carga NOVA (janela + UPDATE das antigas)
    const dbB = criarBanco(3000, semente);
    const novo = cardsNovo(await carregarTabelasDashboard(adaptador(dbB)), agora);
    gravarTransicao(dbB, novo.transicionadas);

    // sanidade: o teste só vale se os recortes não estiverem vazios
    expect(antigo.hoje.length).toBeGreaterThan(20);
    expect(antigo.todas.length).toBeGreaterThan(antigo.hoje.length - 1);
    expect(antigo.overnight.length).toBeGreaterThan(0);

    expect(novo.hoje).toEqual(antigo.hoje);
    expect(novo.todas).toEqual(antigo.todas);
    expect(novo.overnight).toEqual(antigo.overnight);
    expect([...novo.confiabilidade.entries()]).toEqual([...antigo.confiabilidade.entries()]);

    // e o estado final do banco (validacao_status de TODAS as tarefas, inclusive as
    // antigas que a janela não lê) é o mesmo
    const estado = (db: InstanceType<typeof DatabaseSync>) =>
      db.prepare("SELECT id_tarefa, validacao_status FROM tarefas ORDER BY id_tarefa").all();
    expect(estado(dbB)).toEqual(estado(dbA));
  }, 60_000); // o pipeline ANTIGO, de propósito lento (quadrático), está dentro do teste

  it("de fato lê bem menos linhas que a tabela inteira", async () => {
    const db = criarBanco(3000, 5);
    const total = (db.prepare("SELECT COUNT(*) AS n FROM tarefas").get() as { n: number }).n;
    const t = await carregarTabelasDashboard(adaptador(db));
    expect(t.tarefas.length).toBeLessThan(total * 0.6);
    // tudo que entrou é da janela ou está ativo e não finalizado
    const corte = Date.now() - (DASHBOARD_JANELA_DIAS + 1) * DIA;
    for (const x of t.tarefas) {
      const recente = new Date(x.data_tarefa).getTime() >= corte;
      const abertaAtiva =
        x.ativo !== 0 && !String(x.status_tarefa ?? "").toLowerCase().startsWith("cancel") && x.status_tarefa !== "Finalizado";
      expect(recente || abertaAtiva).toBe(true);
    }
    const ids = new Set(t.tarefas.map((x) => x.id_tarefa));
    expect(t.chapas.every((c) => ids.has(c.id_tarefa as number))).toBe(true);
    expect(t.fup.every((f) => ids.has(f.id_tarefa as number))).toBe(true);
  });

  it("chat_links ausente não derruba a carga", async () => {
    const db = criarBanco(50, 9);
    db.exec("DROP TABLE chat_links");
    const t = await carregarTabelasDashboard(adaptador(db));
    expect(t.chatLinks).toEqual([]);
    expect(t.tarefas.length).toBeGreaterThan(0);
  });
});

describe("ajudantes", () => {
  it("agruparPorTarefa mantém a ordem original dentro do grupo (igual ao filter)", () => {
    const linhas = [
      { id_tarefa: 1, n: "a" },
      { id_tarefa: 2, n: "b" },
      { id_tarefa: 1, n: "c" },
      { id_tarefa: 2, n: "d" },
      { id_tarefa: 1, n: "e" },
    ];
    const m = agruparPorTarefa(linhas);
    expect(m.get(1)).toEqual(linhas.filter((l) => l.id_tarefa === 1));
    expect(m.get(2)).toEqual(linhas.filter((l) => l.id_tarefa === 2));
    expect(m.get(3)).toBeUndefined();
  });

  it("ordenarFupRecentePrimeiro dá a mesma ordem que o comparador antigo (inclusive empates e datas inválidas)", () => {
    const base = Date.parse("2026-10-01T12:00:00Z");
    const linhas = Array.from({ length: 200 }, (_, i) => ({
      id: i,
      data_disparo:
        i % 37 === 0 ? "data-invalida" : new Date(base + (i % 17) * 60_000).toISOString().replace(i % 5 === 0 ? "Z" : "", i % 5 === 0 ? "" : ""),
    }));
    const antigo = [...linhas].sort(
      (a, b) => new Date(b.data_disparo).getTime() - new Date(a.data_disparo).getTime(),
    );
    expect(ordenarFupRecentePrimeiro(linhas).map((l) => l.id)).toEqual(antigo.map((l) => l.id));
  });

  it("assinatura enxerga Map e Set (JSON puro devolveria '{}')", () => {
    expect(assinatura(new Map([["a", 1]]))).not.toBe(assinatura(new Map([["a", 2]])));
    expect(assinatura(new Set([1, 2]))).not.toBe(assinatura(new Set([1, 3])));
    expect(assinatura(new Set([1, 2]))).toBe(assinatura(new Set([1, 2])));
  });

  it("aplicarSeMudou só chama o setter quando o valor muda", () => {
    const cache: Record<string, string> = {};
    const chamadas: unknown[] = [];
    const set = (v: unknown) => chamadas.push(v);
    aplicarSeMudou(cache, "k", [1, 2], set);
    aplicarSeMudou(cache, "k", [1, 2], set); // igual (outra instância) → não chama
    aplicarSeMudou(cache, "k", [1, 2, 3], set);
    aplicarSeMudou(cache, "outra", [1, 2, 3], set); // chave diferente → chama
    expect(chamadas).toEqual([[1, 2], [1, 2, 3], [1, 2, 3]]);
  });
});
