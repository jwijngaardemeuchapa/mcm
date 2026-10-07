import { beforeEach, describe, expect, it, vi } from "vitest";

const execMock = vi.fn();
const selectMock = vi.fn();
vi.mock("./db", () => ({ getDb: async () => ({ execute: execMock, select: selectMock }) }));

const fetchMock = vi.fn();

async function carregar() {
  vi.resetModules(); // zera o cache "última carga aplicada" de cada teste
  return await import("./central");
}

function respostaJson(linhas: unknown[]) {
  return { ok: true, status: 200, json: async () => linhas } as Response;
}

beforeEach(() => {
  execMock.mockReset();
  selectMock.mockReset();
  fetchMock.mockReset();
  execMock.mockResolvedValue({ rowsAffected: 1 });
  selectMock.mockResolvedValue([]);
  vi.stubGlobal("fetch", fetchMock);
});

const status = (id: number, quando = new Date().toISOString()) => ({
  id_tarefa: id,
  telefone_chapa: "11999990000",
  cpf: null,
  status_contato: "confirmado",
  status_source: "mcm_manual",
  status_changed_at: quando,
});

describe("sync de status com a Central", () => {
  it("pede só a janela recente (nada do histórico inteiro)", async () => {
    const central = await carregar();
    fetchMock.mockResolvedValue(respostaJson([]));
    await central.applyCentralStatusLocally();
    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    const m = url.match(/status_changed_at=gte\.([^&]+)/);
    expect(m).not.toBeNull();
    const corte = new Date(m![1]).getTime();
    const esperado = Date.now() - central.CENTRAL_SYNC_JANELA_DIAS * 86_400_000;
    expect(Math.abs(corte - esperado)).toBeLessThan(60_000);
  });

  it("aplica a carga uma vez e não repete quando a Central devolve o mesmo conteúdo", async () => {
    const central = await carregar();
    fetchMock.mockResolvedValue(respostaJson([status(1), status(2)]));
    await central.applyCentralStatusLocally();
    expect(execMock).toHaveBeenCalledTimes(2);

    execMock.mockClear();
    await central.applyCentralStatusLocally(); // mesmo conteúdo
    expect(execMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(respostaJson([status(1), status(2), status(3)])); // chegou um novo
    await central.applyCentralStatusLocally();
    expect(execMock).toHaveBeenCalledTimes(3);
  });

  it("se a aplicação falha no meio, tenta de novo no próximo ciclo (não marca como aplicada)", async () => {
    const central = await carregar();
    fetchMock.mockResolvedValue(respostaJson([status(1)]));
    execMock.mockRejectedValueOnce(new Error("banco ocupado"));
    await expect(central.applyCentralStatusLocally()).rejects.toThrow("banco ocupado");

    execMock.mockClear();
    await central.applyCentralStatusLocally();
    expect(execMock).toHaveBeenCalledTimes(1);
  });
});

const link = (id: number) => ({
  id_tarefa: id,
  telefone_chapa: "11999990000",
  cpf: null,
  nome_chapa: "João",
  umbler_chat_id: `chat${id}`,
  canal: "umbler_talk",
  atualizado_em: new Date().toISOString(),
});

describe("sync de chat_links com a Central", () => {
  it("pede só a janela recente", async () => {
    const central = await carregar();
    fetchMock.mockResolvedValue(respostaJson([]));
    await central.applyChatLinksLocally();
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).toMatch(/atualizado_em=gte\.\d{4}-\d{2}-\d{2}T/);
  });

  it("não reaplica a mesma carga (nenhuma ida ao banco no segundo ciclo)", async () => {
    const central = await carregar();
    fetchMock.mockResolvedValue(respostaJson([link(1), link(2)]));
    expect(await central.applyChatLinksLocally()).toBe(2);
    const idasAoBanco = selectMock.mock.calls.length + execMock.mock.calls.length;
    expect(idasAoBanco).toBeGreaterThan(0);

    selectMock.mockClear();
    execMock.mockClear();
    expect(await central.applyChatLinksLocally()).toBe(0);
    expect(selectMock).not.toHaveBeenCalled();
    expect(execMock).not.toHaveBeenCalled();
  });
});
