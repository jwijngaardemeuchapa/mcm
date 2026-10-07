import { describe, expect, it } from "vitest";
import { mensagemDaEmpresa, mensagemParaEnviar } from "./mensagemPosConfirmacao";
import type { MensagemPosConfirmacaoSettings } from "./settings";

const base: MensagemPosConfirmacaoSettings = {
  ativo: true,
  gatilhos: { prefup: true, fup: true, manual: false },
  mensagens: [
    { id: "a", nome: "A", texto: "  Texto A  ", empresas: [] },
    { id: "b", nome: "B", texto: "Texto B", empresas: [] },
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
      mensagemParaEnviar({ ...base, mensagens: [{ id: "a", nome: "A", texto: "   ", empresas: [] }] }, "fup"),
    ).toBeNull();
  });
});

describe("mensagem específica por empresa", () => {
  const cfg: MensagemPosConfirmacaoSettings = {
    ...base,
    mensagens: [
      { id: "a", nome: "Padrão", texto: "Texto padrão", empresas: [] },
      { id: "m", nome: "Maratá", texto: "Texto Maratá", empresas: ["Maratá Atacado"] },
      { id: "x", nome: "Casa", texto: "Texto Casa", empresas: ["Casa"] },
    ],
    mensagemAtivaId: "a",
  };

  it("a empresa escolhida recebe a mensagem própria; as demais recebem a padrão", () => {
    expect(mensagemParaEnviar(cfg, "fup", "Maratá Atacado")).toBe("Texto Maratá");
    expect(mensagemParaEnviar(cfg, "fup", "Outra Empresa")).toBe("Texto padrão");
    expect(mensagemParaEnviar(cfg, "fup", null)).toBe("Texto padrão");
    expect(mensagemParaEnviar(cfg, "fup")).toBe("Texto padrão");
  });

  it("casa sem acento, caixa e sufixo societário (mesma regra da Carteira)", () => {
    expect(mensagemParaEnviar(cfg, "fup", "MARATA ATACADO LTDA")).toBe("Texto Maratá");
    expect(mensagemParaEnviar(cfg, "prefup", "maratá atacado s.a.")).toBe("Texto Maratá");
  });

  it("o gatilho continua valendo pra mensagem da empresa", () => {
    expect(mensagemParaEnviar(cfg, "manual", "Maratá Atacado")).toBeNull();
    expect(mensagemParaEnviar({ ...cfg, ativo: false }, "fup", "Maratá Atacado")).toBeNull();
  });

  it("empresa com mensagem própria recebe mesmo sem mensagem padrão", () => {
    expect(mensagemParaEnviar({ ...cfg, mensagemAtivaId: null }, "fup", "Maratá Atacado")).toBe("Texto Maratá");
    expect(mensagemParaEnviar({ ...cfg, mensagemAtivaId: null }, "fup", "Outra Empresa")).toBeNull();
  });

  it("mensagem própria sem texto cai pra padrão em vez de calar", () => {
    const vazia = { ...cfg, mensagens: cfg.mensagens.map((m) => (m.id === "m" ? { ...m, texto: "  " } : m)) };
    expect(mensagemParaEnviar(vazia, "fup", "Maratá Atacado")).toBe("Texto padrão");
  });

  it("mais de uma casando: nome idêntico vence nome contido; entre contidos, o mais longo", () => {
    const duas: MensagemPosConfirmacaoSettings = {
      ...cfg,
      mensagens: [
        { id: "a", nome: "Padrão", texto: "Texto padrão", empresas: [] },
        { id: "curta", nome: "Curta", texto: "Curta", empresas: ["Maratá"] },
        { id: "longa", nome: "Longa", texto: "Longa", empresas: ["Maratá Atacado"] },
      ],
    };
    expect(mensagemDaEmpresa(duas.mensagens, "Maratá Atacado")?.id).toBe("longa"); // idêntico
    expect(mensagemDaEmpresa(duas.mensagens, "Maratá")?.id).toBe("curta"); // idêntico à curta
    expect(mensagemDaEmpresa(duas.mensagens, "Maratá Atacado Filial Sul")?.id).toBe("longa"); // contido: o mais longo
  });

  it("mensagem sem o campo empresas (config antiga) é tratada como sem empresas", () => {
    const antiga = [{ id: "a", nome: "A", texto: "T" }] as unknown as MensagemPosConfirmacaoSettings["mensagens"];
    expect(mensagemDaEmpresa(antiga, "Qualquer")).toBeNull();
  });
});
