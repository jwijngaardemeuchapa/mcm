import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O sync de verdade (ingestTarefas) com SQLite real: quem é "chapa novo" depois de uma sincronização.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const h = vi.hoisted(() => ({ db: null as unknown as InstanceType<typeof DatabaseSync>, uuid: 0 }));

vi.mock("@/lib/db", () => ({
  getDb: async () => ({
    select: async (sql: string, p: unknown[] = []) => h.db.prepare(sql).all(...(p as never[])),
    execute: async (sql: string, p: unknown[] = []) => ({ rowsAffected: Number(h.db.prepare(sql).run(...(p as never[])).changes) }),
  }),
  uuid: () => `id${++h.uuid}`,
  placeholders: (n: number) => Array(n).fill("?").join(","),
}));

import { ingestTarefas } from "./ingestTarefas";

const SCHEMA = `
CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, data_tarefa TEXT, cidade_uf TEXT, empresa TEXT, cnpj TEXT, status_tarefa TEXT,
  quantidade_chapas INTEGER, ativo INTEGER, is_overnight INTEGER, importado_em TEXT, observacoes TEXT, observacoes_updated_at TEXT,
  validacao_status TEXT, data_validacao_recebida TEXT, data_upload_meu_chapa TEXT, obs_validacao TEXT,
  quantidade_chapas_original INTEGER, quantidade_chapas_em_andamento INTEGER); -- as 2 últimas só a beta lê/grava
CREATE TABLE chapas (id TEXT PRIMARY KEY, id_tarefa INTEGER, nome_chapa TEXT, telefone_chapa TEXT, cpf TEXT, status_contato TEXT,
  validacao_presenca TEXT, data_validacao TEXT, data_contato TEXT, canal_contato TEXT, confirmado_via TEXT, data_remocao TEXT, motivo_remocao TEXT);`;

type Linha = { tarefa?: number; nome?: string; cpf?: string; tel?: string; status?: string };
const linhas = (...ls: Linha[]) =>
  ls.map((l) => ({
    "ID Tarefa": l.tarefa ?? 100,
    "Data da Tarefa": "2026-10-30T10:00:00",
    Empresa: "ACME",
    "Status da Tarefa": l.status ?? "Aguardando Início",
    "Nome do Chapa": l.nome ?? "",
    CPF: l.cpf ?? "",
    "Telefone Chapa": l.tel ?? "",
  }));

const sync = async (...ls: Linha[]) => (await ingestTarefas(linhas(...ls))).chapasNovas.map((c) => c.nome_chapa);
const nomesNoBanco = (t = 100) =>
  (h.db.prepare("SELECT nome_chapa FROM chapas WHERE id_tarefa = ? ORDER BY nome_chapa").all(t) as { nome_chapa: string }[]).map((r) => r.nome_chapa);

beforeEach(() => {
  h.db = new DatabaseSync(":memory:");
  h.db.exec(SCHEMA);
  h.uuid = 0;
});
afterEach(() => vi.restoreAllMocks());

describe("sync — chapa novo na tarefa", () => {
  it("1º sync de uma tarefa é importação: todos entram e ninguém é novo", async () => {
    expect(await sync({ nome: "Ana" }, { nome: "Bia" })).toEqual([]);
    expect(nomesNoBanco()).toEqual(["Ana", "Bia"]);
  });

  it("tarefa já conhecida + nome que nunca apareceu → novo (e só nesse sync)", async () => {
    await sync({ nome: "Ana" }, { nome: "Bia" });
    expect(await sync({ nome: "Ana" }, { nome: "Bia" }, { nome: "Carla", tel: "(19) 99999-0003" })).toEqual(["Carla"]);
    expect(await sync({ nome: "Ana" }, { nome: "Bia" }, { nome: "Carla" })).toEqual([]); // sync seguinte: já estava
  });

  it("chapa que SAIU da tarefa e VOLTOU não é novo (o sync apaga quem some, o histórico lembra)", async () => {
    await sync({ nome: "Ana" }, { nome: "Bia" });
    expect(await sync({ nome: "Ana" }, { nome: "Bia" }, { nome: "Carla" })).toEqual(["Carla"]);
    await sync({ nome: "Ana" }, { nome: "Bia" }); // Carla saiu
    expect(nomesNoBanco()).toEqual(["Ana", "Bia"]);
    expect(await sync({ nome: "Ana" }, { nome: "Bia" }, { nome: "Carla" })).toEqual([]); // voltou
    expect(nomesNoBanco()).toEqual(["Ana", "Bia", "Carla"]);
  });

  it("até quem estava no banco ANTES do recurso existir conta como já visto (semeio no 1º sync)", async () => {
    h.db.exec("INSERT INTO tarefas (id_tarefa, data_tarefa, empresa, status_tarefa, ativo) VALUES (100, '2026-10-30T10:00:00-03:00', 'ACME', 'Aguardando Início', 1)");
    h.db.exec("INSERT INTO chapas (id, id_tarefa, nome_chapa, status_contato) VALUES ('velho', 100, 'Ana', 'pendente')");
    expect(await sync({ nome: "Bia" })).toEqual(["Bia"]); // Ana saiu; Bia é nova de verdade
    expect(await sync({ nome: "Bia" }, { nome: "Ana" })).toEqual([]); // Ana volta: já estava
  });

  it("tarefa conhecida que ainda não tinha chapas e passa a ter → todos são novos", async () => {
    await sync({ nome: "" }); // tarefa sem ninguém alocado
    expect(await sync({ nome: "Ana" }, { nome: "Bia" })).toEqual(["Ana", "Bia"]);
  });

  it("o histórico é por tarefa: o mesmo nome em outra tarefa conhecida é novo nela", async () => {
    await sync({ tarefa: 100, nome: "Ana" }, { tarefa: 200, nome: "Bia" });
    expect(await sync({ tarefa: 100, nome: "Ana" }, { tarefa: 200, nome: "Bia" }, { tarefa: 200, nome: "Ana" })).toEqual(["Ana"]);
  });

  it("CPF resolvido depois: o Metabase volta a mandar o chapa sem CPF e ele não vira novo", async () => {
    await sync({ nome: "Ana", cpf: "111.111.111-11" }, { nome: "Bia" });
    await sync({ nome: "Bia" }); // Ana sai
    expect(await sync({ nome: "Bia" }, { nome: "Ana" })).toEqual([]); // volta sem CPF
    expect(await sync({ nome: "Bia" }, { nome: "Ana", cpf: "111.111.111-11" })).toEqual([]); // e com CPF
  });

  it("homônimo com CPF diferente é outra pessoa", async () => {
    await sync({ nome: "João Silva", cpf: "111.111.111-11" });
    expect(await sync({ nome: "João Silva", cpf: "111.111.111-11" }, { nome: "João Silva", cpf: "222.222.222-22" })).toEqual(["João Silva"]);
  });

  it("tarefa já em andamento: o chapa novo entra confirmado (e é devolvido; quem dispara filtra por pendente)", async () => {
    await sync({ nome: "Ana", status: "Em Andamento" });
    const novos = await ingestTarefas(linhas({ nome: "Ana", status: "Em Andamento" }, { nome: "Bia", status: "Em Andamento" }));
    expect(novos.chapasNovas.map((c) => c.nome_chapa)).toEqual(["Bia"]);
    expect((h.db.prepare("SELECT status_contato s FROM chapas WHERE nome_chapa = 'Bia'").get() as { s: string }).s).toBe("confirmado");
  });

  it("devolve o id do chapa gravado (pra quem dispara achar a linha)", async () => {
    await sync({ nome: "Ana" });
    const r = await ingestTarefas(linhas({ nome: "Ana" }, { nome: "Bia" }));
    const gravado = h.db.prepare("SELECT id FROM chapas WHERE nome_chapa = 'Bia'").get() as { id: string };
    expect(r.chapasNovas).toEqual([{ id: gravado.id, id_tarefa: 100, nome_chapa: "Bia" }]);
  });
});

describe("sync — aviso 'chapas:novos'", () => {
  it("emite o evento com os novos; planilha importada na mão (semFupAutomatico) não emite, mas registra", async () => {
    await sync({ nome: "Ana" });
    const ouvinte = vi.fn();
    window.addEventListener("chapas:novos", ouvinte);
    try {
      await ingestTarefas(linhas({ nome: "Ana" }, { nome: "Bia" }), { semFupAutomatico: true });
      expect(ouvinte).not.toHaveBeenCalled();

      await ingestTarefas(linhas({ nome: "Ana" }, { nome: "Bia" }, { nome: "Carla" }));
      expect(ouvinte).toHaveBeenCalledTimes(1);
      const detail = (ouvinte.mock.calls[0][0] as CustomEvent).detail as { chapas: { nome_chapa: string }[] };
      expect(detail.chapas.map((c) => c.nome_chapa)).toEqual(["Carla"]); // Bia já foi vista na importação manual
    } finally {
      window.removeEventListener("chapas:novos", ouvinte);
    }
  });

  it("sem chapa novo não emite nada", async () => {
    await sync({ nome: "Ana" });
    const ouvinte = vi.fn();
    window.addEventListener("chapas:novos", ouvinte);
    try {
      await sync({ nome: "Ana" });
      expect(ouvinte).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("chapas:novos", ouvinte);
    }
  });
});

describe("sync — nunca quebra por causa do histórico", () => {
  it("se a tabela de histórico está inutilizável, o sync segue normal e ninguém é tratado como novo", async () => {
    h.db.exec("CREATE TABLE chapas_vistos (x TEXT)"); // existe, mas sem as colunas esperadas
    await sync({ nome: "Ana" });
    const novos = await sync({ nome: "Ana" }, { nome: "Bia" });
    expect(novos).toEqual([]);
    expect(nomesNoBanco()).toEqual(["Ana", "Bia"]);
  });
});
