import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

// O sync de verdade com SQLite real: tipo de trabalho, remessa e oferta a chapa dirigido.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const h = vi.hoisted(() => ({ db: null as unknown as InstanceType<typeof DatabaseSync>, uuid: 0, falhaAlter: false }));

vi.mock("@/lib/db", () => ({
  getDb: async () => ({
    select: async (sql: string, p: unknown[] = []) => h.db.prepare(sql).all(...(p as never[])),
    execute: async (sql: string, p: unknown[] = []) => {
      if (h.falhaAlter && /ALTER TABLE tarefas/.test(sql)) throw new Error("banco ocupado");
      return { rowsAffected: Number(h.db.prepare(sql).run(...(p as never[])).changes) };
    },
  }),
  uuid: () => `id${++h.uuid}`,
  placeholders: (n: number) => Array(n).fill("?").join(","),
}));

import { ingestTarefas } from "./ingestTarefas";

const TAREFAS = `CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, data_tarefa TEXT, cidade_uf TEXT, empresa TEXT, cnpj TEXT, status_tarefa TEXT,
  quantidade_chapas INTEGER, ativo INTEGER, is_overnight INTEGER, importado_em TEXT, observacoes TEXT, observacoes_updated_at TEXT,
  validacao_status TEXT, data_validacao_recebida TEXT, data_upload_meu_chapa TEXT, obs_validacao TEXT,
  quantidade_chapas_original INTEGER, quantidade_chapas_em_andamento INTEGER)`;
const COLUNAS_EXTRAS = ", remessa TEXT, tipo_trabalho TEXT, em_oferta INTEGER NOT NULL DEFAULT 0, chapa_em_oferta TEXT";
const CHAPAS = `CREATE TABLE chapas (id TEXT PRIMARY KEY, id_tarefa INTEGER, nome_chapa TEXT, telefone_chapa TEXT, cpf TEXT, status_contato TEXT,
  validacao_presenca TEXT, data_validacao TEXT, data_contato TEXT, canal_contato TEXT, confirmado_via TEXT, data_remocao TEXT, motivo_remocao TEXT)`;

function banco(comColunasExtras: boolean) {
  h.db = new DatabaseSync(":memory:");
  h.db.exec(comColunasExtras ? TAREFAS.replace(/\)$/, `${COLUNAS_EXTRAS})`) : TAREFAS);
  h.db.exec(CHAPAS);
}

type Linha = Record<string, unknown>;
const linha = (extra: Linha = {}): Linha => ({
  "ID Tarefa": 100, "Data da Tarefa": "2026-11-20T10:00:00", Empresa: "ACME", "Status da Tarefa": "Aguardando Início", "Quantidade de Chapas": 2, ...extra,
});
const tarefa = (id = 100) =>
  h.db.prepare("SELECT remessa, tipo_trabalho, em_oferta, chapa_em_oferta FROM tarefas WHERE id_tarefa = ?").get(id) as {
    remessa: string | null; tipo_trabalho: string | null; em_oferta: number; chapa_em_oferta: string | null;
  };

beforeEach(() => {
  banco(true);
  h.uuid = 0;
  h.falhaAlter = false;
});

describe("sync — tipo de trabalho, remessa e oferta", () => {
  it("grava as quatro informações lidas por NOME de coluna", async () => {
    await ingestTarefas([linha({ Remessa: "CTE 35260", "Tipo de Trabalho": "Descarga", "Em Oferta": true, "Chapa em Oferta": "João Silva" })]);
    expect(tarefa()).toEqual({ remessa: "CTE 35260", tipo_trabalho: "Descarga", em_oferta: 1, chapa_em_oferta: "João Silva" });
  });

  it("a ordem das colunas não importa (as novas entram no fim do card, mas podem vir em qualquer posição)", async () => {
    await ingestTarefas([{ "Em Oferta": "true", Remessa: "R1", "Nome do Chapa": "", ...linha({ "Tipo de Trabalho": "Carga" }) }]);
    expect(tarefa()).toMatchObject({ remessa: "R1", tipo_trabalho: "Carga", em_oferta: 1 });
  });

  it("tarefa em oferta não tem chapa alocado: continua sem chapas (vaga aberta)", async () => {
    await ingestTarefas([linha({ "Nome do Chapa": "", "Em Oferta": true, "Chapa em Oferta": "João Silva" })]);
    expect((h.db.prepare("SELECT COUNT(*) n FROM chapas").get() as { n: number }).n).toBe(0);
    expect(tarefa().em_oferta).toBe(1);
  });

  it("'Em Oferta' aceita boolean, 'true', 'Sim' e 1; falso e vazio ficam 0", async () => {
    for (const [i, valor] of [true, "true", "Sim", 1].entries()) {
      await ingestTarefas([linha({ "ID Tarefa": 200 + i, "Em Oferta": valor })]);
      expect(tarefa(200 + i).em_oferta).toBe(1);
    }
    for (const [i, valor] of [false, "false", "Não", 0, ""].entries()) {
      await ingestTarefas([linha({ "ID Tarefa": 300 + i, "Em Oferta": valor })]);
      expect(tarefa(300 + i).em_oferta).toBe(0);
    }
  });

  it("várias linhas da mesma tarefa: vale o 1º valor preenchido (e 'em oferta' se alguma linha for)", async () => {
    await ingestTarefas([
      linha({ "Nome do Chapa": "Ana", Remessa: "", "Tipo de Trabalho": "" }),
      linha({ "Nome do Chapa": "Bia", Remessa: "CTE 9", "Tipo de Trabalho": "Descarga", "Em Oferta": false }),
      linha({ "Nome do Chapa": "", "Em Oferta": true, "Chapa em Oferta": "Caio" }),
    ]);
    expect(tarefa()).toEqual({ remessa: "CTE 9", tipo_trabalho: "Descarga", em_oferta: 1, chapa_em_oferta: "Caio" });
  });

  it("o sync seguinte NÃO apaga (INSERT OR REPLACE) e acompanha mudanças: a oferta some quando o chapa aceita", async () => {
    await ingestTarefas([linha({ Remessa: "CTE 1", "Tipo de Trabalho": "Descarga", "Em Oferta": true, "Chapa em Oferta": "João" })]);
    await ingestTarefas([linha({ Remessa: "CTE 1", "Tipo de Trabalho": "Descarga", "Em Oferta": true, "Chapa em Oferta": "João" })]);
    expect(tarefa()).toMatchObject({ remessa: "CTE 1", em_oferta: 1 });
    await ingestTarefas([linha({ "Nome do Chapa": "João", Remessa: "CTE 1", "Tipo de Trabalho": "Descarga", "Em Oferta": false, "Chapa em Oferta": "" })]);
    expect(tarefa()).toEqual({ remessa: "CTE 1", tipo_trabalho: "Descarga", em_oferta: 0, chapa_em_oferta: null });
  });

  it("coluna presente e vazia limpa o valor (a remessa foi apagada no sistema)", async () => {
    await ingestTarefas([linha({ Remessa: "CTE 1", "Tipo de Trabalho": "Descarga" })]);
    await ingestTarefas([linha({ Remessa: "", "Tipo de Trabalho": "Descarga" })]);
    expect(tarefa().remessa).toBeNull();
    expect(tarefa().tipo_trabalho).toBe("Descarga");
  });

  it("fonte SEM as colunas (CSV antigo, Central) preserva o que já estava gravado", async () => {
    await ingestTarefas([linha({ Remessa: "CTE 1", "Tipo de Trabalho": "Descarga", "Em Oferta": true, "Chapa em Oferta": "João" })]);
    await ingestTarefas([linha()]); // sem nenhuma das colunas novas
    expect(tarefa()).toEqual({ remessa: "CTE 1", tipo_trabalho: "Descarga", em_oferta: 1, chapa_em_oferta: "João" });
  });

  it("fonte com só ALGUMAS das colunas: as ausentes preservam, as presentes atualizam", async () => {
    await ingestTarefas([linha({ Remessa: "CTE 1", "Tipo de Trabalho": "Descarga" })]);
    await ingestTarefas([linha({ "Tipo de Trabalho": "Carga" })]); // sem Remessa
    expect(tarefa()).toMatchObject({ remessa: "CTE 1", tipo_trabalho: "Carga" });
  });

  it("aceita 'Shipping' como nome da remessa (o mesmo que o Consultor lê)", async () => {
    await ingestTarefas([linha({ Shipping: "INDICADO" })]);
    expect(tarefa().remessa).toBe("INDICADO");
  });

  it("não mexe no resto da tarefa (observações e validação seguem preservadas)", async () => {
    await ingestTarefas([linha({ Remessa: "CTE 1" })]);
    h.db.exec("UPDATE tarefas SET observacoes = 'obs do analista' WHERE id_tarefa = 100");
    await ingestTarefas([linha({ Remessa: "CTE 2" })]);
    expect((h.db.prepare("SELECT observacoes FROM tarefas").get() as { observacoes: string }).observacoes).toBe("obs do analista");
    expect(tarefa().remessa).toBe("CTE 2");
  });

  it("muitas tarefas de uma vez (lotes de 40): todas gravadas", async () => {
    const rows = Array.from({ length: 95 }, (_, i) => linha({ "ID Tarefa": 1000 + i, Remessa: `R${i}`, "Em Oferta": i % 2 === 0 }));
    const r = await ingestTarefas(rows);
    expect(r.tarefas).toBe(95);
    expect(tarefa(1094)).toMatchObject({ remessa: "R94", em_oferta: 1 });
    expect(tarefa(1093)).toMatchObject({ remessa: "R93", em_oferta: 0 });
  });
});

describe("sync — banco sem as colunas", () => {
  it("cria as colunas sozinho e grava (atualização do app sobre um banco antigo)", async () => {
    banco(false);
    await ingestTarefas([linha({ Remessa: "CTE 1", "Em Oferta": true })]);
    expect(tarefa()).toMatchObject({ remessa: "CTE 1", em_oferta: 1 });
  });

  it("se não der pra criar as colunas, o sync continua funcionando sem elas", async () => {
    banco(false);
    h.falhaAlter = true;
    const r = await ingestTarefas([linha({ Remessa: "CTE 1", "Em Oferta": true, "Nome do Chapa": "Ana" })]);
    expect(r.tarefas).toBe(1);
    expect((h.db.prepare("SELECT COUNT(*) n FROM tarefas").get() as { n: number }).n).toBe(1);
    expect((h.db.prepare("SELECT COUNT(*) n FROM chapas").get() as { n: number }).n).toBe(1);
  });
});

describe("sync — nome da coluna tolerante e diagnóstico do que o card trouxe", () => {
  beforeEach(() => localStorage.clear());

  it("aceita grafias diferentes (caixa, acento, espaço, '_')", async () => {
    await ingestTarefas([{ ...linha(), REMESSA: "CTE 7", "tipo de trabalho": "Carga", em_oferta: "Sim", "chapa em oferta": "Ana" }]);
    expect(tarefa()).toEqual({ remessa: "CTE 7", tipo_trabalho: "Carga", em_oferta: 1, chapa_em_oferta: "Ana" });
  });

  it("registra o diagnóstico: colunas recebidas e quais das quatro vieram", async () => {
    await ingestTarefas([linha({ Remessa: "R1", "Em Oferta": false })]);
    const d = JSON.parse(localStorage.getItem("mcm_metabase_colunas")!);
    expect(d.origem).toBe("metabase");
    expect(d.colunas).toContain("Remessa");
    expect(d.achadas).toEqual({ remessa: "Remessa", tipo_trabalho: null, em_oferta: "Em Oferta", chapa_em_oferta: null, criada_em: null });
  });

  it("card que NÃO traz as colunas fica registrado como faltando (e o gravado é preservado)", async () => {
    await ingestTarefas([linha({ Remessa: "R1", "Tipo de Trabalho": "Descarga" })]);
    await ingestTarefas([linha()]); // o card deixou de trazer
    const d = JSON.parse(localStorage.getItem("mcm_metabase_colunas")!);
    expect(d.achadas).toEqual({ remessa: null, tipo_trabalho: null, em_oferta: null, chapa_em_oferta: null, criada_em: null });
    expect(tarefa()).toMatchObject({ remessa: "R1", tipo_trabalho: "Descarga" });
  });

  it("importação de planilha (semFupAutomatico) não sobrescreve o retrato do Metabase", async () => {
    await ingestTarefas([linha({ Remessa: "R1" })]);
    await ingestTarefas([linha()], { semFupAutomatico: true });
    expect(JSON.parse(localStorage.getItem("mcm_metabase_colunas")!).origem).toBe("metabase");
  });
});

describe("sync — data de criação da tarefa (seção Em análise)", () => {
  const criada = (id = 100) =>
    (h.db.prepare("SELECT criada_em FROM tarefas WHERE id_tarefa = ?").get(id) as { criada_em: string | null }).criada_em;

  it("lê 'Data de Criação' por nome de coluna e grava em ISO (fuso de Brasília)", async () => {
    await ingestTarefas([linha({ "Data de Criação": "2026-11-18T09:30:00" })]);
    expect(criada()).toBe("2026-11-18T09:30:00-03:00");
  });

  it("aceita o formato do export do Metabase ('November 18, 2026, 9:30 AM')", async () => {
    await ingestTarefas([linha({ "Criada em": "November 18, 2026, 9:30 AM" })]);
    expect(criada()).toBe("2026-11-18T09:30:00-03:00");
  });

  it("card que não traz a coluna preserva a data já gravada; sem nada gravado fica vazia", async () => {
    await ingestTarefas([linha()]);
    expect(criada()).toBeNull();
    await ingestTarefas([linha({ "Data de Criação": "2026-11-18T09:30:00" })]);
    await ingestTarefas([linha()]); // o card deixou de trazer
    expect(criada()).toBe("2026-11-18T09:30:00-03:00");
  });
});
