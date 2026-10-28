import { describe, expect, it } from "vitest";
import { calcularPortaria } from "./portaria";

const regra = (empresa: string, horasAntes: number, id = "r1") => ({ id, empresa, horasAntes }) as never;
const tarefa = (empresa: string, minParaTarefa: number, nomes: string[] = ["Ana", "Bia"]) => ({ empresa, minParaTarefa, nomes });

describe("calcularPortaria", () => {
  it("avisa quando a tarefa da empresa começa dentro do prazo da regra", () => {
    const r = calcularPortaria([tarefa("Transportes Alfa LTDA", 200)], [regra("alfa", 4)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ minutesLeft: 200, nomes: ["Ana", "Bia"] });
  });

  it("não avisa fora do prazo, depois do início, de outra empresa ou sem nomes", () => {
    const rules = [regra("alfa", 4)];
    expect(calcularPortaria([tarefa("Alfa", 241)], rules)).toEqual([]);
    expect(calcularPortaria([tarefa("Alfa", 0)], rules)).toEqual([]);
    expect(calcularPortaria([tarefa("Alfa", -5)], rules)).toEqual([]);
    expect(calcularPortaria([tarefa("Beta", 60)], rules)).toEqual([]);
    expect(calcularPortaria([tarefa("Alfa", 60, [])], rules)).toEqual([]);
  });

  it("ignora acento e caixa no nome da empresa", () => {
    expect(calcularPortaria([tarefa("LOGÍSTICA Beta", 60)], [regra("logistica", 2)])).toHaveLength(1);
  });

  it("ordena pelas que começam primeiro; uma tarefa pode casar com mais de uma regra", () => {
    const r = calcularPortaria(
      [tarefa("Alfa", 120), tarefa("Alfa Sul", 30)],
      [regra("alfa", 4, "a"), regra("sul", 4, "b")],
    );
    expect(r.map((x) => [x.rule.id, x.minutesLeft])).toEqual([["a", 30], ["b", 30], ["a", 120]]);
  });
});
