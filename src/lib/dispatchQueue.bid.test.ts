import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Estado "do banco" que o teste controla: quantas vagas já estão ocupadas na tarefa.
const banco = vi.hoisted(() => ({ alocados: 0, bidsGravados: 0 }));
const startUmblerBot = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("./db", () => ({
  getDb: async () => ({
    select: async () => [{ n: banco.alocados }],
    execute: async (sql: string) => {
      if (sql.startsWith("INSERT INTO bid_disparos")) banco.bidsGravados++;
      return { rowsAffected: 1 };
    },
  }),
  uuid: () => "id",
  errMsg: (e: unknown) => String(e),
}));
vi.mock("./settings", () => ({
  readSettings: () => ({
    umblerSettings: { bidBotId: "bot", bidBotTriggerName: "trg", bidBotD1Id: "", bidBotD1TriggerName: "" },
  }),
}));
vi.mock("./umbler", () => ({
  sendUmblerFup: vi.fn(),
  sendUmblerFreeText: vi.fn(),
  startUmblerBot,
  fmtTaskDateParam: () => "01/01",
  humanizarErroUmbler: (e: unknown) => String(e),
}));
vi.mock("./central", () => ({ pushDispatchEventToCentral: vi.fn() }));
vi.mock("./chatLinks", () => ({ upsertChatLink: vi.fn() }));
vi.mock("./prefup", () => ({ isPrefupTemplateWindow: () => false }));

import { bidDispatchQueue, tarefaPreenchida } from "./dispatchQueue";

const candidatos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, nome: `Chapa ${i}`, telefone: `1199999000${i}` }));
const params = { local: "x", mapsLink: "", sendMapsAsLocal: false, atividades: "y", diaria: "100" };

function iniciar(taskId: number, n: number, vagas: number) {
  const ok = bidDispatchQueue.startBatch({
    taskId, empresa: "ACME", dataTarefa: "2026-10-20T08:00:00-03:00", candidates: candidatos(n), params, quantidadeChapas: vagas,
  });
  expect(ok).toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers();
  banco.alocados = 0;
  banco.bidsGravados = 0;
  startUmblerBot.mockReset();
  startUmblerBot.mockResolvedValue({ chatId: "chat" });
});
afterEach(() => vi.useRealTimers());

describe("BID em levas — como o disparo termina (waitBatch)", () => {
  it("seleção maior que uma leva: manda 30 e espera 5 min antes da 2ª leva (não dispara tudo de uma vez)", async () => {
    iniciar(1, 35, 100);
    // 30 envios com 7 s entre eles ≈ 203 s; depois a pausa de 5 min
    await vi.advanceTimersByTimeAsync(215_000);
    expect(startUmblerBot).toHaveBeenCalledTimes(30);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(startUmblerBot).toHaveBeenCalledTimes(30); // ainda na pausa de leva
    await vi.advanceTimersByTimeAsync(300_000);
    expect(startUmblerBot).toHaveBeenCalledTimes(35);
    const r = await bidDispatchQueue.waitBatch(1);
    expect(r).toBeNull(); // já terminou e foi limpo
  });

  it("tarefa preenchida no meio: para, diz filledEarly e NÃO manda o resto", async () => {
    startUmblerBot.mockImplementation(async () => {
      if (startUmblerBot.mock.calls.length === 2) banco.alocados = 2; // o 2º BID fecha a tarefa
      return { chatId: "chat" };
    });
    iniciar(2, 10, 2);
    const fim = bidDispatchQueue.waitBatch(2);
    await vi.advanceTimersByTimeAsync(60_000);
    const r = await fim;
    expect(r).toEqual({ dispatched: 2, filledEarly: true, aborted: false });
    expect(startUmblerBot).toHaveBeenCalledTimes(2);
  });

  it("cancelado pelo analista: aborted true e para", async () => {
    iniciar(3, 10, 50);
    const fim = bidDispatchQueue.waitBatch(3);
    await vi.advanceTimersByTimeAsync(10_000); // 2 envios feitos, no meio da pausa de 7 s
    bidDispatchQueue.abortBatch(3);
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await fim;
    expect(r?.aborted).toBe(true);
    expect(r?.filledEarly).toBe(false);
    expect(r!.dispatched).toBeLessThan(10);
  });

  it("terminou sem parar antes: dispatched = todos, nenhuma flag", async () => {
    iniciar(4, 3, 50);
    const fim = bidDispatchQueue.waitBatch(4);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await fim).toEqual({ dispatched: 3, filledEarly: false, aborted: false });
  });

  it("sem disparo rodando, waitBatch devolve null na hora", async () => {
    expect(await bidDispatchQueue.waitBatch(999)).toBeNull();
  });
});

describe("tarefaPreenchida", () => {
  it("vagas ocupadas >= vagas da tarefa", async () => {
    banco.alocados = 3;
    expect(await tarefaPreenchida(1, 3)).toBe(true);
    expect(await tarefaPreenchida(1, 5)).toBe(false);
  });
  it("sem vagas conhecidas (0) nunca considera preenchida — não trava a captação por falta de dado", async () => {
    banco.alocados = 0;
    expect(await tarefaPreenchida(1, 0)).toBe(false);
  });
});
