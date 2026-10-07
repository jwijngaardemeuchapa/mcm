import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
vi.mock("./umbler", () => ({ sendUmblerFreeText: (...a: unknown[]) => sendMock(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));

import { enviarMensagemPosConfirmacao, type AlvoMensagem } from "./mensagemPosConfirmacao";

const alvo: AlvoMensagem = { idTarefa: 10, chapaId: "c1", nome: "João", telefone: "(11) 99999-0000", empresa: "Acme" };

function config(over: Record<string, unknown> = {}) {
  localStorage.setItem(
    "fup_settings",
    JSON.stringify({
      umblerSettings: { bearerToken: "tok" },
      mensagemPosConfirmacao: {
        ativo: true,
        gatilhos: { prefup: true, fup: true, manual: false },
        mensagens: [{ id: "m", nome: "M", texto: "Olá!", empresas: [] }],
        mensagemAtivaId: "m",
        ...over,
      },
    }),
  );
}

// o envio é fire-and-forget: espera a fila de microtarefas esvaziar
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  sendMock.mockReset();
  sendMock.mockResolvedValue(undefined);
});

describe("enviarMensagemPosConfirmacao", () => {
  it("envia o texto ativo pro telefone do chapa", async () => {
    config();
    enviarMensagemPosConfirmacao([alvo], "fup");
    await flush();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toMatchObject({ chapaTelefone: "(11) 99999-0000", message: "Olá!" });
  });

  it("não envia duas vezes pro mesmo chapa na mesma tarefa", async () => {
    config();
    enviarMensagemPosConfirmacao([alvo], "prefup");
    await flush();
    enviarMensagemPosConfirmacao([alvo], "manual"); // gatilho manual desligado, mas o dedupe vale de qualquer jeito
    enviarMensagemPosConfirmacao([alvo], "fup");
    await flush();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("chapa em outra tarefa recebe de novo", async () => {
    config();
    enviarMensagemPosConfirmacao([alvo], "fup");
    await flush();
    enviarMensagemPosConfirmacao([{ ...alvo, idTarefa: 11 }], "fup");
    await flush();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("respeita o gatilho: manual desligado não envia", async () => {
    config();
    enviarMensagemPosConfirmacao([alvo], "manual");
    await flush();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("recurso desligado ou sem token da Umbler não envia", async () => {
    config({ ativo: false });
    enviarMensagemPosConfirmacao([alvo], "fup");
    await flush();
    expect(sendMock).not.toHaveBeenCalled();

    localStorage.setItem(
      "fup_settings",
      JSON.stringify({
        umblerSettings: { bearerToken: "" },
        mensagemPosConfirmacao: {
          ativo: true,
          gatilhos: { prefup: true, fup: true, manual: true },
          mensagens: [{ id: "m", nome: "M", texto: "Olá!", empresas: [] }],
          mensagemAtivaId: "m",
        },
      }),
    );
    enviarMensagemPosConfirmacao([alvo], "fup");
    await flush();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("empresa com mensagem própria recebe a dela; as outras recebem a padrão (mesmo lote)", async () => {
    config({
      gatilhos: { prefup: true, fup: true, manual: true },
      mensagens: [
        { id: "m", nome: "Padrão", texto: "Texto padrão", empresas: [] },
        { id: "s", nome: "Acme", texto: "Texto da Acme", empresas: ["Acme"] },
      ],
    });
    enviarMensagemPosConfirmacao(
      [
        alvo,
        { ...alvo, chapaId: "c2", nome: "Maria", telefone: "11988887777", empresa: "Outra Ltda" },
        { ...alvo, chapaId: "c3", nome: "Pedro", telefone: "11977776666", empresa: null },
      ],
      "manual",
    );
    await flush();
    const enviados = sendMock.mock.calls.map((c) => [c[0].chapaTelefone, c[0].message]);
    expect(enviados).toEqual([
      ["(11) 99999-0000", "Texto da Acme"],
      ["11988887777", "Texto padrão"],
      ["11977776666", "Texto padrão"],
    ]);
  });

  it("se o envio falhar, libera pra tentar de novo na próxima confirmação", async () => {
    config();
    sendMock.mockRejectedValueOnce(new Error("Umbler 500"));
    enviarMensagemPosConfirmacao([alvo], "fup");
    await flush();
    enviarMensagemPosConfirmacao([alvo], "fup");
    await flush();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("lote: manda um por chapa e ignora chapa sem telefone", async () => {
    config({ gatilhos: { prefup: true, fup: true, manual: true } });
    enviarMensagemPosConfirmacao(
      [alvo, { ...alvo, chapaId: "c2", nome: "Maria", telefone: "11988887777" }, { ...alvo, chapaId: "c3", nome: "Sem fone", telefone: null }],
      "manual",
    );
    await flush();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});
