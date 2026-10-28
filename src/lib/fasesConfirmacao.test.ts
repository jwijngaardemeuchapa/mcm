import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aguardaReforcoDeFup,
  atualizarChapa,
  comFlagManual,
  confirmadoNoFup,
  confirmadoNoPrefup,
  confirmarManualEmLote,
  confirmarPorResposta,
  entraNoFupEmMassa,
  flagsDaResposta,
  garantirFasesConfirmacao,
  marcarFupDoReforco,
} from "./fasesConfirmacao";
import { emJanelaDeFup } from "./prefup";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

type Banco = InstanceType<typeof DatabaseSync>;
const adaptador = (db: Banco) => ({
  select: async <T,>(sql: string, p: unknown[] = []) => db.prepare(sql).all(...(p as never[])) as unknown as T,
  execute: async (sql: string, p: unknown[] = []) => ({ rowsAffected: Number(db.prepare(sql).run(...(p as never[])).changes) }),
});

const ESQUEMA_ANTIGO = `
  CREATE TABLE chapas (id TEXT PRIMARY KEY, id_tarefa INTEGER, nome_chapa TEXT, status_contato TEXT, data_contato TEXT, canal_contato TEXT, confirmado_via TEXT);
  CREATE TABLE fup_log (id TEXT PRIMARY KEY, id_tarefa INTEGER, canal TEXT, data_disparo TEXT, chapa_id TEXT, aguarda_resposta_chat INTEGER DEFAULT 0);
`;
const bancoAntigo = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(ESQUEMA_ANTIGO);
  return db;
};
const linha = (db: Banco, id: string) =>
  db.prepare("SELECT status_contato s, prefup_confirmado_em p, fup_confirmado_em f, confirmado_via v FROM chapas WHERE id = ?").get(id) as {
    s: string; p: string | null; f: string | null; v: string | null;
  };

describe("regras puras das fases", () => {
  const c = (status: string, p?: string | null, f?: string | null) => ({ status_contato: status, prefup_confirmado_em: p, fup_confirmado_em: f });

  it("confirmadoNoPrefup / confirmadoNoFup / aguardaReforcoDeFup só valem com o chapa confirmado", () => {
    expect(confirmadoNoPrefup(c("confirmado", "t"))).toBe(true);
    expect(confirmadoNoPrefup(c("pendente", "t"))).toBe(false); // flag velha sem status confirmado não conta
    expect(confirmadoNoFup(c("confirmado", "t", "t"))).toBe(true);
    expect(aguardaReforcoDeFup(c("confirmado", "t", null))).toBe(true);
    expect(aguardaReforcoDeFup(c("confirmado", "t", "t"))).toBe(false);
    expect(aguardaReforcoDeFup(c("confirmado", null, null))).toBe(false); // confirmado sem fase (ex.: importado já em andamento)
  });

  it("FUP em massa: pendente entra sempre; removido nunca; confirmado só como reforço, e só na janela do FUP", () => {
    for (const janela of [false, true]) {
      expect(entraNoFupEmMassa(c("pendente"), janela)).toBe(true);
      expect(entraNoFupEmMassa(c("nao_respondeu"), janela)).toBe(true);
      expect(entraNoFupEmMassa(c("cancelado"), janela)).toBe(true);
      expect(entraNoFupEmMassa(c("removido"), janela)).toBe(false);
      expect(entraNoFupEmMassa(c("confirmado", "t", "t"), janela)).toBe(false); // já respondeu o FUP
      expect(entraNoFupEmMassa(c("confirmado", null, null), janela)).toBe(false); // sem fase conhecida: como antes, fica de fora
    }
    expect(entraNoFupEmMassa(c("confirmado", "t", null), true)).toBe(true); // reforço na janela do FUP
    expect(entraNoFupEmMassa(c("confirmado", "t", null), false)).toBe(false); // antes da janela, não manda PréFUP de novo
  });

  it("flagsDaResposta: PréFUP marca só a do PréFUP; FUP ou origem desconhecida marcam a do FUP", () => {
    expect(flagsDaResposta("prefup", "T")).toEqual({ prefup_confirmado_em: "T", fup_confirmado_em: null });
    expect(flagsDaResposta("fup", "T")).toEqual({ prefup_confirmado_em: null, fup_confirmado_em: "T" });
    expect(flagsDaResposta(null, "T")).toEqual({ prefup_confirmado_em: null, fup_confirmado_em: "T" });
  });

  it("comFlagManual: confirmar na mão acrescenta a flag do FUP; outros patches ficam intactos", () => {
    expect(comFlagManual({ status_contato: "confirmado", data_contato: "D" })).toEqual({
      status_contato: "confirmado", data_contato: "D", fup_confirmado_em: "D",
    });
    const sem = { status_contato: "pendente" };
    expect(comFlagManual(sem)).toBe(sem);
    const ja = { status_contato: "confirmado", fup_confirmado_em: "X" };
    expect(comFlagManual(ja)).toBe(ja);
    expect(comFlagManual({ status_contato: "confirmado" }, "AGORA")).toEqual({ status_contato: "confirmado", fup_confirmado_em: "AGORA" });
  });
});

describe("emJanelaDeFup — a mesma fronteira de 5 h do disparo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const tarefaEm = (horas: number) => new Date(Date.now() + horas * 3_600_000 - 3 * 3_600_000).toISOString().slice(0, 19) + "-03:00";

  it("menos de 5 h = janela do FUP; mais de 5 h ou amanhã = janela do PréFUP", () => {
    vi.setSystemTime(new Date("2026-10-28T15:00:00-03:00"));
    expect(emJanelaDeFup(tarefaEm(2), "São Paulo/SP")).toBe(true);
    expect(emJanelaDeFup(tarefaEm(4.5), "São Paulo/SP")).toBe(true);
    expect(emJanelaDeFup(tarefaEm(5.5), "São Paulo/SP")).toBe(false);
    expect(emJanelaDeFup("2026-10-29T08:00:00-03:00", "São Paulo/SP")).toBe(false); // amanhã de manhã
  });
});

describe("garantirFasesConfirmacao — colunas, preenchimento do que já existe e gatilho", () => {
  it("cria as duas colunas, preenche pelo confirmado_via (com a data do contato) e é idempotente", async () => {
    const db = bancoAntigo();
    db.exec(`
      INSERT INTO chapas (id,id_tarefa,nome_chapa,status_contato,data_contato,canal_contato,confirmado_via) VALUES ('a',1,'A','confirmado','2026-10-28T12:00:00Z','umbler_talk','prefup');
      INSERT INTO chapas (id,id_tarefa,nome_chapa,status_contato,data_contato,canal_contato,confirmado_via) VALUES ('b',1,'B','confirmado','2026-10-28T13:00:00Z','umbler_talk','fup');
      INSERT INTO chapas (id,id_tarefa,nome_chapa,status_contato,data_contato,canal_contato,confirmado_via) VALUES ('c',1,'C','confirmado',NULL,'umbler_talk',NULL);
      INSERT INTO chapas (id,id_tarefa,nome_chapa,status_contato,data_contato,canal_contato,confirmado_via) VALUES ('d',1,'D','pendente',NULL,NULL,'prefup');
    `);
    await garantirFasesConfirmacao(adaptador(db));
    expect(linha(db, "a")).toMatchObject({ s: "confirmado", p: "2026-10-28T12:00:00Z", f: null });
    expect(linha(db, "b")).toMatchObject({ p: null, f: "2026-10-28T13:00:00Z" });
    expect(linha(db, "c")).toMatchObject({ p: null, f: null }); // confirmado sem fase conhecida
    expect(linha(db, "d")).toMatchObject({ p: null, f: null }); // pendente não ganha flag

    // 2ª abertura: nada muda (não refaz o preenchimento por cima do que o app gravou depois)
    db.prepare("UPDATE chapas SET fup_confirmado_em = 'DEPOIS' WHERE id = 'a'").run();
    await garantirFasesConfirmacao(adaptador(db));
    expect(linha(db, "a").f).toBe("DEPOIS");
  });

  it("gatilho: quando o chapa sai de 'confirmado' as flags somem; confirmado→confirmado mantém", async () => {
    const db = bancoAntigo();
    db.exec("INSERT INTO chapas (id,id_tarefa,nome_chapa,status_contato,data_contato,canal_contato,confirmado_via) VALUES ('a',1,'A','confirmado','2026-10-28T12:00:00Z','umbler_talk','prefup')");
    await garantirFasesConfirmacao(adaptador(db));
    db.prepare("UPDATE chapas SET fup_confirmado_em = 'F' WHERE id = 'a'").run();

    db.prepare("UPDATE chapas SET status_contato = 'confirmado', data_contato = 'x' WHERE id = 'a'").run();
    expect(linha(db, "a")).toMatchObject({ p: "2026-10-28T12:00:00Z", f: "F" });

    for (const novo of ["pendente", "cancelado", "removido", "nao_respondeu"]) {
      db.prepare("UPDATE chapas SET status_contato = 'confirmado', prefup_confirmado_em = 'P', fup_confirmado_em = 'F' WHERE id = 'a'").run();
      db.prepare("UPDATE chapas SET status_contato = ? WHERE id = 'a'").run(novo);
      expect(linha(db, "a")).toMatchObject({ s: novo, p: null, f: null });
    }
  });

  it("tabela chapas ainda inexistente: não faz nada nem lança (tenta de novo na próxima abertura)", async () => {
    const db = new DatabaseSync(":memory:");
    await expect(garantirFasesConfirmacao(adaptador(db))).resolves.toBeUndefined();
  });
});

describe("gravações das fases", () => {
  async function banco() {
    const db = bancoAntigo();
    await garantirFasesConfirmacao(adaptador(db));
    return db;
  }

  it("confirmarPorResposta: PréFUP marca só a do PréFUP; FUP e origem desconhecida marcam a do FUP", async () => {
    const db = await banco();
    db.exec("INSERT INTO chapas (id,id_tarefa,nome_chapa,status_contato,data_contato,canal_contato,confirmado_via) VALUES ('a',1,'A','pendente',NULL,'umbler_talk',NULL),('b',1,'B','pendente',NULL,'umbler_talk',NULL),('c',1,'C','pendente',NULL,'umbler_talk',NULL)");
    await confirmarPorResposta(adaptador(db), "a", "prefup", "T1");
    await confirmarPorResposta(adaptador(db), "b", "fup", "T2");
    await confirmarPorResposta(adaptador(db), "c", null, "T3");
    expect(linha(db, "a")).toEqual({ s: "confirmado", p: "T1", f: null, v: "prefup" });
    expect(linha(db, "b")).toEqual({ s: "confirmado", p: null, f: "T2", v: "fup" });
    expect(linha(db, "c")).toEqual({ s: "confirmado", p: null, f: "T3", v: null });
  });

  it("marcarFupDoReforco só marca com FUP disparado DEPOIS da confirmação do PréFUP, e uma vez", async () => {
    const db = await banco();
    db.exec(`
      INSERT INTO chapas (id,id_tarefa,nome_chapa,status_contato,data_contato,canal_contato,confirmado_via) VALUES ('a',1,'A','confirmado','2026-10-28T10:00:00Z','umbler_talk','prefup');
      UPDATE chapas SET prefup_confirmado_em = '2026-10-28T10:00:00Z' WHERE id = 'a';
      INSERT INTO fup_log VALUES ('f0',1,'umbler_talk','2026-10-28T09:00:00Z','a',1);
    `);
    // só o PréFUP (flag 1) existe até aqui: sem FUP depois, não marca
    expect(await marcarFupDoReforco(adaptador(db), "a", "2026-10-28T20:00:00Z")).toBe(false);
    expect(linha(db, "a").f).toBeNull();

    db.exec("INSERT INTO fup_log VALUES ('f1',1,'umbler_talk','2026-10-28T18:00:00Z','a',0)");
    expect(await marcarFupDoReforco(adaptador(db), "a", "2026-10-28T20:00:00Z")).toBe(true);
    expect(linha(db, "a")).toMatchObject({ s: "confirmado", p: "2026-10-28T10:00:00Z", f: "2026-10-28T20:00:00Z", v: "fup" });
    // notificação duplicada: não marca de novo
    expect(await marcarFupDoReforco(adaptador(db), "a", "2026-10-28T20:05:00Z")).toBe(false);
    expect(linha(db, "a").f).toBe("2026-10-28T20:00:00Z");
  });

  it("marcarFupDoReforco ignora chapa que não confirmou o PréFUP ou não está confirmado", async () => {
    const db = await banco();
    db.exec(`
      INSERT INTO chapas (id,id_tarefa,nome_chapa,status_contato,data_contato,canal_contato,confirmado_via) VALUES ('p',1,'P','pendente',NULL,'umbler_talk',NULL);
      INSERT INTO chapas (id,id_tarefa,nome_chapa,status_contato,data_contato,canal_contato,confirmado_via) VALUES ('s',1,'S','confirmado','2026-10-28T10:00:00Z','umbler_talk','fup');
      INSERT INTO fup_log VALUES ('f1',1,'umbler_talk','2026-10-28T18:00:00Z','p',0),('f2',1,'umbler_talk','2026-10-28T18:00:00Z','s',0);
    `);
    expect(await marcarFupDoReforco(adaptador(db), "p", "T")).toBe(false);
    expect(await marcarFupDoReforco(adaptador(db), "s", "T")).toBe(false);
  });

  it("atualizarChapa e confirmarManualEmLote caem pro UPDATE antigo se as colunas das fases não existirem", async () => {
    const db = bancoAntigo(); // sem garantirFasesConfirmacao: colunas ausentes
    db.exec("INSERT INTO chapas (id,id_tarefa,nome_chapa,status_contato,data_contato,canal_contato,confirmado_via) VALUES ('a',1,'A','pendente',NULL,NULL,NULL),('b',1,'B','pendente',NULL,NULL,NULL)");
    await atualizarChapa(adaptador(db), "a", { status_contato: "confirmado", data_contato: "D", fup_confirmado_em: "D" });
    expect(db.prepare("SELECT status_contato s, data_contato d FROM chapas WHERE id='a'").get()).toEqual({ s: "confirmado", d: "D" });
    await confirmarManualEmLote(adaptador(db), ["b"], "D2");
    expect(db.prepare("SELECT status_contato s, data_contato d FROM chapas WHERE id='b'").get()).toEqual({ s: "confirmado", d: "D2" });
    // erro que não é de coluna ausente continua sendo lançado
    await expect(atualizarChapa(adaptador(db), "a", { coluna_que_nao_existe: 1 })).rejects.toThrow();
  });

  it("confirmarManualEmLote marca a flag do FUP em todos (e desfazer pra pendente limpa pelo gatilho)", async () => {
    const db = await banco();
    db.exec("INSERT INTO chapas (id,id_tarefa,nome_chapa,status_contato,data_contato,canal_contato,confirmado_via) VALUES ('a',1,'A','pendente',NULL,NULL,NULL),('b',1,'B','pendente',NULL,NULL,NULL)");
    await confirmarManualEmLote(adaptador(db), ["a", "b"], "AGORA");
    expect(linha(db, "a")).toMatchObject({ s: "confirmado", p: null, f: "AGORA" });
    expect(linha(db, "b")).toMatchObject({ s: "confirmado", p: null, f: "AGORA" });
    db.prepare("UPDATE chapas SET status_contato = 'pendente' WHERE id = 'a'").run(); // o "desfazer" do app
    expect(linha(db, "a")).toMatchObject({ s: "pendente", f: null });
  });
});
