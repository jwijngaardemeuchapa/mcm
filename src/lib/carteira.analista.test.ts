import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const h = vi.hoisted(() => ({ db: null as unknown as InstanceType<typeof DatabaseSync>, grupos: [] as string[] }));

vi.mock("./db", () => ({
  getDb: async () => ({ select: async (sql: string, p: unknown[] = []) => h.db.prepare(sql).all(...(p as never[])) }),
}));
vi.mock("./settings", () => ({ readSettings: () => ({ carteiraGruposAtivos: h.grupos }) }));

import { getCarteiraDoAnalista } from "./carteira";

beforeEach(() => {
  h.db = new DatabaseSync(":memory:");
  h.db.exec(`CREATE TABLE carteira (nome_fantasia TEXT, grupo TEXT); CREATE TABLE empresa_config (nome_fantasia TEXT, fixar_visivel INTEGER);`);
  const ins = h.db.prepare("INSERT INTO carteira VALUES (?,?)");
  ins.run("Alfa", "G1");
  ins.run("Beta", "G2");
  ins.run("Gama", null);
  h.grupos = [];
});

describe("getCarteiraDoAnalista — as empresas que o Dashboard mostra", () => {
  it("sem filtro de grupos: TODAS as da carteira (ao contrário de getActiveCarteiraNames)", async () => {
    expect((await getCarteiraDoAnalista()).sort()).toEqual(["Alfa", "Beta", "Gama"]);
  });

  it("com grupo ativo: só as desse grupo", async () => {
    h.grupos = ["G1"];
    expect(await getCarteiraDoAnalista()).toEqual(["Alfa"]);
  });

  it("empresa fixada como visível entra mesmo fora do grupo", async () => {
    h.grupos = ["G1"];
    h.db.prepare("INSERT INTO empresa_config VALUES (?,?)").run("Gama", 1);
    expect((await getCarteiraDoAnalista()).sort()).toEqual(["Alfa", "Gama"]);
  });

  it("grupo que não casa com nada: volta pra todas (mesma semântica do Dashboard)", async () => {
    h.grupos = ["G9"];
    expect((await getCarteiraDoAnalista()).sort()).toEqual(["Alfa", "Beta", "Gama"]);
  });

  it("sem a tabela de configuração de empresa, o filtro por grupo ainda funciona", async () => {
    h.db.exec("DROP TABLE empresa_config");
    h.grupos = ["G2"];
    expect(await getCarteiraDoAnalista()).toEqual(["Beta"]);
  });

  it("carteira vazia: [] (sem restrição)", async () => {
    h.db.exec("DELETE FROM carteira");
    expect(await getCarteiraDoAnalista()).toEqual([]);
  });

  it("se a tabela da carteira não existe: lança (quem decide automático não deve agir)", async () => {
    h.db.exec("DROP TABLE carteira");
    await expect(getCarteiraDoAnalista()).rejects.toThrow();
  });
});
