import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";
import { mensagemDeSubstituicao, removerChapaDoAlarme, restaurarChapa } from "./alarmeAcoes";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
let db: InstanceType<typeof DatabaseSync>;
const banco = () => ({
  select: async <T>(sql: string, p: unknown[] = []) => db.prepare(sql).all(...(p as never[])) as T,
  execute: async (sql: string, p: unknown[] = []) => ({ rowsAffected: Number(db.prepare(sql).run(...(p as never[])).changes) }),
});
const linha = (id: string) => db.prepare("SELECT status_contato s, data_remocao d, motivo_remocao m FROM chapas WHERE id = ?").get(id) as { s: string; d: string | null; m: string | null };

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE chapas (id TEXT PRIMARY KEY, status_contato TEXT, data_remocao TEXT, motivo_remocao TEXT)");
  db.prepare("INSERT INTO chapas VALUES ('a', 'pendente', NULL, NULL)").run();
  db.prepare("INSERT INTO chapas VALUES ('b', 'nao_respondeu', '2026-10-01', 'antigo')").run();
});

describe("remover e desfazer", () => {
  it("marca como removido com a data e devolve o estado anterior", async () => {
    const antes = await removerChapaDoAlarme(banco(), "a", "2026-10-28T15:00:00Z");
    expect(antes).toEqual({ status: "pendente", dataRemocao: null, motivo: null });
    expect(linha("a")).toEqual({ s: "removido", d: "2026-10-28T15:00:00Z", m: null });
  });

  it("desfazer devolve exatamente o que havia (status, data e motivo)", async () => {
    const antes = await removerChapaDoAlarme(banco(), "b", "2026-10-28T15:00:00Z");
    expect(linha("b").s).toBe("removido");
    await restaurarChapa(banco(), "b", antes!);
    expect(linha("b")).toEqual({ s: "nao_respondeu", d: "2026-10-01", m: "antigo" });
  });

  it("chapa que não existe: não faz nada e devolve null", async () => {
    expect(await removerChapaDoAlarme(banco(), "zzz", "2026-10-28T15:00:00Z")).toBeNull();
  });
});

describe("mensagemDeSubstituicao", () => {
  it("traz tarefa, horário, chapa e telefone", () => {
    const m = mensagemDeSubstituicao({ id_tarefa: 7, empresa: "ACME", horario: "17:27" }, { nome: "Ana", telefone: "11999990001" });
    expect(m).toContain("Tarefa #7 | ACME | 17:27");
    expect(m).toContain("Chapa removido: Ana | Tel: 11999990001");
    expect(mensagemDeSubstituicao({ id_tarefa: 7, empresa: "ACME", horario: "17:27" }, { nome: "Ana", telefone: null })).toContain("Tel: -");
  });
});
