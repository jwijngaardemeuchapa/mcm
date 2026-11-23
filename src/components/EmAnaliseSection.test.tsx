import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmAnaliseSection } from "./EmAnaliseSection";
import { todayDateISO_SP } from "@/lib/datetime";

beforeEach(() => localStorage.clear());

const hoje = todayDateISO_SP();
const tarefas = [
  { id_tarefa: 11, empresa: "ACME Logística", data_tarefa: `${hoje}T14:30:00-03:00`, status_tarefa: "Em Análise", quantidade_chapas: 4, criada_em: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
  { id_tarefa: 12, empresa: "Beta Cargas", data_tarefa: `${hoje}T16:00:00-03:00`, status_tarefa: "Em Análise", quantidade_chapas: 0, criada_em: null },
];

describe("EmAnaliseSection", () => {
  it("não desenha nada quando não há tarefa em análise", () => {
    const { container } = render(<EmAnaliseSection tarefas={[]} onAbrir={() => {}} />);
    expect(container.textContent).toBe("");
  });

  it("mostra empresa, quando, chapas pedidos e criada, com a contagem no título", () => {
    render(<EmAnaliseSection tarefas={tarefas} onAbrir={() => {}} />);
    expect(screen.getByRole("heading", { name: "Em análise" })).toBeTruthy();
    expect(screen.getByText("ACME Logística")).toBeTruthy();
    expect(screen.getByText("Beta Cargas")).toBeTruthy();
    expect(screen.getAllByText("Hoje").length).toBe(2);
    expect(screen.getByText(/14:30/)).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("há 3 h")).toBeTruthy();
  });

  it("clicar na linha abre a tarefa", () => {
    const onAbrir = vi.fn();
    render(<EmAnaliseSection tarefas={tarefas} onAbrir={onAbrir} />);
    fireEvent.click(screen.getByTitle("Abrir a tarefa #11"));
    expect(onAbrir).toHaveBeenCalledWith(11);
  });

  it("recolhe e lembra a escolha", () => {
    const { unmount } = render(<EmAnaliseSection tarefas={tarefas} onAbrir={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Em análise/ }));
    expect(screen.queryByText("ACME Logística")).toBeNull();
    unmount();
    render(<EmAnaliseSection tarefas={tarefas} onAbrir={() => {}} />);
    expect(screen.queryByText("ACME Logística")).toBeNull(); // continua recolhida
  });

  it("avisa que a data de criação não vem do Metabase só quando NENHUMA tarefa tem", () => {
    const { rerender } = render(<EmAnaliseSection tarefas={tarefas} onAbrir={() => {}} />);
    expect(screen.queryByText(/ainda não vem do Metabase/)).toBeNull();
    rerender(<EmAnaliseSection tarefas={tarefas.map((t) => ({ ...t, criada_em: null }))} onAbrir={() => {}} />);
    expect(screen.getByText(/ainda não vem do Metabase/)).toBeTruthy();
  });
});
