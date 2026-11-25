import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Card de GRUPO: os chapas vêm de tarefas diferentes. O FUP em massa é disparado pela tarefa líder,
// mas cada registro (Central, fup_log por chapa, chat link) tem que ir pra tarefa DE ORIGEM do chapa.

const h = vi.hoisted(() => ({
  inserts: [] as Array<{ sql: string; params: unknown[] }>,
  central: vi.fn(),
  chatLink: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("./db", () => ({
  getDb: async () => ({
    select: async () => [],
    execute: async (sql: string, params: unknown[] = []) => {
      h.inserts.push({ sql, params });
      return { rowsAffected: 1 };
    },
  }),
  uuid: () => "id",
  errMsg: (e: unknown) => String(e),
}));
vi.mock("./settings", () => ({
  readSettings: () => ({ umblerSettings: { fupBotId: "bot", fupBotTriggerName: "gatilho", fupD1TemplateId: "" }, operadorNome: "" }),
}));
vi.mock("./umbler", () => ({
  sendUmblerFup: vi.fn(async () => ({ chatId: "chat-x" })),
  sendUmblerFreeText: vi.fn(async () => ({})),
  startUmblerBot: vi.fn(async () => ({ chatId: "chat-x" })),
  fmtTaskDateParam: () => "",
  humanizarErroUmbler: String,
}));
vi.mock("./central", () => ({ pushDispatchEventToCentral: h.central }));
vi.mock("./chatLinks", () => ({ upsertChatLink: h.chatLink }));

import { dispatchQueue } from "./dispatchQueue";

const LIDER = 100;
const task = { id_tarefa: LIDER, data_tarefa: "2030-01-01T10:00:00-03:00", empresa: "ACME" };
const chapas = [
  { id: "c1", id_tarefa: 100, nome_chapa: "Ana", telefone_chapa: "11999990001", status_contato: "pendente" },
  { id: "c2", id_tarefa: 101, nome_chapa: "Bia", telefone_chapa: "11999990002", status_contato: "pendente" },
  { id: "c3", id_tarefa: 102, nome_chapa: "Caio", telefone_chapa: "11999990003", status_contato: "pendente" },
];

beforeEach(() => {
  vi.useFakeTimers();
  h.inserts.length = 0;
  h.central.mockClear();
  h.chatLink.mockClear();
});
afterEach(() => {
  dispatchQueue.abortMassFup(LIDER);
  vi.useRealTimers();
});

async function rodarMassa(lista: typeof chapas) {
  dispatchQueue.startMassFup(LIDER, lista, task);
  await vi.advanceTimersByTimeAsync(180_000); // fim da contagem
  await vi.advanceTimersByTimeAsync(60_000); // 10 s entre chapas + folga
}

describe("FUP em massa de um card de grupo", () => {
  it("cada chapa vai pra tarefa de origem: evento da Central, log por chapa e chat link", async () => {
    await rodarMassa(chapas);

    const centralPorChapa = Object.fromEntries(h.central.mock.calls.map(([e]) => [e.nome_chapa, e.id_tarefa]));
    expect(centralPorChapa).toEqual({ Ana: 100, Bia: 101, Caio: 102 });

    const logsPorChapa = h.inserts
      .filter((i) => i.sql.includes("INSERT INTO fup_log") && i.sql.includes("chapa_id"))
      .map((i) => [i.params[5], i.params[1]]);
    expect(logsPorChapa).toEqual([["c1", 100], ["c2", 101], ["c3", 102]]);

    const linksPorChapa = Object.fromEntries(h.chatLink.mock.calls.map(([l]) => [l.nome_chapa, l.id_tarefa]));
    expect(linksPorChapa).toEqual({ Ana: 100, Bia: 101, Caio: 102 });
  });

  it("o resumo do disparo ('FUP em massa — N enviados') fica na tarefa líder", async () => {
    await rodarMassa(chapas);
    const resumo = h.inserts.find((i) => i.sql.includes("INSERT INTO fup_log") && !i.sql.includes("chapa_id"));
    expect(resumo?.params[1]).toBe(LIDER);
    expect(String(resumo?.params[4])).toContain("3 enviado(s)");
  });

  it("chapa sem tarefa de origem (card comum) continua indo pra tarefa do card", async () => {
    const semOrigem = chapas.map(({ id_tarefa: _omit, ...resto }) => resto) as unknown as typeof chapas;
    await rodarMassa(semOrigem.slice(0, 1));
    expect(h.central.mock.calls[0][0].id_tarefa).toBe(LIDER);
    const log = h.inserts.find((i) => i.sql.includes("chapa_id"));
    expect(log?.params[1]).toBe(LIDER);
  });
});
