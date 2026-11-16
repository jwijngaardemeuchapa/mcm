import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FillRateBar } from "./FillRateBar";

const barra = (container: HTMLElement) => container.querySelector('[role="img"] > div') as HTMLElement;

describe("FillRateBar — nunca só a cor", () => {
  it("crítico (< 50%): listras na barra + 'crítico' em texto no tooltip e no leitor de tela", () => {
    const { container } = render(<FillRateBar confirmed={1} requested={5} />);
    expect(barra(container).className).toContain("repeating-linear-gradient");
    expect(container.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe("Fill rate 20% (1 de 5) — crítico");
    expect((container.firstElementChild as HTMLElement).getAttribute("title")).toBe("Fill rate 20% (1 de 5) — crítico");
  });

  it("atenção (50% a 79%) e dentro da meta (≥ 80%): barra lisa, com o estado em texto", () => {
    const meio = render(<FillRateBar confirmed={3} requested={5} />);
    expect(barra(meio.container).className).not.toContain("repeating-linear-gradient");
    expect(meio.container.querySelector('[role="img"]')!.getAttribute("aria-label")).toContain("atenção");
    const cheio = render(<FillRateBar confirmed={5} requested={5} variant="compact" />);
    expect(barra(cheio.container).className).not.toContain("repeating-linear-gradient");
    expect(cheio.container.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe("Fill rate 100% (5 de 5) — dentro da meta");
  });

  it("variante compacta também leva as listras no crítico; sem vagas pedidas não quebra", () => {
    const { container } = render(<FillRateBar confirmed={0} requested={4} variant="compact" />);
    expect(barra(container).className).toContain("repeating-linear-gradient");
    const vazio = render(<FillRateBar confirmed={0} requested={0} />);
    expect(vazio.container.querySelector('[role="img"]')!.getAttribute("aria-label")).toContain("0%");
  });
});
