import { describe, expect, it } from "vitest";
import {
  chavesSelecionaveis,
  linhasExibidas,
  separarSelecionados,
  type ItemRanqueado,
} from "./bidRecomendados";

const item = (i: number, origin: ItemRanqueado["origin"] = "disponivel", telefone: string | null = `1199${i}`): ItemRanqueado => ({
  _key: `k${i}`, origin, telefone,
});
const ranking = (n: number) => Array.from({ length: n }, (_, i) => item(i));

describe("Recomendados — selecionar todos pega o ranking INTEIRO, não só uma leva de 30", () => {
  it("150 ranqueados: selecionar todos marca os 150 (era 30)", () => {
    expect(chavesSelecionaveis(ranking(150))).toHaveLength(150);
  });

  it("quem não tem telefone não entra na seleção", () => {
    const r = [item(1), item(2, "disponivel", null), item(3)];
    expect(chavesSelecionaveis(r)).toEqual(["k1", "k3"]);
  });

  it("a ordem do ranking é preservada na seleção (o disparo sai do melhor pro pior)", () => {
    const r = ranking(5);
    const { bot } = separarSelecionados(r, new Set(["k4", "k0", "k2"]));
    expect(bot.map((x) => x._key)).toEqual(["k0", "k2", "k4"]);
  });

  it("separa por mecanismo: Lead Região vai pra Captação, o resto pro bot de BID", () => {
    const r = [item(1, "disponivel"), item(2, "lead_regiao"), item(3, "novo"), item(4, "lead_saac"), item(5, "lead_regiao")];
    const { bot, captacao } = separarSelecionados(r, new Set(r.map((x) => x._key)));
    expect(bot.map((x) => x.origin)).toEqual(["disponivel", "novo", "lead_saac"]);
    expect(captacao.map((x) => x._key)).toEqual(["k2", "k5"]);
  });

  it("selecionados fora do ranking atual (ex.: buscou outro nome) são ignorados", () => {
    const { bot, captacao } = separarSelecionados(ranking(3), new Set(["k1", "fantasma"]));
    expect(bot.map((x) => x._key)).toEqual(["k1"]);
    expect(captacao).toEqual([]);
  });

  it("sem marcar nada, nada a disparar", () => {
    expect(separarSelecionados(ranking(10), new Set())).toEqual({ bot: [], captacao: [] });
  });
});

describe("linhasExibidas — mesmo 'ver todos' das Disponíveis", () => {
  it("mostra 40 até pedir pra ver todos", () => {
    expect(linhasExibidas(ranking(150), false)).toHaveLength(40);
    expect(linhasExibidas(ranking(150), true)).toHaveLength(150);
    expect(linhasExibidas(ranking(10), false)).toHaveLength(10);
  });
});
