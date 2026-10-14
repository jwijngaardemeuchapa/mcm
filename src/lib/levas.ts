/**
 * Envia `itens` em LEVAS: dentro de uma leva, uma pausa curta entre envios; entre
 * levas, uma pausa longa. Antes de cada envio (e antes de cada pausa) pergunta se
 * deve parar — o analista cancelou ou a tarefa já foi preenchida — e encerra na hora,
 * sem mandar o resto.
 *
 * É a mesma cadência do BID em massa (BidDispatchQueue._run: 30 de cada vez, 7 s
 * entre envios, 5 min entre levas), usada aqui pra Captação de Leads Região.
 */
export type OpcoesLevas<T> = {
  itens: T[];
  tamanhoLeva: number;
  pausaEntreEnviosS: number;
  pausaEntreLevasS: number;
  enviar: (item: T) => Promise<void>;
  esperar: (segundos: number) => Promise<void>;
  /** true = encerra (cancelado, tarefa preenchida...). Consultada antes de cada envio e de cada pausa. */
  deveParar?: () => boolean | Promise<boolean>;
};

export type ResultadoLevas = { enviados: number; parou: boolean };

export async function rodarEmLevas<T>(o: OpcoesLevas<T>): Promise<ResultadoLevas> {
  const parar = async () => (o.deveParar ? await o.deveParar() : false);
  let enviados = 0;
  let offset = 0;
  while (offset < o.itens.length) {
    const leva = o.itens.slice(offset, offset + o.tamanhoLeva);
    for (let i = 0; i < leva.length; i++) {
      if (await parar()) return { enviados, parou: true };
      await o.enviar(leva[i]);
      enviados++;
      if (i < leva.length - 1) await o.esperar(o.pausaEntreEnviosS);
    }
    offset += leva.length;
    if (offset < o.itens.length) {
      if (await parar()) return { enviados, parou: true };
      await o.esperar(o.pausaEntreLevasS);
    }
  }
  return { enviados, parou: false };
}
