import { describe, expect, it } from "vitest";
import { mensagemParaEnviar } from "./mensagemPosConfirmacao";
import type { MensagemPosConfirmacaoSettings } from "./settings";

const base: MensagemPosConfirmacaoSettings = {
  ativo: true,
  gatilhos: { prefup: true, fup: true, manual: false },
  mensagens: [
    { id: "a", nome: "A", texto: "  Texto A  " },
    { id: "b", nome: "B", texto: "Texto B" },
  ],
  mensagemAtivaId: "a",
};

describe("mensagemParaEnviar", () => {
  it("devolve o texto da mensagem ativa (sem espaços nas pontas) quando o gatilho está ligado", () => {
    expect(mensagemParaEnviar(base, "prefup")).toBe("Texto A");
    expect(mensagemParaEnviar(base, "fup")).toBe("Texto A");
  });

  it("usa a mensagem que estiver marcada como ativa", () => {
    expect(mensagemParaEnviar({ ...base, mensagemAtivaId: "b" }, "fup")).toBe("Texto B");
  });

  it("não envia quando o recurso está desligado", () => {
    expect(mensagemParaEnviar({ ...base, ativo: false }, "prefup")).toBeNull();
  });

  it("respeita cada gatilho separadamente", () => {
    expect(mensagemParaEnviar(base, "manual")).toBeNull();
    const soManual = { ...base, gatilhos: { prefup: false, fup: false, manual: true } };
    expect(mensagemParaEnviar(soManual, "manual")).toBe("Texto A");
    expect(mensagemParaEnviar(soManual, "prefup")).toBeNull();
    expect(mensagemParaEnviar(soManual, "fup")).toBeNull();
  });

  it("não envia sem mensagem ativa válida ou com texto vazio", () => {
    expect(mensagemParaEnviar({ ...base, mensagemAtivaId: null }, "fup")).toBeNull();
    expect(mensagemParaEnviar({ ...base, mensagemAtivaId: "inexistente" }, "fup")).toBeNull();
    expect(
      mensagemParaEnviar({ ...base, mensagens: [{ id: "a", nome: "A", texto: "   " }] }, "fup"),
    ).toBeNull();
  });
});
