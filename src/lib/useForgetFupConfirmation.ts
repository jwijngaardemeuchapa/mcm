import { useEffect } from "react";
import { readSettings } from "./settings";
import { getDb } from "./db";
import { minutesUntil, somaDiasISO, todayDateISO_SP } from "./datetime";
import { logActivity } from "./activityLog";

/**
 * Bloco 4 do roteiro: uma confirmação feita muitas horas antes da tarefa
 * (padrão fupEsquecerConfirmacaoHoras, default 6h) não é mais um sinal
 * confiável de comparecimento — reabre pra 'pendente' pra entrar de volta
 * no próximo FUP em massa (que hoje exclui confirmados, TaskCard.tsx:556).
 *
 * Só age em tarefas que ainda não começaram (minutesUntil > 0) — nunca
 * reabre confirmação de tarefa em andamento/concluída.
 *
 * Crítico: limpa data_contato junto com o status_contato. Se só o status
 * voltasse pra pendente e data_contato ficasse com o timestamp antigo, a
 * mesma condição continuaria "verdadeira" indefinidamente pra qualquer
 * outra leitura futura desse campo — mesma lição já aplicada em
 * TaskCard.tsx (onUndoOutcome, reabertura manual).
 */
export type ConfirmacaoCandidata = {
  id: string;
  nome_chapa: string | null;
  empresa: string;
  id_tarefa: number;
  data_tarefa: string;
  data_contato: string;
};

type BancoSelect = { select<T>(sql: string, params?: unknown[]): Promise<T> };

/**
 * Confirmações a reabrir agora: tarefa que ainda não começou e confirmação mais
 * velha que o limiar. A consulta só traz tarefas de ontem em diante — antes trazia
 * as confirmações de TODO o histórico a cada minuto (dezenas de milhares de linhas)
 * pra descartar quase todas em JS por "tarefa já começou". Tarefa de antes de ontem
 * já começou em qualquer fuso do Brasil, então o resultado é o mesmo.
 */
export async function buscarConfirmacoesEsquecidas(
  db: BancoSelect,
  limiarHoras: number,
  hojeISO: string = todayDateISO_SP(),
): Promise<ConfirmacaoCandidata[]> {
  const rows = await db.select<ConfirmacaoCandidata[]>(
    `SELECT c.id, c.nome_chapa, t.empresa, t.id_tarefa, t.data_tarefa, c.data_contato
     FROM chapas c
     JOIN tarefas t ON c.id_tarefa = t.id_tarefa
     WHERE t.ativo = 1
       AND t.status_tarefa NOT IN ('Concluído', 'Cancelado')
       AND c.status_contato = 'confirmado'
       AND c.data_contato IS NOT NULL
       AND substr(t.data_tarefa, 1, 10) >= ?`,
    [somaDiasISO(hojeISO, -1)],
  );
  const limiarMs = limiarHoras * 60 * 60 * 1000;
  const now = Date.now();
  return rows.filter((r) => {
    // Tarefa já começou/passou: confirmação antiga não é "esquecida",
    // é só tardia — nunca reabrir depois que a janela de ação passou.
    if (minutesUntil(r.data_tarefa) <= 0) return false;
    return now - new Date(r.data_contato).getTime() > limiarMs;
  });
}

export function useForgetFupConfirmation() {
  useEffect(() => {
    async function poll() {
      const { fupEsquecerConfirmacaoHoras } = readSettings();
      if (!fupEsquecerConfirmacaoHoras || fupEsquecerConfirmacaoHoras <= 0) return;

      try {
        const db = await getDb();
        const rows = await buscarConfirmacoesEsquecidas(db, fupEsquecerConfirmacaoHoras);
        let reabertas = 0;
        const registros: Promise<unknown>[] = [];
        for (const r of rows) {
          try {
            const db2 = await getDb();
            await db2.execute(
              "UPDATE chapas SET status_contato = 'pendente', data_contato = NULL WHERE id = ?",
              [r.id],
            );
            reabertas++;
            registros.push(logActivity({
              tipo: "confirmacao_esquecida",
              descricao: `Confirmação de ${r.nome_chapa ?? "chapa"} reaberta após ${fupEsquecerConfirmacaoHoras}h sem reforço`,
              chapa_nome: r.nome_chapa,
              empresa: r.empresa,
              id_tarefa: r.id_tarefa,
              timestamp: Date.now(),
            }));
          } catch { /* noop — próxima passagem tenta de novo */ }
        }
        // Um aviso só no fim: antes era um "fup:refresh" por chapa reaberta, e ao abrir o
        // app de manhã (confirmações de ontem passando de 6 h) isso eram centenas de
        // recargas do Dashboard em fila.
        if (reabertas > 0) {
          window.dispatchEvent(new CustomEvent("fup:refresh"));
          void Promise.all(registros).then(() => window.dispatchEvent(new CustomEvent("activity:new-diff")));
        }
      } catch { /* noop — DB pode não estar pronto ainda */ }
    }

    poll();
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, []);
}
