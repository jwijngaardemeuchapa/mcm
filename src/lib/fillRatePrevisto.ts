import type { TaskWithChapas } from "@/components/TaskCard";

// Fill Rate "cru" (confirmados/quantidade_chapas atual) subestima o problema
// real: o pedido original do cliente costuma cair antes da tarefa entrar Em
// Andamento (cancelamento parcial, ajuste de escopo etc.), então comparar
// confirmados contra o pedido original de tarefas ainda abertas é
// pessimista demais. Em vez disso, aprende a "taxa de encolhimento" média
// (quantidade_chapas_em_andamento / quantidade_chapas_original) das tarefas
// que JÁ passaram por essa transição recentemente, e aplica essa taxa pra
// projetar quantas chapas as tarefas ainda abertas provavelmente vão pedir
// de verdade quando entrarem Em Andamento — daí "previsão", não o número
// cru de hoje.

const MIN_AMOSTRA = 3; // poucas tarefas com transição = razão não confiável

export function taxaEncolhimento(tarefas: TaskWithChapas[]): number | null {
  const comTransicao = tarefas.filter(
    (t) =>
      (t.quantidade_chapas_original ?? 0) > 0 &&
      t.quantidade_chapas_em_andamento != null,
  );
  if (comTransicao.length < MIN_AMOSTRA) return null;
  const soma = comTransicao.reduce(
    (acc, t) => acc + (t.quantidade_chapas_em_andamento as number) / (t.quantidade_chapas_original as number),
    0,
  );
  return soma / comTransicao.length;
}

// Fill rate previsto do conjunto de tarefas: para as já Em Andamento (ou
// além), usa o retrato real congelado na transição — não precisa prever o
// que já aconteceu. Para as ainda abertas, projeta quantidade_chapas atual
// × taxa de encolhimento aprendida. Se não há amostra suficiente pra
// calcular a taxa, cai pro fill rate cru (mesmo comportamento de antes).
export function fillRatePrevisto(
  tarefas: TaskWithChapas[],
  confirmadosPorTarefa: Map<number, number>,
  amostraTarefas: TaskWithChapas[] = tarefas,
): { pct: number; taxa: number | null } {
  const taxa = taxaEncolhimento(amostraTarefas);
  let confirmados = 0;
  let previsto = 0;
  for (const t of tarefas) {
    const conf = confirmadosPorTarefa.get(t.id_tarefa) ?? 0;
    confirmados += conf;
    if (t.quantidade_chapas_em_andamento != null) {
      previsto += t.quantidade_chapas_em_andamento;
    } else if (taxa != null) {
      previsto += Math.round(t.quantidade_chapas * taxa);
    } else {
      previsto += t.quantidade_chapas;
    }
  }
  return { pct: previsto > 0 ? Math.round((confirmados / previsto) * 100) : 0, taxa };
}
