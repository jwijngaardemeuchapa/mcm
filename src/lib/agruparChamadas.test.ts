import { describe, expect, it, vi } from "vitest";
import { criarExecutorAgrupado } from "./agruparChamadas";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("criarExecutorAgrupado — rajada de pedidos vira no máximo 2 execuções", () => {
  it("50 pedidos enquanto roda: executa a primeira e UMA extra, nunca duas ao mesmo tempo", async () => {
    let simultaneas = 0;
    let maxSimultaneas = 0;
    const tarefa = vi.fn(async () => {
      simultaneas++;
      maxSimultaneas = Math.max(maxSimultaneas, simultaneas);
      await espera(20);
      simultaneas--;
    });
    const executar = criarExecutorAgrupado(tarefa);
    const pedidos = Array.from({ length: 50 }, () => executar());
    await Promise.all(pedidos);
    await espera(80); // a execução extra roda depois que a primeira termina
    expect(tarefa).toHaveBeenCalledTimes(2);
    expect(maxSimultaneas).toBe(1);
  });

  it("pedido isolado executa uma vez; outro depois que terminou executa de novo", async () => {
    const tarefa = vi.fn(async () => {});
    const executar = criarExecutorAgrupado(tarefa);
    await executar();
    expect(tarefa).toHaveBeenCalledTimes(1);
    await executar();
    expect(tarefa).toHaveBeenCalledTimes(2);
  });

  it("a execução extra enxerga o estado mais novo (não reaproveita resultado velho)", async () => {
    let versao = 0;
    const vistas: number[] = [];
    const executar = criarExecutorAgrupado(async () => {
      vistas.push(versao);
      await espera(15);
    });
    const p = executar();
    versao = 1;
    void executar();
    versao = 2;
    void executar();
    await p;
    await espera(60);
    expect(vistas).toEqual([0, 2]);
  });

  it("erro na tarefa não trava o executor: o próximo pedido roda normalmente", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    let n = 0;
    const executar = criarExecutorAgrupado(async () => {
      n++;
      if (n === 1) throw new Error("banco ocupado");
    });
    await expect(executar()).resolves.toBeUndefined();
    await executar();
    expect(n).toBe(2);
    erro.mockRestore();
  });
});
