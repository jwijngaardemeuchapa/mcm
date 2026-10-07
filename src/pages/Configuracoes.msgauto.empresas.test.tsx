import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getDb: () =>
    Promise.resolve({
      select: () => Promise.resolve([{ nome_fantasia: "Maratá Atacado" }, { nome_fantasia: "Casa Forte" }]),
    }),
}));
vi.mock("@/pages/AnaliseBase/modules/M_leo", () => ({
  getLeoConfig: () => Promise.resolve({ spreadsheetId: "", serviceAccountJson: null, lastSync: null, totalRegistros: 0 }),
  saveLeoConfig: vi.fn(),
  syncLeo: vi.fn(),
  extractSpreadsheetId: vi.fn(),
  parseRespostasBidCsv: vi.fn(),
}));

import Configuracoes from "./Configuracoes";

function salvo() {
  return JSON.parse(localStorage.getItem("fup_settings") ?? "{}").mensagemPosConfirmacao;
}

function semear(mensagens: unknown[]) {
  localStorage.setItem(
    "fup_settings",
    JSON.stringify({ mensagemPosConfirmacao: { ativo: true, mensagens, mensagemAtivaId: "pad" } }),
  );
}

function cardMsgAuto() {
  return screen.getByText("Mensagem automática ao confirmar").closest("div[id='cfg-msg-auto']") as HTMLElement;
}

// Radix Select no jsdom: abre pelo teclado (Enter no gatilho).
function abrirSelect(gatilho: HTMLElement) {
  gatilho.focus();
  fireEvent.keyDown(gatilho, { key: "Enter", code: "Enter" });
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => localStorage.clear());

describe("Configurações — mensagem automática por empresa", () => {
  it("mostra as empresas de cada mensagem e remove uma pelo chip", () => {
    semear([
      { id: "pad", nome: "Padrão", texto: "Texto padrão", empresas: [] },
      { id: "esp", nome: "Específica", texto: "Texto específico", empresas: ["Casa Forte"] },
    ]);
    render(<Configuracoes />);
    const card = within(cardMsgAuto());
    expect(card.getAllByText("Casa Forte").length).toBeGreaterThan(0);

    // quadro "Como vai ficar": empresa escolhida → mensagem própria; resto → padrão
    const resumo = card.getByText("Como vai ficar").parentElement as HTMLElement;
    expect(resumo).toHaveTextContent("Casa Forte → “Específica”");
    expect(resumo).toHaveTextContent("Todas as outras empresas → “Padrão”");

    fireEvent.click(card.getByRole("button", { name: "Remover Casa Forte" }));
    expect(salvo().mensagens.find((m: { id: string }) => m.id === "esp").empresas).toEqual([]);
    // sem empresas escolhidas, o quadro vira "todas as empresas → padrão"
    expect(card.getByText("Como vai ficar").parentElement).toHaveTextContent("Todas as empresas → “Padrão”");
  });

  it("adiciona uma empresa da Carteira a uma mensagem", async () => {
    semear([
      { id: "pad", nome: "Padrão", texto: "Texto padrão", empresas: [] },
      { id: "esp", nome: "Específica", texto: "Texto específico", empresas: [] },
    ]);
    render(<Configuracoes />);
    const gatilho = await waitFor(() => {
      const el = within(cardMsgAuto()).getByRole("combobox", { name: "Adicionar empresa a Específica" });
      expect(el).toHaveTextContent("Adicionar empresa da Carteira…"); // carteira já carregada
      return el;
    });
    abrirSelect(gatilho);
    fireEvent.click(await screen.findByRole("option", { name: "Maratá Atacado" }));
    expect(salvo().mensagens.find((m: { id: string }) => m.id === "esp").empresas).toEqual(["Maratá Atacado"]);
  });

  it("empresa que já tem mensagem própria aparece desabilitada nas outras mensagens", async () => {
    semear([
      { id: "pad", nome: "Padrão", texto: "Texto padrão", empresas: [] },
      { id: "esp", nome: "Específica", texto: "Texto específico", empresas: ["Casa Forte"] },
    ]);
    render(<Configuracoes />);
    const gatilho = await waitFor(() => {
      const el = within(cardMsgAuto()).getByRole("combobox", { name: "Adicionar empresa a Padrão" });
      expect(el).toHaveTextContent("Adicionar empresa da Carteira…");
      return el;
    });
    abrirSelect(gatilho);
    const ocupada = await screen.findByRole("option", { name: /Casa Forte — já em "Específica"/ });
    expect(ocupada).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: "Maratá Atacado" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("config antiga (mensagem sem o campo empresas) abre normalmente", () => {
    localStorage.setItem(
      "fup_settings",
      JSON.stringify({
        mensagemPosConfirmacao: {
          ativo: true,
          mensagens: [{ id: "pad", nome: "Antiga", texto: "Texto" }],
          mensagemAtivaId: "pad",
        },
      }),
    );
    render(<Configuracoes />);
    expect(screen.getByDisplayValue("Antiga")).toBeInTheDocument();
    expect(within(cardMsgAuto()).getByText(/Só para estas empresas/)).toBeInTheDocument();
  });
});
