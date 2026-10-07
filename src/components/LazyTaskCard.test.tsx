import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O card real é pesado (banco, contextos, Radix); aqui só interessa QUANDO ele monta.
vi.mock("@/components/TaskCard", () => ({
  TaskCard: ({ task }: { task: { id_tarefa: number } }) => <div data-testid={`real-${task.id_tarefa}`}>card real</div>,
}));

import { LazyTaskCard, montarCardAgora } from "./LazyTaskCard";

type Callback = (entradas: Array<{ isIntersecting: boolean }>) => void;
let observadores: Array<{ cb: Callback; disconnect: ReturnType<typeof vi.fn> }> = [];

beforeEach(() => {
  observadores = [];
  class FakeIO {
    cb: Callback;
    disconnect = vi.fn();
    constructor(cb: Callback) {
      this.cb = cb;
      observadores.push(this);
    }
    observe() {}
    unobserve() {}
    takeRecords() { return []; }
  }
  vi.stubGlobal("IntersectionObserver", FakeIO);
});
afterEach(() => vi.unstubAllGlobals());

const tarefa = (id: number) => ({ id_tarefa: id, empresa: `Empresa ${id}`, data_tarefa: "2026-10-07T08:00:00-03:00", status_tarefa: "Em Andamento", chapas: [], fup_log: [] });
// props do TaskCard não importam aqui (o componente real está mockado)
const props = (id: number) => ({ task: tarefa(id), onRefresh: () => {} }) as unknown as React.ComponentProps<typeof LazyTaskCard>;

describe("LazyTaskCard — só monta o card pesado quando precisa", () => {
  it("começa como quadro leve (com data-task-card, pra rolar/destacar achar o lugar)", () => {
    const { container } = render(<LazyTaskCard {...props(7)} />);
    expect(screen.queryByTestId("real-7")).toBeNull();
    const quadro = container.querySelector('[data-task-card="7"]');
    expect(quadro?.hasAttribute("data-lazy")).toBe(true);
    expect(quadro?.textContent).toContain("Empresa 7");
  });

  it("monta o card real ao chegar perto da área visível e não volta a quadro", () => {
    render(<LazyTaskCard {...props(7)} />);
    act(() => observadores[0].cb([{ isIntersecting: false }]));
    expect(screen.queryByTestId("real-7")).toBeNull();
    act(() => observadores[0].cb([{ isIntersecting: true }]));
    expect(screen.getByTestId("real-7")).toBeTruthy();
    expect(observadores[0].disconnect).toHaveBeenCalled();
    // sai da tela de novo: continua montado (nenhum observador novo, nada some)
    expect(observadores.length).toBe(1);
    expect(screen.getByTestId("real-7")).toBeTruthy();
  });

  it("eager monta direto, sem observador", () => {
    render(<LazyTaskCard {...props(7)} eager />);
    expect(screen.getByTestId("real-7")).toBeTruthy();
    expect(observadores.length).toBe(0);
  });

  it("montarCardAgora(id) monta só o card pedido (rolar/destacar uma tarefa fora da tela)", () => {
    render(
      <>
        <LazyTaskCard {...props(1)} />
        <LazyTaskCard {...props(2)} />
      </>,
    );
    act(() => montarCardAgora(2));
    expect(screen.queryByTestId("real-1")).toBeNull();
    expect(screen.getByTestId("real-2")).toBeTruthy();
  });

  it("sem IntersectionObserver no ambiente: monta tudo como antes", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<LazyTaskCard {...props(3)} />);
    expect(screen.getByTestId("real-3")).toBeTruthy();
  });

  it("desmontar limpa o observador e o ouvinte de eventos", () => {
    const { unmount } = render(<LazyTaskCard {...props(5)} />);
    unmount();
    expect(observadores[0].disconnect).toHaveBeenCalled();
    expect(() => montarCardAgora(5)).not.toThrow();
  });
});
