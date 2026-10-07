import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UndoProvider, useUndo, useUndoActions } from "./undo";

// Por que existe: cada confirmação empilha um "desfazer"; quando isso re-renderizava
// todos os consumidores, os centenas de TaskCards refaziam junto (2-3 s de tela travada).
describe("UndoProvider — quem só usa as ações não re-renderiza a cada push", () => {
  it("consumidor de useUndoActions fica quieto; o do botão Desfazer (useUndo) atualiza", () => {
    let rendersCartao = 0;
    let rendersBotao = 0;
    let ultimoVisto: string | null = null;

    function Cartao() {
      const { push } = useUndoActions();
      rendersCartao++;
      return <button onClick={() => push({ label: "confirmou", revert: async () => {} })}>empilhar</button>;
    }
    function BotaoDesfazer() {
      const { last } = useUndo();
      rendersBotao++;
      ultimoVisto = last?.label ?? null;
      return <span>{last ? `desfazer: ${last.label}` : "nada"}</span>;
    }

    render(
      <UndoProvider>
        <Cartao />
        <BotaoDesfazer />
      </UndoProvider>,
    );
    const antesCartao = rendersCartao;
    const antesBotao = rendersBotao;

    fireEvent.click(screen.getByText("empilhar"));
    fireEvent.click(screen.getByText("empilhar"));

    expect(rendersCartao).toBe(antesCartao); // nenhum render extra por causa do push
    expect(rendersBotao).toBeGreaterThan(antesBotao); // o botão precisa saber que há algo pra desfazer
    expect(ultimoVisto).toBe("confirmou");
    expect(screen.getByText("desfazer: confirmou")).toBeTruthy();
  });

  it("desfazer continua funcionando: reverte, tira da pilha e avisa quem usa o último", async () => {
    let revertido = 0;
    let acoes!: ReturnType<typeof useUndoActions>;
    function Captura() {
      acoes = useUndoActions();
      const { last } = useUndo();
      return <span>{last ? "tem" : "vazio"}</span>;
    }
    render(
      <UndoProvider>
        <Captura />
      </UndoProvider>,
    );
    expect(screen.getByText("vazio")).toBeTruthy();
    act(() => acoes.push({ label: "a", revert: async () => { revertido++; } }));
    expect(screen.getByText("tem")).toBeTruthy();
    await act(async () => { await acoes.undo(); });
    expect(revertido).toBe(1);
    expect(screen.getByText("vazio")).toBeTruthy();
  });

  it("as ações mantêm a mesma identidade entre renders (memo dos cards depende disso)", () => {
    const vistas: Array<ReturnType<typeof useUndoActions>> = [];
    function Captura() {
      vistas.push(useUndoActions());
      useUndo(); // assina o "último" pra forçar render a cada push
      return null;
    }
    let acoes!: ReturnType<typeof useUndoActions>;
    function Pega() { acoes = useUndoActions(); return null; }
    render(
      <UndoProvider>
        <Pega />
        <Captura />
      </UndoProvider>,
    );
    act(() => acoes.push({ label: "x", revert: async () => {} }));
    act(() => acoes.push({ label: "y", revert: async () => {} }));
    expect(vistas.length).toBeGreaterThan(1);
    expect(new Set(vistas).size).toBe(1);
  });
});
