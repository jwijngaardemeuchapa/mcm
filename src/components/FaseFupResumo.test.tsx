import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FaseFupResumo } from "./FaseFupResumo";

const base = { antecipada: false, fupOk: 0, aguardaFup: 0, prefupOk: 0, requested: 8 };

describe("FaseFupResumo", () => {
  it("fase do PréFUP sem ninguém confirmado no PréFUP: não desenha nada", () => {
    const { container } = render(<FaseFupResumo {...base} faseFup={false} onResetar={() => {}} />);
    expect(container.textContent).toBe("");
  });

  it("fase do PréFUP com confirmados: oferece 'Resetar PréFUPs' e o clique avisa quem chamou", () => {
    const resetar = vi.fn();
    render(<FaseFupResumo {...base} faseFup={false} prefupOk={5} onResetar={resetar} />);
    fireEvent.click(screen.getByText("Resetar PréFUPs"));
    expect(resetar).toHaveBeenCalledTimes(1);
  });

  it("sem onResetar (ex.: tela só de leitura) o botão não aparece", () => {
    const { container } = render(<FaseFupResumo {...base} faseFup={false} prefupOk={5} />);
    expect(container.textContent).toBe("");
  });

  it("o clique no botão não propaga (não abre/fecha o card por baixo)", () => {
    const aoClicarNoCard = vi.fn();
    render(
      <div onClick={aoClicarNoCard}>
        <FaseFupResumo {...base} faseFup={false} prefupOk={2} onResetar={() => {}} />
      </div>,
    );
    fireEvent.click(screen.getByText("Resetar PréFUPs"));
    expect(aoClicarNoCard).not.toHaveBeenCalled();
  });

  it("fase do FUP: 'FUP 3/8' e '5 aguardando FUP' com ícone e texto", () => {
    const { container } = render(<FaseFupResumo {...base} faseFup fupOk={3} aguardaFup={5} />);
    expect(screen.getByText("FUP 3/8")).toBeTruthy();
    expect(screen.getByText("5 aguardando FUP")).toBeTruthy();
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(1);
  });

  it("todos confirmaram o FUP: 'FUP 8/8' em verde (com ✓) e sem 'aguardando'", () => {
    const { container } = render(<FaseFupResumo {...base} faseFup fupOk={8} aguardaFup={0} />);
    expect(screen.getByText("FUP 8/8").className).toContain("text-success");
    expect(screen.queryByText(/aguardando FUP/)).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("fase do FUP sem nenhum dado de fase (ninguém confirmou ainda): não desenha nada", () => {
    const { container } = render(<FaseFupResumo {...base} faseFup />);
    expect(container.textContent).toBe("");
  });

  it("fase antecipada pelo botão: oferece 'Voltar ao PréFUP'; na janela automática não", () => {
    const desfazer = vi.fn();
    const a = render(<FaseFupResumo {...base} faseFup antecipada fupOk={1} aguardaFup={2} onDesfazer={desfazer} />);
    fireEvent.click(screen.getByText("Voltar ao PréFUP"));
    expect(desfazer).toHaveBeenCalledTimes(1);
    a.unmount();
    render(<FaseFupResumo {...base} faseFup fupOk={1} aguardaFup={2} onDesfazer={desfazer} />);
    expect(screen.queryByText("Voltar ao PréFUP")).toBeNull();
  });
});
