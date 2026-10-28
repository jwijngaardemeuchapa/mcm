import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  startUmblerBot: vi.fn(async () => ({ chatId: "chat-1" })),
  sendUmblerFup: vi.fn(async () => ({ chatId: "chat-1" })),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("./db", () => ({
  getDb: async () => ({ select: async () => [], execute: async () => ({ rowsAffected: 0 }) }),
  uuid: () => "id",
  errMsg: (e: unknown) => String(e),
}));
vi.mock("./settings", () => ({ readSettings: () => ({ umblerSettings: { fupBotId: "bot", fupBotTriggerName: "gatilho" }, operadorNome: "" }) }));
vi.mock("./umbler", () => ({
  sendUmblerFup: h.sendUmblerFup, sendUmblerFreeText: vi.fn(), startUmblerBot: h.startUmblerBot,
  fmtTaskDateParam: () => "", humanizarErroUmbler: String,
}));
vi.mock("./central", () => ({ pushDispatchEventToCentral: vi.fn() }));
vi.mock("./chatLinks", () => ({ upsertChatLink: vi.fn() }));

import { dispatchQueue } from "./dispatchQueue";

const chapa = { id: "c1", nome_chapa: "Ana", telefone_chapa: "11999990001", status_contato: "pendente" };
const task = { id_tarefa: 1, data_tarefa: "2030-01-01T10:00:00-03:00", empresa: "ACME" };

beforeEach(() => {
  vi.useFakeTimers();
  h.startUmblerBot.mockClear();
  h.sendUmblerFup.mockClear();
});
afterEach(() => {
  dispatchQueue.abortChapaJob("c1");
  vi.useRealTimers();
});

describe("startChapaJob — conferência de última hora (aindaVale)", () => {
  it("sem a conferência: envia quando a contagem de 60 s acaba (comportamento de sempre)", async () => {
    dispatchQueue.startChapaJob("c1", "fup", chapa, task);
    expect(dispatchQueue.getChapaJobState("c1")).toMatchObject({ status: "countdown" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.startUmblerBot).toHaveBeenCalledTimes(1);
    expect(dispatchQueue.getChapaJobState("c1")).toBeNull();
  });

  it("aindaVale = true: envia", async () => {
    dispatchQueue.startChapaJob("c1", "fup", chapa, task, { aindaVale: async () => true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.startUmblerBot).toHaveBeenCalledTimes(1);
  });

  it("aindaVale = false: NÃO envia e a contagem some do painel", async () => {
    dispatchQueue.startChapaJob("c1", "fup", chapa, task, { aindaVale: async () => false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.startUmblerBot).not.toHaveBeenCalled();
    expect(h.sendUmblerFup).not.toHaveBeenCalled();
    expect(dispatchQueue.getChapaJobState("c1")).toBeNull();
  });

  it("a conferência só roda no fim da contagem (não antes)", async () => {
    const aindaVale = vi.fn(async () => true);
    dispatchQueue.startChapaJob("c1", "fup", chapa, task, { aindaVale });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(aindaVale).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(aindaVale).toHaveBeenCalledTimes(1);
  });

  it("se a conferência falha (erro), na dúvida não envia", async () => {
    dispatchQueue.startChapaJob("c1", "fup", chapa, task, { aindaVale: async () => { throw new Error("banco ocupado"); } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.startUmblerBot).not.toHaveBeenCalled();
    expect(dispatchQueue.getChapaJobState("c1")).toBeNull();
  });

  it("cancelar durante a contagem continua funcionando", async () => {
    const aindaVale = vi.fn(async () => true);
    dispatchQueue.startChapaJob("c1", "fup", chapa, task, { aindaVale });
    dispatchQueue.abortChapaJob("c1");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(aindaVale).not.toHaveBeenCalled();
    expect(h.startUmblerBot).not.toHaveBeenCalled();
  });
});
