import { fmtSP, parseTaskDate, todayDateISO_SP } from "./datetime";
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

// Estamos na janela do FUP (menos de 5h antes da tarefa)? É a mesma fronteira que, no disparo,
// escolhe PréFUP (template) x FUP (bot) — usada pra decidir se o FUP em massa reforça quem só
// confirmou o PréFUP (ver fasesConfirmacao.ts).
export function emJanelaDeFup(dataTarefa: string, cidadeUf?: string | null): boolean {
  return !isPrefupTemplateWindow(fmtSP(dataTarefa, "yyyy-MM-dd"), todayDateISO_SP(), dataTarefa, cidadeUf);
}

// Descobre qual disparo (PréFUP ou FUP normal) gerou uma confirmação — olha
// o fup_log mais recente do chapa/tarefa (aguarda_resposta_chat = 1 quando
// foi PréFUP). Usado tanto na confirmação automática (processFirestoreMessage)
// quanto na manual, pra gravar chapas.confirmado_via e decidir se a mensagem
// automática pós-confirmação vale (gatilho PréFUP x FUP).
//
// Vale o disparo do PRÓPRIO chapa. O FUP em massa grava, além de uma linha por
// chapa, uma linha-resumo da tarefa (chapa_id nulo, sem o flag) com o MESMO
// data_disparo — e a consulta antiga (chapa OU resumo, ordenada só por data)
// empatava e podia devolver o resumo: toda confirmação de um PréFUP em massa
// virava "fup". Só sem disparo próprio é que cai no registro geral da tarefa;
// empate de data desempata pelo último gravado.
export async function canalConfirmacao(
  idTarefa: number,
  chapaId: string | null,
): Promise<"prefup" | "fup" | null> {
  const db = await getDb();
  if (chapaId) {
    const proprio = await db.select<{ aguarda_resposta_chat: number | null }[]>(
      `SELECT aguarda_resposta_chat FROM fup_log
       WHERE id_tarefa = ? AND chapa_id = ?
       ORDER BY data_disparo DESC, rowid DESC LIMIT 1`,
      [idTarefa, chapaId],
    );
    if (proprio.length > 0) return proprio[0].aguarda_resposta_chat ? "prefup" : "fup";
  }
  const geral = await db.select<{ aguarda_resposta_chat: number | null }[]>(
    `SELECT aguarda_resposta_chat FROM fup_log
     WHERE id_tarefa = ? AND chapa_id IS NULL
     ORDER BY data_disparo DESC, rowid DESC LIMIT 1`,
    [idTarefa],
  );
  if (geral.length === 0) return null;
  return geral[0].aguarda_resposta_chat ? "prefup" : "fup";
}
