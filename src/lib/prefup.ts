import { parseTaskDate } from "./datetime";

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
