import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

afterEach(() => vi.restoreAllMocks());

function Controlado({ onChange }: { onChange?: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        onChange?.(v);
      }}
    >
      <CollapsibleTrigger>abrir</CollapsibleTrigger>
      <CollapsibleContent className="conteudo">segredo</CollapsibleContent>
    </Collapsible>
  );
}

describe("Collapsible — conteúdo só existe aberto", () => {
  it("fechado não monta o conteúdo e NÃO mede layout; aberto mostra e fechar de novo some", () => {
    const medir = vi.spyOn(Element.prototype, "getBoundingClientRect");
    const mudou = vi.fn();
    render(<Controlado onChange={mudou} />);
    expect(screen.queryByText("segredo")).toBeNull();
    expect(medir).not.toHaveBeenCalled(); // era aqui que cada card pagava ~3 reflows forçados

    fireEvent.click(screen.getByText("abrir"));
    expect(screen.getByText("segredo")).toBeTruthy();
    expect(mudou).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByText("abrir"));
    expect(screen.queryByText("segredo")).toBeNull();
    expect(mudou).toHaveBeenLastCalledWith(false);
  });

  it("repassa a classe ao conteúdo aberto", () => {
    render(
      <Collapsible open>
        <CollapsibleContent className="conteudo">oi</CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.getByText("oi").className).toContain("conteudo");
  });

  it("sem 'open' (não controlado) funciona com defaultOpen e com o clique", () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>alternar</CollapsibleTrigger>
        <CollapsibleContent>visivel</CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.getByText("visivel")).toBeTruthy();
    fireEvent.click(screen.getByText("alternar"));
    expect(screen.queryByText("visivel")).toBeNull();
    fireEvent.click(screen.getByText("alternar"));
    expect(screen.getByText("visivel")).toBeTruthy();
  });

  it("forceMount mantém o conteúdo mesmo fechado", () => {
    render(
      <Collapsible open={false}>
        <CollapsibleContent forceMount>sempre</CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.getByText("sempre")).toBeTruthy();
  });
});
