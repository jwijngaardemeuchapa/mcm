import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FasesChip } from "./FasesChip";

describe("FasesChip — as duas fases de confirmação na linha do chapa", () => {
  it("sem nenhuma fase não mostra nada", () => {
    const { container } = render(<FasesChip prefup={null} fup={null} />);
    expect(container.textContent).toBe("");
  });

  it("só PréFUP: 'PréFUP ✓' e 'FUP —' (reforço ainda sem resposta)", () => {
    render(<FasesChip prefup="2026-10-28T12:00:00Z" fup={null} />);
    expect(screen.getByText("PréFUP ✓")).toBeTruthy();
    expect(screen.getByText("FUP —")).toBeTruthy();
    expect(screen.queryByText("FUP ✓")).toBeNull();
  });

  it("as duas: 'PréFUP ✓' e 'FUP ✓', sem o traço", () => {
    render(<FasesChip prefup="2026-10-28T12:00:00Z" fup="2026-10-28T20:00:00Z" />);
    expect(screen.getByText("PréFUP ✓")).toBeTruthy();
    expect(screen.getByText("FUP ✓")).toBeTruthy();
    expect(screen.queryByText("FUP —")).toBeNull();
  });

  it("só FUP (confirmou direto no FUP): só 'FUP ✓'", () => {
    render(<FasesChip fup="2026-10-28T20:00:00Z" />);
    expect(screen.getByText("FUP ✓")).toBeTruthy();
    expect(screen.queryByText("PréFUP ✓")).toBeNull();
    expect(screen.queryByText("FUP —")).toBeNull();
  });

  it("data ilegível na flag não derruba a linha", () => {
    expect(() => render(<FasesChip prefup="lixo" fup="outro lixo" />)).not.toThrow();
    expect(screen.getByText("PréFUP ✓").getAttribute("title")).toContain("lixo");
  });
});
