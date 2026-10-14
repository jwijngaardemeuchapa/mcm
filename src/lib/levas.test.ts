import { describe, expect, it, vi } from "vitest";
import { rodarEmLevas } from "./levas";

const itens = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

function montar(n: number, extra: Partial<Parameters<typeof rodarEmLevas<number>>[0]> = {}) {
  const log: string[] = [];
  const enviar = vi.fn(async (x: number) => { log.push(`envia ${x}`); });
  const esperar = vi.fn(async (s: number) => { log.push(`espera ${s}`); });
  const promessa = rodarEmLevas<number>({
    itens: itens(n), tamanhoLeva: 3, pausaEntreEnviosS: 7, pausaEntreLevasS: 300, enviar, esperar, ...extra,
  });
  return { promessa, log, enviar, esperar };
}

describe("rodarEmLevas — mesma cadência do BID em massa", () => {
  it("7 itens em levas de 3: pausa curta entre envios, longa entre levas, nada sobrando no fim", async () => {
    const { promessa, log } = montar(7);
    const r = await promessa;
    expect(r).toEqual({ enviados: 7, parou: false });
    expect(log).toEqual([
      "envia 1", "espera 7", "envia 2", "espera 7", "envia 3", "espera 300",
      "envia 4", "espera 7", "envia 5", "espera 7", "envia 6", "espera 300",
      "envia 7",
    ]);
  });

  it("lista vazia não faz nada", async () => {
    const { promessa, enviar, esperar } = montar(0);
    expect(await promessa).toEqual({ enviados: 0, parou: false });
    expect(enviar).not.toHaveBeenCalled();
    expect(esperar).not.toHaveBeenCalled();
  });

  it("para NA HORA quando a tarefa preenche no meio de uma leva: não manda o resto", async () => {
    let enviados = 0;
    const envio = vi.fn(async () => { enviados++; });
    const { promessa } = montar(10, {
      enviar: envio,
      deveParar: () => enviados >= 4, // "tarefa preenchida" depois do 4º envio
    });
    const r = await promessa;
    expect(r).toEqual({ enviados: 4, parou: true });
    expect(envio).toHaveBeenCalledTimes(4);
  });

  it("para antes da pausa de 5 min quando a leva fecha a tarefa (não espera à toa nem manda a próxima)", async () => {
    let enviados = 0;
    const esperas: number[] = [];
    const r = await rodarEmLevas<number>({
      itens: itens(9), tamanhoLeva: 3, pausaEntreEnviosS: 7, pausaEntreLevasS: 300,
      enviar: async () => { enviados++; },
      esperar: async (s) => { esperas.push(s); },
      deveParar: () => enviados >= 3, // fecha exatamente no fim da 1ª leva
    });
    expect(r).toEqual({ enviados: 3, parou: true });
    expect(esperas).toEqual([7, 7]); // nenhuma pausa de 300 s
  });

  it("cancelar (deveParar vira true durante uma pausa) encerra sem enviar o próximo", async () => {
    let cancelado = false;
    const enviados: number[] = [];
    const r = await rodarEmLevas<number>({
      itens: itens(6), tamanhoLeva: 3, pausaEntreEnviosS: 7, pausaEntreLevasS: 300,
      enviar: async (x) => { enviados.push(x); },
      esperar: async (s) => { if (s === 300) cancelado = true; },
      deveParar: () => cancelado,
    });
    expect(enviados).toEqual([1, 2, 3]);
    expect(r.parou).toBe(true);
  });

  it("deveParar assíncrono (consulta ao banco) também vale", async () => {
    let n = 0;
    const r = await rodarEmLevas<number>({
      itens: itens(5), tamanhoLeva: 5, pausaEntreEnviosS: 0, pausaEntreLevasS: 0,
      enviar: async () => { n++; },
      esperar: async () => {},
      deveParar: async () => { await Promise.resolve(); return n >= 2; },
    });
    expect(r).toEqual({ enviados: 2, parou: true });
  });
});
