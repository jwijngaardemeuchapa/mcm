import { toSP } from "./datetime";

/**
 * Returns true when a fup_log entry qualifies as a PréFUP — a FUP fired
 * ahead of time for a task that hasn't started yet:
 *
 *   • Task is on the NEXT calendar day (or later) relative to the FUP date
 *   • OR  task starts at 17h+ and the FUP was fired before 15h on the same day
 *   • OR  FUP was fired from 15h+ for a task on the next day
 *     (this last case is already covered by the first condition)
 */
export function isPrefup(dataDisparo: string, dataTarefa: string): boolean {
  const disparo = toSP(dataDisparo);
  const tarefa = toSP(dataTarefa);

  const disparoDate = disparo.toISOString().slice(0, 10);
  const tarefaDate = tarefa.toISOString().slice(0, 10);

  if (tarefaDate > disparoDate) return true;

  if (tarefaDate === disparoDate) {
    const tarefaHour = tarefa.getHours();
    const disparoHour = disparo.getHours();
    if (tarefaHour >= 17 && disparoHour < 15) return true;
  }

  return false;
}
