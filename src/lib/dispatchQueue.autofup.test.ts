import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const h = vi.hoisted(() => ({ db: null as unknown as InstanceType<typeof DatabaseSync> }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("./db", () => ({
  getDb: async () => ({
    select: async (sql: string, p: unknown[] = []) => h.db.prepare(sql).all(...(p as never[])),
    execute: async () => ({ rowsAffected: 0 }),
  }),
  uuid: () => "id",
  errMsg: (e: unknown) => String(e),
}));
vi.mock("./settings", () => ({ readSettings: () => ({ umblerSettings: {} }) }));
vi.mock("./umbler", () => ({
  sendUmblerFup: vi.fn(), sendUmblerFreeText: vi.fn(), startUmblerBot: vi.fn(),
  fmtTaskDateParam: () => "", humanizarErroUmbler: String,
}));
vi.mock("./central", () => ({ pushDispatchEventToCentral: vi.fn() }));
vi.mock("./chatLinks", () => ({ upsertChatLink: vi.fn() }));

import { dispatchQueue } from "./dispatchQueue";

const HORA = 3_600_000;
const tarefaEm = (horas: number) => new Date(Date.now() + horas * HORA - 3 * HORA).toISOString().slice(0, 19) + "-03:00";

function banco() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE chapas (id TEXT PRIMARY KEY, id_tarefa INTEGER, nome_chapa TEXT, telefone_chapa TEXT, status_contato TEXT,
    prefup_confirmado_em TEXT, fup_confirmado_em TEXT);`);
  const ins = db.prepare("INSERT INTO chapas VALUES (?,?,?,?,?,?,?)");
  ins.run("pendente", 1, "P", "11999990001", "pendente", null, null);
  ins.run("so-prefup", 1, "SP", "11999990002", "confirmado", "2026-10-28T10:00:00Z", null);
  ins.run("os-dois", 1, "OD", "11999990003", "confirmado", "2026-10-28T10:00:00Z", "2026-10-28T18:00:00Z");
  ins.run("sem-fase", 1, "SF", "11999990004", "confirmado", null, null);
  ins.run("removido", 1, "R", "11999990005", "removido", null, null);
  ins.run("sem-fone", 1, "SFN", "", "pendente", null, null);
  return db;
}

async function selecionados(horasAteATarefa: number): Promise<string[]> {
  const espiao = vi.spyOn(dispatchQueue, "startMassFup").mockImplementation(() => {});
  await dispatchQueue.startAutoFup({ id_tarefa: 1, data_tarefa: tarefaEm(horasAteATarefa), empresa: "ACME", cidade_uf: "São Paulo/SP" });
  const chamada = espiao.mock.calls[0];
  espiao.mockRestore();
  return chamada ? (chamada[1] as Array<{ id: string }>).map((c) => c.id).sort() : [];
}

beforeEach(() => {
  h.db = banco();
});

describe("FUP automático — quem entra", () => {
  it("na janela do FUP (< 5 h): pendentes + quem confirmou SÓ o PréFUP (reforço); fora: quem já tem a flag do FUP, sem fase conhecida, removido e sem telefone", async () => {
    expect(await selecionados(2)).toEqual(["pendente", "so-prefup"]);
  });

  it("antes da janela (> 5 h): só pendentes — não manda PréFUP de novo pra quem já confirmou", async () => {
    expect(await selecionados(9)).toEqual(["pendente"]);
  });
});
