import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GrupoBadge } from "./GrupoBadge";

const grupo = {
  ids: [101, 102, 103],
  membros: [
    { id_tarefa: 101, quantidade_chapas: 1, status_tarefa: "Em Aberto", chapas: [{}] },
    { id_tarefa: 102, quantidade_chapas: 1, status_tarefa: "Em Aberto", chapas: [] },
    { id_tarefa: 103, quantidade_chapas: 2, status_tarefa: "Em Aberto", chapas: [{}, {}] },
  ],
};

describe("GrupoBadge", () => {
  it("sem grupo (ou com uma tarefa só) não desenha nada", () => {
    const a = render(<GrupoBadge grupo={undefined} />);
    expect(a.container.textContent).toBe("");
    const b = render(<GrupoBadge grupo={{ ids: [1], membros: [{ id_tarefa: 1 }] }} />);
    expect(b.container.textContent).toBe("");
  });

  it("mostra 'Grupo · N tarefas' com ícone e texto", () => {
    const { container } = render(<GrupoBadge grupo={grupo} />);
    expect(screen.getByText("Grupo · 3 tarefas")).toBeTruthy();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("ao clicar lista as tarefas (com link) e 'Desfazer grupo' entrega os ids", () => {
    const desfazer = vi.fn();
    render(<GrupoBadge grupo={grupo} onDesfazer={desfazer} />);
    fireEvent.click(screen.getByText("Grupo · 3 tarefas"));
    expect(screen.getByText("3 tarefas neste card")).toBeTruthy();
    expect(screen.getByText("#102").closest("a")?.getAttribute("href")).toBe("https://app.meu-chapa.com/admin/edit-task/102");
    expect(screen.getByText("0/1 chapas")).toBeTruthy();
    expect(screen.getByText("2/2 chapas")).toBeTruthy();
    fireEvent.click(screen.getByText("Desfazer grupo"));
    expect(desfazer).toHaveBeenCalledWith([101, 102, 103]);
  });

  it("sem onDesfazer não oferece o botão", () => {
    render(<GrupoBadge grupo={grupo} />);
    fireEvent.click(screen.getByText("Grupo · 3 tarefas"));
    expect(screen.queryByText("Desfazer grupo")).toBeNull();
  });

  it("clicar no selo não propaga o clique (não abre/fecha o card por baixo)", () => {
    const aoClicarNoCard = vi.fn();
    render(
      <div onClick={aoClicarNoCard}>
        <GrupoBadge grupo={grupo} />
      </div>,
    );
    fireEvent.click(screen.getByText("Grupo · 3 tarefas"));
    expect(aoClicarNoCard).not.toHaveBeenCalled();
  });
});
