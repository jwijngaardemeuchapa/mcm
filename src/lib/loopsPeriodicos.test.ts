import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { minutesUntil, todayDateISO_SP } from "./datetime";
import { buscarConfirmacoesEsquecidas, type ConfirmacaoCandidata } from "./useForgetFupConfirmation";
import { buscarTarefasParaAgendar } from "./useScheduledFup";

// SQLite de verdade: o ponto é provar que limitar a consulta a "ontem em diante" não muda
// QUAIS linhas os loops de 60 s acabam usando (eles já descartavam o passado em JS).
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const HORA = 3_600_000;
const DIA = 24 * HORA;

function aleatorio(semente: number) {
  let s = semente >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
// instante real escrito com o offset -03:00 (como o app grava data_tarefa)
const iso = (ms: number) => new Date(ms - 3 * HORA).toISOString().slice(0, 19) + "-03:00";

function criarBanco(n: number, semente: number) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, data_tarefa TEXT, empresa TEXT, status_tarefa TEXT, ativo INTEGER);
    CREATE TABLE chapas (id TEXT PRIMARY KEY, id_tarefa INTEGER, nome_chapa TEXT, status_contato TEXT, data_contato TEXT);
  `);
  const r = aleatorio(semente);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const agora = Date.now();
  const insT = db.prepare("INSERT INTO tarefas VALUES (?,?,?,?,?)");
  const insC = db.prepare("INSERT INTO chapas VALUES (?,?,?,?,?)");
  const status = ["Em Aberto", "Aguardando Início", "Em Andamento", "Finalizado", "Concluído", "Cancelado", "Cancelado pelo cliente"];
  db.exec("BEGIN");
  for (let i = 1; i <= n; i++) {
    // de 400 dias atrás até 3 dias à frente, com bastante coisa colada em "agora"
    const ms = r() < 0.4 ? agora + (r() * 4 - 1) * DIA : agora + (r() * 403 - 400) * DIA;
    insT.run(i, iso(ms), `Empresa ${i % 20}`, pick(status), r() < 0.9 ? 1 : 0);
    const nc = Math.floor(r() * 5);
    for (let c = 0; c < nc; c++) {
      insC.run(
        `${i}-${c}`, i, `Chapa ${c}`, pick(["confirmado", "confirmado", "pendente", "removido"]),
        r() < 0.15 ? null : new Date(agora - r() * 40 * HORA).toISOString(),
      );
    }
  }
  db.exec("COMMIT");
  return db;
}

const adaptador = (db: InstanceType<typeof DatabaseSync>) => ({
  select: async <T,>(sql: string, params: unknown[] = []) => db.prepare(sql).all(...(params as never[])) as unknown as T,
});

describe("useForgetFupConfirmation — consulta limitada dá as mesmas confirmações a reabrir", () => {
  it("bate com a versão antiga (histórico inteiro) em 3 bancos", async () => {
    let total = 0;
    for (const semente of [1, 2, 3]) {
      const db = criarBanco(4000, semente);
      const limiarHoras = 6;
      // versão ANTIGA: tudo do histórico, depois os filtros em JS
      const velhas = db
        .prepare(
          `SELECT c.id, c.nome_chapa, t.empresa, t.id_tarefa, t.data_tarefa, c.data_contato
           FROM chapas c JOIN tarefas t ON c.id_tarefa = t.id_tarefa
           WHERE t.ativo = 1 AND t.status_tarefa NOT IN ('Concluído', 'Cancelado')
             AND c.status_contato = 'confirmado' AND c.data_contato IS NOT NULL`,
        )
        .all() as ConfirmacaoCandidata[];
      const agora = Date.now();
      const esperado = velhas
        .filter((x) => minutesUntil(x.data_tarefa) > 0 && agora - new Date(x.data_contato).getTime() > limiarHoras * HORA)
        .map((x) => x.id);
      const obtido = (await buscarConfirmacoesEsquecidas(adaptador(db), limiarHoras)).map((x) => x.id);
      expect(obtido).toEqual(esperado);
      total += obtido.length;
      // e a consulta nova realmente lê bem menos que o histórico
      expect(velhas.length).toBeGreaterThan(obtido.length * 3);
    }
    expect(total).toBeGreaterThan(30); // sanidade: o teste tem o que comparar
  }, 60_000);

  it("não deixa escapar confirmação de tarefa de hoje que ainda não começou", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, data_tarefa TEXT, empresa TEXT, status_tarefa TEXT, ativo INTEGER);
      CREATE TABLE chapas (id TEXT PRIMARY KEY, id_tarefa INTEGER, nome_chapa TEXT, status_contato TEXT, data_contato TEXT);
    `);
    const agora = Date.now();
    db.prepare("INSERT INTO tarefas VALUES (1, ?, 'X', 'Aguardando Início', 1)").run(iso(agora + 30 * 60_000));
    db.prepare("INSERT INTO chapas VALUES ('1-0', 1, 'Fulano', 'confirmado', ?)").run(new Date(agora - 10 * HORA).toISOString());
    const r = await buscarConfirmacoesEsquecidas(adaptador(db), 6);
    expect(r.map((x) => x.id)).toEqual(["1-0"]);
  });
});

describe("useScheduledFup — consulta limitada dá as mesmas tarefas candidatas", () => {
  it("as que ainda não passaram são exatamente as mesmas, na mesma ordem", async () => {
    let total = 0;
    for (const semente of [4, 5, 6]) {
      const db = criarBanco(4000, semente);
      const velhas = db
        .prepare(
          `SELECT id_tarefa, data_tarefa, empresa FROM tarefas
           WHERE ativo = 1 AND status_tarefa NOT IN ('Concluído', 'Cancelado')`,
        )
        .all() as Array<{ id_tarefa: number; data_tarefa: string; empresa: string }>;
      // o loop do hook descarta "minutesUntil < 0" (tarefa que já passou)
      const esperado = velhas.filter((t) => minutesUntil(t.data_tarefa) >= 0).map((t) => t.id_tarefa);
      const novas = await buscarTarefasParaAgendar(adaptador(db));
      const obtido = novas.filter((t) => minutesUntil(t.data_tarefa) >= 0).map((t) => t.id_tarefa);
      expect(obtido).toEqual(esperado);
      expect(velhas.length).toBeGreaterThan(novas.length); // a consulta nova lê menos que o histórico
      total += obtido.length;
    }
    expect(total).toBeGreaterThan(100);
  }, 60_000);

  it("usa a data de São Paulo de hoje como referência", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, data_tarefa TEXT, empresa TEXT, status_tarefa TEXT, ativo INTEGER)");
    const ins = db.prepare("INSERT INTO tarefas VALUES (?, ?, 'X', 'Em Aberto', 1)");
    ins.run(1, "2026-01-01T08:00:00-03:00");
    ins.run(2, "2026-10-06T23:00:00-03:00"); // ontem
    ins.run(3, "2026-10-07T08:00:00-03:00"); // hoje
    ins.run(4, "2026-10-08T08:00:00-03:00"); // amanhã
    const r = await buscarTarefasParaAgendar(adaptador(db), "2026-10-07");
    expect(r.map((t) => t.id_tarefa)).toEqual([2, 3, 4]);
    expect(todayDateISO_SP()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
