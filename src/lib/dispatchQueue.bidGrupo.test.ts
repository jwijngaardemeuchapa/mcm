import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// BID de um card de GRUPO: as vagas são a soma das tarefas, então os alocados são contados em TODAS as
// tarefas do grupo e o disparo para quando o grupo fecha (não quando a tarefa líder fecha).

const banco = vi.hoisted(() => ({ alocados: 0, consultas: [] as Array<{ sql: string; params: unknown[] }> }));
const startUmblerBot = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("./db", () => ({
  getDb: async () => ({
    select: async (sql: string, params: unknown[] = []) => {
      banco.consultas.push({ sql, params });
      return [{ n: banco.alocados }];
    },
    execute: async () => ({ rowsAffected: 1 }),
  }),
  uuid: () => "id",
  errMsg: (e: unknown) => String(e),
}));
vi.mock("./settings", () => ({
  readSettings: () => ({ umblerSettings: { bidBotId: "bot", bidBotTriggerName: "trg", bidBotD1Id: "", bidBotD1TriggerName: "" } }),
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

beforeEach(() => {
  vi.useFakeTimers();
  banco.alocados = 0;
  banco.consultas.length = 0;
  startUmblerBot.mockReset();
  startUmblerBot.mockResolvedValue({ chatId: "chat" });
});
afterEach(() => vi.useRealTimers());

describe("BID de um grupo de tarefas", () => {
  it("conta os alocados em todas as tarefas do grupo (uma consulta com todos os ids)", async () => {
    bidDispatchQueue.startBatch({
      taskId: 10, taskIds: [10, 11, 12], empresa: "ACME", dataTarefa: "2026-10-20T08:00:00-03:00",
      candidates: candidatos(3), params, quantidadeChapas: 3,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    const consulta = banco.consultas.find((c) => c.sql.includes("FROM chapas"));
    expect(consulta?.sql).toContain("id_tarefa IN (?,?,?)");
    expect(consulta?.params).toEqual([10, 11, 12]);
  });

  it("para quando o GRUPO fecha: 3 vagas somadas, o 3º BID completa as 3 e o resto não sai", async () => {
    startUmblerBot.mockImplementation(async () => {
      if (startUmblerBot.mock.calls.length === 3) banco.alocados = 3; // fecha a última vaga do grupo
      return { chatId: "chat" };
    });
    bidDispatchQueue.startBatch({
      taskId: 20, taskIds: [20, 21, 22], empresa: "ACME", dataTarefa: "2026-10-20T08:00:00-03:00",
      candidates: candidatos(10), params, quantidadeChapas: 3,
    });
    const fim = bidDispatchQueue.waitBatch(20);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await fim).toEqual({ dispatched: 3, filledEarly: true, aborted: false });
    expect(startUmblerBot).toHaveBeenCalledTimes(3);
  });

  it("sem grupo (taskIds ausente) continua contando só a própria tarefa", async () => {
    bidDispatchQueue.startBatch({
      taskId: 30, empresa: "ACME", dataTarefa: "2026-10-20T08:00:00-03:00",
      candidates: candidatos(1), params, quantidadeChapas: 1,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    const consulta = banco.consultas.find((c) => c.sql.includes("FROM chapas"));
    expect(consulta?.sql).toContain("id_tarefa IN (?)");
    expect(consulta?.params).toEqual([30]);
  });

  it("tarefaPreenchida aceita a lista de tarefas do grupo", async () => {
    banco.alocados = 3;
    expect(await tarefaPreenchida([1, 2, 3], 3)).toBe(true);
    expect(await tarefaPreenchida([1, 2, 3], 4)).toBe(false);
    expect(banco.consultas.at(-1)?.params).toEqual([1, 2, 3]);
    expect(await tarefaPreenchida(5, 1)).toBe(true); // número único segue valendo
  });
});
