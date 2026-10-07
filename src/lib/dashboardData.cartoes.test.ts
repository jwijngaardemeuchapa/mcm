import { describe, expect, it } from "vitest";
import { reaproveitarCartoes, type CartoesGuardados } from "./dashboardData";

type Card = { id_tarefa: number; empresa: string; chapas: Array<{ id: string; status_contato: string }> };

const card = (id: number, status = "pendente"): Card => ({
  id_tarefa: id,
  empresa: `Empresa ${id}`,
  chapas: [{ id: `${id}-0`, status_contato: status }],
});

describe("reaproveitarCartoes — só o card que mudou ganha referência nova", () => {
  it("load igual ao anterior: todos os cards reaproveitados e mesma assinatura", () => {
    const vazio: CartoesGuardados<Card> = new Map();
    const a = reaproveitarCartoes(vazio, [card(1), card(2), card(3)]);
    const b = reaproveitarCartoes(a.guardados, [card(1), card(2), card(3)]); // objetos NOVOS, conteúdo igual
    expect(b.sig).toBe(a.sig);
    b.lista.forEach((c, i) => expect(c).toBe(a.lista[i]));
  });

  it("uma chapa mudou: só aquele card é novo, os outros mantêm a referência", () => {
    const a = reaproveitarCartoes(new Map(), [card(1), card(2), card(3)]);
    const b = reaproveitarCartoes(a.guardados, [card(1), card(2, "confirmado"), card(3)]);
    expect(b.sig).not.toBe(a.sig);
    expect(b.lista[0]).toBe(a.lista[0]);
    expect(b.lista[1]).not.toBe(a.lista[1]);
    expect(b.lista[1].chapas[0].status_contato).toBe("confirmado");
    expect(b.lista[2]).toBe(a.lista[2]);
  });

  it("card novo e card que sumiu: a lista e a assinatura refletem, sem sobras no cache", () => {
    const a = reaproveitarCartoes(new Map(), [card(1), card(2)]);
    const b = reaproveitarCartoes(a.guardados, [card(2), card(3)]);
    expect(b.lista.map((c) => c.id_tarefa)).toEqual([2, 3]);
    expect(b.sig).not.toBe(a.sig);
    expect([...b.guardados.keys()]).toEqual([2, 3]);
    expect(b.lista[0]).toBe(a.lista[1]);
  });

  it("ordem diferente muda a assinatura (a tela precisa reordenar), mas reaproveita os cards", () => {
    const a = reaproveitarCartoes(new Map(), [card(1), card(2)]);
    const b = reaproveitarCartoes(a.guardados, [card(2), card(1)]);
    expect(b.sig).not.toBe(a.sig);
    expect(b.lista[0]).toBe(a.lista[1]);
    expect(b.lista[1]).toBe(a.lista[0]);
  });

  it("lista vazia não quebra", () => {
    const a = reaproveitarCartoes(new Map(), [] as Card[]);
    expect(a.lista).toEqual([]);
    expect(a.sig).toBe("");
  });
});
