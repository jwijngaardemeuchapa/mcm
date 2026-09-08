import { parseTaskDate } from "./datetime";
import { getDb } from "./db";

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

// Determina se uma confirmação (automática ou manual) deve ser atribuída ao
// PréFUP ou ao FUP normal — olha o disparo mais recente pra esse chapa na
// tarefa (específico por chapa_id, ou em massa pra tarefa inteira quando
// chapa_id é nulo), já que é essa a mensagem que a pessoa está de fato
// respondendo. Retorna null se não achar nenhum disparo (ex.: confirmação
// manual sem FUP disparado ainda).
export async function canalConfirmacao(
  idTarefa: number,
  chapaId: string | null,
): Promise<"prefup" | "fup" | null> {
  const db = await getDb();
  const rows = await db.select<{ aguarda_resposta_chat: number | null }[]>(
    `SELECT aguarda_resposta_chat FROM fup_log
     WHERE id_tarefa = ? AND (chapa_id = ? OR chapa_id IS NULL)
     ORDER BY data_disparo DESC LIMIT 1`,
    [idTarefa, chapaId],
  );
  if (rows.length === 0) return null;
  return rows[0].aguarda_resposta_chat ? "prefup" : "fup";
}
