import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  estaEmOferta, garantirColunasDaTarefa, lerSimNao, linhaTipoRemessaPlanilha, remessaCurta, resumoDaTarefa, tarefaCasaBusca, textoOuNulo,
} from "./tarefaExtras";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

describe("lerSimNao", () => {
  it("aceita boolean, número e os textos que o Metabase devolve", () => {
    for (const v of [true, 1, "true", "TRUE", "Sim", "sim", "S", "1", "yes", "verdadeiro", " true "]) expect(lerSimNao(v)).toBe(true);
    for (const v of [false, 0, "false", "Não", "nao", "0", "", null, undefined, "talvez"]) expect(lerSimNao(v)).toBe(false);
  });
});

describe("textoOuNulo e remessaCurta", () => {
  it("apara; vazio e nulo viram null", () => {
    expect(textoOuNulo("  CTE 123 ")).toBe("CTE 123");
    expect(textoOuNulo("   ")).toBeNull();
    expect(textoOuNulo(null)).toBeNull();
  });

  it("remessa curta: limita com reticências e junta espaços; curta fica como está", () => {
    expect(remessaCurta("INDICADO")).toBe("INDICADO");
    expect(remessaCurta("CTE  35260 e   container MSKU1234567", 20)).toBe("CTE 35260 e contain…");
    expect(remessaCurta("CTE  35260 e   container MSKU1234567", 20)).toHaveLength(20);
  });
});

describe("estaEmOferta / resumoDaTarefa / linha da planilha", () => {
  it("em_oferta: 1 ou true; 0, null e ausente não", () => {
    expect(estaEmOferta({ em_oferta: 1 })).toBe(true);
    expect(estaEmOferta({ em_oferta: true })).toBe(true);
    expect(estaEmOferta({ em_oferta: 0 })).toBe(false);
    expect(estaEmOferta({ em_oferta: null })).toBe(false);
    expect(estaEmOferta({})).toBe(false);
  });

  it("resumo: tipo e remessa curta; só o que existir", () => {
    expect(resumoDaTarefa({ tipo_trabalho: "Descarga", remessa: "CTE 123" })).toBe("Descarga · Remessa CTE 123");
    expect(resumoDaTarefa({ tipo_trabalho: "Descarga", remessa: null })).toBe("Descarga");
    expect(resumoDaTarefa({ remessa: "  " })).toBe("");
    expect(resumoDaTarefa({ remessa: "A".repeat(40) }, 10)).toBe("Remessa AAAAAAAAA…");
  });

  it("planilha: a linha só existe com tipo ou remessa (senão fica a linha vazia de sempre)", () => {
    expect(linhaTipoRemessaPlanilha({})).toEqual([]);
    expect(linhaTipoRemessaPlanilha({ tipo_trabalho: "Carga" })).toEqual(["Tipo de trabalho:", "Carga", "", "Remessa:", "", ""]);
    expect(linhaTipoRemessaPlanilha({ remessa: "CTE 9" })).toEqual(["Tipo de trabalho:", "", "", "Remessa:", "CTE 9", ""]);
  });
});

describe("tarefaCasaBusca", () => {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  it("acha por remessa ou tipo, sem acento nem caixa; busca vazia não casa", () => {
    const t = { remessa: "CTE 35260-ABC", tipo_trabalho: "Descarga Paletizada" };
    expect(tarefaCasaBusca(t, "35260", norm)).toBe(true);
    expect(tarefaCasaBusca(t, "paletizada", norm)).toBe(true);
    expect(tarefaCasaBusca(t, "cte", norm)).toBe(true);
    expect(tarefaCasaBusca(t, "xyz", norm)).toBe(false);
    expect(tarefaCasaBusca(t, "", norm)).toBe(false);
    expect(tarefaCasaBusca({}, "cte", norm)).toBe(false);
  });
});

describe("garantirColunasDaTarefa", () => {
  const adaptador = (db: InstanceType<typeof DatabaseSync>, falhaAlter = false) => ({
    select: async <T>(sql: string) => db.prepare(sql).all() as T,
    execute: async (sql: string) => {
      if (falhaAlter && /ALTER TABLE/.test(sql)) throw new Error("banco ocupado");
      return { rowsAffected: Number(db.prepare(sql).run().changes) };
    },
  });
  const colunas = (db: InstanceType<typeof DatabaseSync>) => (db.prepare("PRAGMA table_info(tarefas)").all() as { name: string }[]).map((c) => c.name);

  it("cria as quatro colunas; chamar de novo não muda nada (e não apaga o que existe)", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, empresa TEXT)");
    db.exec("INSERT INTO tarefas (id_tarefa, empresa) VALUES (1, 'ACME')");
    expect(await garantirColunasDaTarefa(adaptador(db))).toBe(true);
    expect(colunas(db)).toEqual(expect.arrayContaining(["remessa", "tipo_trabalho", "em_oferta", "chapa_em_oferta"]));
    db.exec("UPDATE tarefas SET remessa = 'CTE 1', em_oferta = 1");
    expect(await garantirColunasDaTarefa(adaptador(db))).toBe(true);
    expect(db.prepare("SELECT remessa, em_oferta FROM tarefas").get()).toEqual({ remessa: "CTE 1", em_oferta: 1 });
  });

  it("tarefa antiga ganha em_oferta = 0 (nunca nulo)", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, empresa TEXT)");
    db.exec("INSERT INTO tarefas (id_tarefa, empresa) VALUES (1, 'ACME')");
    await garantirColunasDaTarefa(adaptador(db));
    expect((db.prepare("SELECT em_oferta FROM tarefas").get() as { em_oferta: number }).em_oferta).toBe(0);
  });

  it("sem a tabela: false e nada é criado", async () => {
    const db = new DatabaseSync(":memory:");
    expect(await garantirColunasDaTarefa(adaptador(db))).toBe(false);
  });

  it("ALTER que falha: devolve false sem lançar (quem chama segue sem as colunas)", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, empresa TEXT)");
    expect(await garantirColunasDaTarefa(adaptador(db, true))).toBe(false);
  });

  it("duas chamadas ao mesmo tempo (abertura do banco x sync) não quebram", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE tarefas (id_tarefa INTEGER PRIMARY KEY, empresa TEXT)");
    const a = adaptador(db);
    const r = await Promise.all([garantirColunasDaTarefa(a), garantirColunasDaTarefa(a)]);
    expect(r).toEqual([true, true]);
  });
});
