import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O hook de verdade (relógio, diagnóstico, som e notificação) com o banco, a carteira e o som simulados.
const h = vi.hoisted(() => ({
  entradas: [] as unknown[],
  naoLidas: new Set<string>(),
  playAlarme: vi.fn(),
  notificacoes: [] as Array<{ titulo: string; corpo: string; tag: string }>,
}));

vi.mock("./db", () => ({ getDb: async () => ({}) }));
vi.mock("./carteira", () => ({ getCarteiraDoAnalista: async () => [] }));
vi.mock("./alarmeDados", () => ({ carregarEntradasDoAlarme: async () => h.entradas, carregarConfiabilidade: async () => null }));
vi.mock("./WatcherContext", () => ({ useUnreadChats: () => ({ unreadPhones: h.naoLidas, unreadChatIds: new Set() }) }));
vi.mock("./sound", () => ({ playAlarme: h.playAlarme }));

import { useAlarmeChapas } from "./useAlarmeChapas";

const AGORA = new Date("2026-10-28T15:00:00Z").getTime();
const MIN = 60_000;

const entrada = (over: Record<string, unknown> = {}, minParaTarefa = 60) => [{
  id_tarefa: 1, empresa: "ACME", data_tarefa: new Date(AGORA + minParaTarefa * MIN).toISOString(), cidade_uf: "São Paulo/SP",
  minParaTarefa, solicitados: 5, confirmados: 3, tipoSugerido: "fup", nomes: ["Ana"],
  chapas: [{
    id: "c1", nome: "Ana", telefone: "11999990001", status: "pendente", semRespostaEnviado: false, naoLida: false,
    ultimoDisparo: { quando: AGORA - 3 * MIN, tipo: "fup", canal: "umbler_talk" }, disparos: 1, estrelas: null, faltas: null, chatId: null,
    ...over,
  }],
}];

async function avancar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

class NotificacaoFalsa {
  static permission = "granted";
  constructor(titulo: string, opts: { body: string; tag: string }) {
    h.notificacoes.push({ titulo, corpo: opts.body, tag: opts.tag });
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now: AGORA });
  localStorage.clear();
  h.entradas = entrada();
  h.naoLidas = new Set();
  h.playAlarme.mockClear();
  h.notificacoes.length = 0;
  vi.stubGlobal("Notification", NotificacaoFalsa);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAlarmeChapas — som e notificação", () => {
  it("a 1ª leitura é silenciosa mesmo com a chapa já pedindo remoção (abrir o app não toca por tudo que já estava pendente)", async () => {
    h.entradas = entrada({ ultimoDisparo: { quando: AGORA - 40 * MIN, tipo: "fup", canal: "umbler_talk" } });
    const { result } = renderHook(() => useAlarmeChapas());
    await avancar(100);
    expect(result.current.tarefas[0].itens[0].d.acao).toBe("remover");
    expect(h.playAlarme).not.toHaveBeenCalled();
    expect(h.notificacoes).toEqual([]);
  });

  it("toca e notifica quando a chapa muda de estágio — aguardar → cobrar (1 bipe) → remover (2 bipes) — e só uma vez em cada", async () => {
    const { result } = renderHook(() => useAlarmeChapas());
    await avancar(100);
    expect(result.current.tarefas[0].itens[0].d.acao).toBe("aguardar");
    expect(h.playAlarme).not.toHaveBeenCalled();

    await avancar(13 * MIN); // FUP há ~16 min: passou de 60% do prazo
    expect(result.current.tarefas[0].itens[0].d.acao).toBe("cobrar");
    expect(h.playAlarme).toHaveBeenCalledTimes(1);
    expect(h.playAlarme).toHaveBeenLastCalledWith(1);
    expect(h.notificacoes).toHaveLength(1);
    expect(h.notificacoes[0]).toMatchObject({ tag: "alarme-1", corpo: "Ligar ou chamar no WhatsApp: Ana" });
    expect(h.notificacoes[0].titulo).toMatch(/^ACME — faltam /);

    await avancar(2 * MIN); // continua em "cobrar": não toca de novo
    expect(h.playAlarme).toHaveBeenCalledTimes(1);

    await avancar(8 * MIN); // FUP há ~26 min: passou do limite
    expect(result.current.tarefas[0].itens[0].d.acao).toBe("remover");
    expect(h.playAlarme).toHaveBeenCalledTimes(2);
    expect(h.playAlarme).toHaveBeenLastCalledWith(2); // tarefa a menos de 5 h = "decidir"
    expect(h.notificacoes[1].corpo).toBe("Remover e repor: Ana");

    await avancar(5 * MIN); // nada mudou de estágio
    expect(h.playAlarme).toHaveBeenCalledTimes(2);
  });

  it("remoção recomendada com a tarefa a 30 min ou menos = 3 bipes (crítico)", async () => {
    h.entradas = entrada({}, 45);
    renderHook(() => useAlarmeChapas());
    await avancar(100);
    await avancar(28 * MIN); // FUP há 31 min, tarefa em ~17 min
    expect(h.playAlarme).toHaveBeenLastCalledWith(3);
  });

  it("notificação desligada nas configurações: toca, mas não notifica", async () => {
    localStorage.setItem("fup_settings", JSON.stringify({ alarme: { notificacao: false } }));
    renderHook(() => useAlarmeChapas());
    await avancar(100);
    await avancar(13 * MIN);
    expect(h.playAlarme).toHaveBeenCalledTimes(1);
    expect(h.notificacoes).toEqual([]);
  });

  it("sem permissão do Windows, não notifica (e não quebra)", async () => {
    NotificacaoFalsa.permission = "denied";
    try {
      renderHook(() => useAlarmeChapas());
      await avancar(100);
      await avancar(13 * MIN);
      expect(h.playAlarme).toHaveBeenCalledTimes(1);
      expect(h.notificacoes).toEqual([]);
    } finally {
      NotificacaoFalsa.permission = "granted";
    }
  });

  it("mensagem não lida do chapa toca na hora (ler a resposta)", async () => {
    const { rerender, result } = renderHook(() => useAlarmeChapas());
    await avancar(100);
    h.naoLidas = new Set(["11999990001"]);
    rerender();
    await avancar(100);
    expect(result.current.tarefas[0].itens[0].d.acao).toBe("ler_resposta");
    expect(h.playAlarme).toHaveBeenCalledWith(1);
    expect(h.notificacoes[0].corpo).toBe("Ler a resposta: Ana");
  });

  it("painel desligado nas configurações: não lê nada e não toca", async () => {
    localStorage.setItem("fup_settings", JSON.stringify({ approachingAlertEnabled: false }));
    h.entradas = entrada({ ultimoDisparo: { quando: AGORA - 40 * MIN, tipo: "fup", canal: "umbler_talk" } });
    const { result } = renderHook(() => useAlarmeChapas());
    await avancar(2 * MIN);
    expect(result.current.tarefas).toEqual([]);
    expect(h.playAlarme).not.toHaveBeenCalled();
  });

  it("os prazos vêm das configurações (FUP 10 min: remoção já aos 10 min sem resposta)", async () => {
    localStorage.setItem("fup_settings", JSON.stringify({ alarme: { limiteFupMin: 10 } }));
    const { result } = renderHook(() => useAlarmeChapas());
    await avancar(100);
    expect(result.current.config.limiteFupMin).toBe(10);
    await avancar(8 * MIN); // FUP há ~11 min
    expect(result.current.tarefas[0].itens[0].d.acao).toBe("remover");
  });

  it("tarefa que já começou some da lista", async () => {
    h.entradas = entrada({}, 5);
    const { result } = renderHook(() => useAlarmeChapas());
    await avancar(100);
    expect(result.current.tarefas).toHaveLength(1);
    await avancar(6 * MIN);
    expect(result.current.tarefas).toEqual([]);
  });
});
