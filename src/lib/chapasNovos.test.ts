import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";
import {
  analisarAvistamentos, carregarVistos, garantirChapasVistos, jaVisto, normCpfChapa, normNomeChapa, registrarVistos, type Vistos,
} from "./chapasNovos";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const av = (id_tarefa: number, nome: string, cpf = "") => ({ id_tarefa, nome: normNomeChapa(nome), cpf: normCpfChapa(cpf) });
const it_ = (id_tarefa: number, nome: string, cpf = "", podeSerNovo = true) => ({ ...av(id_tarefa, nome, cpf), podeSerNovo });

describe("normalização", () => {
  it("nome: minúsculo, sem espaço sobrando; CPF: só dígitos", () => {
    expect(normNomeChapa("  João   da  SILVA ")).toBe("joão da silva");
    expect(normNomeChapa(null)).toBe("");
    expect(normCpfChapa("123.456.789-09")).toBe("12345678909");
  });
});

describe("analisarAvistamentos — quem é novo", () => {
  it("nome nunca visto na tarefa → novo; já visto → não; e registra os dois", () => {
    const vistos: Vistos = new Map();
    analisarAvistamentos(vistos, [it_(1, "Ana", "", false)]); // Ana já estava
    const { novos, linhas } = analisarAvistamentos(vistos, [it_(1, "Ana"), it_(1, "Bia")]);
    expect(novos).toEqual([1]);
    expect(linhas).toEqual([av(1, "Bia")]);
  });

  it("o histórico é por tarefa: o mesmo nome em outra tarefa é novo lá", () => {
    const vistos: Vistos = new Map();
    analisarAvistamentos(vistos, [it_(1, "Ana", "", false)]);
    expect(analisarAvistamentos(vistos, [it_(2, "Ana")]).novos).toEqual([0]);
  });

  it("podeSerNovo=false (chapa já estava no banco / tarefa recém-chegada): registra mas não é novo", () => {
    const vistos: Vistos = new Map();
    const { novos, linhas } = analisarAvistamentos(vistos, [it_(1, "Ana", "", false)]);
    expect(novos).toEqual([]);
    expect(linhas).toHaveLength(1);
    expect(jaVisto(vistos, av(1, "Ana"))).toBe(true);
  });

  it("o mesmo chapa duas vezes na mesma leva conta uma vez", () => {
    const { novos, linhas } = analisarAvistamentos(new Map(), [it_(1, "Ana"), it_(1, "ana  ")]);
    expect(novos).toEqual([0]);
    expect(linhas).toHaveLength(1);
  });

  it("linha vazia (sem nome) é ignorada", () => {
    const { novos, linhas } = analisarAvistamentos(new Map(), [it_(1, "  ")]);
    expect(novos).toEqual([]);
    expect(linhas).toEqual([]);
  });

  describe("CPF resolvido localmente depois", () => {
    it("visto COM CPF; volta SEM CPF (Metabase não manda) → não é novo", () => {
      const vistos: Vistos = new Map();
      analisarAvistamentos(vistos, [it_(1, "Ana", "111.111.111-11", false)]);
      expect(analisarAvistamentos(vistos, [it_(1, "Ana")]).novos).toEqual([]);
    });

    it("visto SEM CPF; volta COM CPF → não é novo", () => {
      const vistos: Vistos = new Map();
      analisarAvistamentos(vistos, [it_(1, "Ana", "", false)]);
      expect(analisarAvistamentos(vistos, [it_(1, "Ana", "111.111.111-11")]).novos).toEqual([]);
    });

    it("visto com o mesmo CPF e nome diferente (nome corrigido) → não é novo", () => {
      const vistos: Vistos = new Map();
      analisarAvistamentos(vistos, [it_(1, "Ana Silva", "11111111111", false)]);
      expect(analisarAvistamentos(vistos, [it_(1, "Ana S. Silva", "11111111111")]).novos).toEqual([]);
    });

    it("homônimo com CPF DIFERENTE é outra pessoa → novo", () => {
      const vistos: Vistos = new Map();
      analisarAvistamentos(vistos, [it_(1, "João Silva", "11111111111", false)]);
      expect(analisarAvistamentos(vistos, [it_(1, "João Silva", "22222222222")]).novos).toEqual([0]);
    });

    it("não grava linha redundante: nome sem CPF já conhecido não ganha linha nova", () => {
      const vistos: Vistos = new Map();
      analisarAvistamentos(vistos, [it_(1, "Ana", "11111111111", false)]);
      expect(analisarAvistamentos(vistos, [it_(1, "Ana")]).linhas).toEqual([]);
    });
  });
});

/* ── banco real ────────────────────────────────────────────────────────────── */

function adaptador(db: InstanceType<typeof DatabaseSync>, falhaEm?: RegExp) {
  return {
    select: async <T>(sql: string, p: unknown[] = []) => db.prepare(sql).all(...(p as never[])) as T,
    execute: async (sql: string, p: unknown[] = []) => {
      if (falhaEm?.test(sql)) throw new Error("falha simulada");
      return { rowsAffected: Number(db.prepare(sql).run(...(p as never[])).changes) };
    },
  };
}

let db: InstanceType<typeof DatabaseSync>;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE chapas (id TEXT PRIMARY KEY, id_tarefa INTEGER, nome_chapa TEXT, cpf TEXT)");
});
const tabelaExiste = () => db.prepare("SELECT name FROM sqlite_master WHERE name = 'chapas_vistos'").all().length > 0;

describe("garantirChapasVistos — semeio com quem já está nas tarefas", () => {
  it("cria a tabela e semeia com os chapas atuais (com e sem CPF); vazios ficam de fora", async () => {
    db.prepare("INSERT INTO chapas VALUES (?,?,?,?)").run("a", 1, "Ana Silva", "111.111.111-11");
    db.prepare("INSERT INTO chapas VALUES (?,?,?,?)").run("b", 1, "Bia", null);
    db.prepare("INSERT INTO chapas VALUES (?,?,?,?)").run("c", 2, "", null);
    await garantirChapasVistos(adaptador(db));

    const vistos = await carregarVistos(adaptador(db), [1, 2]);
    expect(jaVisto(vistos, av(1, "ana silva", "11111111111"))).toBe(true);
    expect(jaVisto(vistos, av(1, "Bia"))).toBe(true);
    expect(jaVisto(vistos, av(1, "Carla"))).toBe(false);
    expect(vistos.get(2)).toBeUndefined();
  });

  it("só semeia na criação: chamar de novo não refaz (nem apaga) nada", async () => {
    db.prepare("INSERT INTO chapas VALUES (?,?,?,?)").run("a", 1, "Ana", null);
    await garantirChapasVistos(adaptador(db));
    db.prepare("DELETE FROM chapas").run(); // Ana saiu da tarefa
    db.prepare("INSERT INTO chapas VALUES (?,?,?,?)").run("z", 1, "Zé", null);
    await garantirChapasVistos(adaptador(db));

    const vistos = await carregarVistos(adaptador(db), [1]);
    expect(jaVisto(vistos, av(1, "Ana"))).toBe(true); // continua lembrada
    expect(jaVisto(vistos, av(1, "Zé"))).toBe(false); // não foi semeado depois
  });

  it("sem a tabela de chapas (banco ainda sem migration): falha e NÃO cria a tabela", async () => {
    const vazio = new DatabaseSync(":memory:");
    await expect(garantirChapasVistos(adaptador(vazio))).rejects.toThrow();
    expect(vazio.prepare("SELECT name FROM sqlite_master WHERE name = 'chapas_vistos'").all()).toHaveLength(0);
  });

  it("semeio que falha desfaz a tabela (pra tentar de novo, em vez de ficar pela metade)", async () => {
    db.prepare("INSERT INTO chapas VALUES (?,?,?,?)").run("a", 1, "Ana", null);
    await expect(garantirChapasVistos(adaptador(db, /INSERT OR IGNORE INTO chapas_vistos/))).rejects.toThrow("falha simulada");
    expect(tabelaExiste()).toBe(false);
    await garantirChapasVistos(adaptador(db)); // próxima tentativa funciona
    expect(tabelaExiste()).toBe(true);
  });

  it("semeia em lotes (mais de 150 chapas)", async () => {
    const ins = db.prepare("INSERT INTO chapas VALUES (?,?,?,?)");
    for (let i = 0; i < 400; i++) ins.run(`c${i}`, 1 + (i % 3), `Chapa ${i}`, null);
    await garantirChapasVistos(adaptador(db));
    expect((db.prepare("SELECT COUNT(*) n FROM chapas_vistos").get() as { n: number }).n).toBe(400);
  });
});

describe("registrarVistos / carregarVistos", () => {
  it("é idempotente (INSERT OR IGNORE) e devolve o que foi gravado", async () => {
    await garantirChapasVistos(adaptador(db));
    await registrarVistos(adaptador(db), [av(7, "Ana", "111"), av(7, "Bia")]);
    await registrarVistos(adaptador(db), [av(7, "Ana", "111")]);
    expect((db.prepare("SELECT COUNT(*) n FROM chapas_vistos").get() as { n: number }).n).toBe(2);
    const vistos = await carregarVistos(adaptador(db), [7]);
    expect(jaVisto(vistos, av(7, "Ana", "111"))).toBe(true);
    expect(jaVisto(vistos, av(7, "Bia"))).toBe(true);
  });
});
