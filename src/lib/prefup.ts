import { toSP, parseTaskDate } from "./datetime";

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

// Janela de disparo do template de PréFUP (aixkbF8X47lF-5Rt) — decide se o
// FUP usa o template (sem chatbot) em vez do bot D0. Cobre dois casos:
//   • tarefa é de amanhã em diante (D1 "clássico")
//   • tarefa é hoje mas falta mais de 5h pro início (pedido explícito do
//     usuário: mesmo no mesmo dia, disparo bem antecipado usa o template)
// Recebe a data da tarefa já formatada (yyyy-MM-dd, mesma convenção usada
// nos pontos de disparo) pra não duplicar timezone-parsing por chamador.
// Horas até o início usa parseTaskDate (respeita cidade_uf fora de SP),
// mesmo cálculo de minutesUntilStart em taskState.ts.
export function isPrefupTemplateWindow(
  taskDateStr: string,
  todayDateStr: string,
  dataTarefa: string,
  cidade_uf: string | null | undefined,
): boolean {
  if (taskDateStr > todayDateStr) return true;
  const hoursUntilStart = (parseTaskDate(dataTarefa, cidade_uf).getTime() - Date.now()) / 3_600_000;
  return hoursUntilStart > 5;
}
