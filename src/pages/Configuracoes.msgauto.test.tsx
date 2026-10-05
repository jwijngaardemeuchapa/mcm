import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => Promise.reject(new Error("sem banco no teste")) }));
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

beforeAll(() => {
  // Radix (Checkbox/RadioGroup/Switch) mede o elemento com ResizeObserver.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => localStorage.clear());

describe("Configurações — mensagem automática ao confirmar", () => {
  it("vem desligada, com a mensagem de orientações já salva e ativa", () => {
    render(<Configuracoes />);
    expect(screen.getByText("Mensagem automática ao confirmar")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Orientações pré-tarefa")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Calça comprida jeans/)).toBeInTheDocument();
    expect(screen.getByLabelText("Ativa")).toBeChecked();
    const card = screen.getByText("Mensagem automática ao confirmar").closest("div[id='cfg-msg-auto']") as HTMLElement;
    expect(within(card).getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("liga o envio e persiste no localStorage", () => {
    render(<Configuracoes />);
    const card = screen.getByText("Mensagem automática ao confirmar").closest("div[id='cfg-msg-auto']") as HTMLElement;
    fireEvent.click(within(card).getByRole("switch"));
    expect(salvo().ativo).toBe(true);
  });

  it("escolhe quais confirmações disparam (manual começa desligado)", () => {
    render(<Configuracoes />);
    const card = screen.getByText("Mensagem automática ao confirmar").closest("div[id='cfg-msg-auto']") as HTMLElement;
    const manual = within(card).getByRole("checkbox", { name: /Confirmação manual/ });
    expect(manual).not.toBeChecked();
    fireEvent.click(manual);
    expect(salvo().gatilhos).toEqual({ prefup: true, fup: true, manual: true });
    fireEvent.click(within(card).getByRole("checkbox", { name: /Resposta do chapa ao PréFUP/ }));
    expect(salvo().gatilhos.prefup).toBe(false);
  });

  it("adiciona uma segunda mensagem e troca a ativa; excluir a ativa passa pra outra", () => {
    render(<Configuracoes />);
    const card = screen.getByText("Mensagem automática ao confirmar").closest("div[id='cfg-msg-auto']") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /Adicionar/ }));
    expect(salvo().mensagens).toHaveLength(2);
    expect(salvo().mensagemAtivaId).toBe("orientacoes-pre-tarefa");

    const nova = salvo().mensagens[1];
    fireEvent.click(within(card).getByLabelText("Usar esta"));
    expect(salvo().mensagemAtivaId).toBe(nova.id);

    fireEvent.click(within(card).getByRole("button", { name: /Excluir Nova mensagem/ }));
    expect(salvo().mensagens).toHaveLength(1);
    expect(salvo().mensagemAtivaId).toBe("orientacoes-pre-tarefa");
  });

  it("avisa quando o envio está ligado mas a mensagem ativa está vazia", () => {
    localStorage.setItem(
      "fup_settings",
      JSON.stringify({
        mensagemPosConfirmacao: {
          ativo: true,
          mensagens: [{ id: "x", nome: "Vazia", texto: "" }],
          mensagemAtivaId: "x",
        },
      }),
    );
    render(<Configuracoes />);
    expect(screen.getByText(/não há mensagem ativa com texto/)).toBeInTheDocument();
  });
});
