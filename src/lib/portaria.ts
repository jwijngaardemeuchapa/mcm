import { normalize } from "./normalize";
import type { PortariaRule } from "./settings";

/**
 * Lista da portaria: pra cada regra (empresa + horas antes), as tarefas dessa empresa que começam dentro do
 * prazo ganham um lembrete "enviar a lista de nomes pra liberação". Era parte do popup de proximidade;
 * a regra é a mesma, só que agora roda sobre as tarefas do alarme.
 */
export type PortariaAlerta<T> = { tarefa: T; rule: PortariaRule; minutesLeft: number; nomes: string[] };

export function calcularPortaria<T extends { empresa: string; minParaTarefa: number; nomes: string[] }>(
  tarefas: T[],
  rules: PortariaRule[],
): PortariaAlerta<T>[] {
  const alerts: PortariaAlerta<T>[] = [];
  for (const rule of rules) {
    const maxMin = rule.horasAntes * 60;
    for (const tarefa of tarefas) {
      if (tarefa.minParaTarefa <= 0 || tarefa.minParaTarefa > maxMin) continue;
      if (!normalize(tarefa.empresa).includes(normalize(rule.empresa))) continue;
      if (tarefa.nomes.length === 0) continue; // lista vazia não tem o que mandar
      alerts.push({ tarefa, rule, minutesLeft: tarefa.minParaTarefa, nomes: tarefa.nomes });
    }
  }
  return alerts.sort((a, b) => a.minutesLeft - b.minutesLeft);
}
