import { useEffect } from "react";
import { readSettings } from "./settings";
import { getDb } from "./db";
import { minutesUntil } from "./datetime";
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
export function useForgetFupConfirmation() {
  useEffect(() => {
    async function poll() {
      const { fupEsquecerConfirmacaoHoras } = readSettings();
      if (!fupEsquecerConfirmacaoHoras || fupEsquecerConfirmacaoHoras <= 0) return;

      try {
        const db = await getDb();
        const rows = await db.select<{
          id: string;
          nome_chapa: string | null;
          empresa: string;
          id_tarefa: number;
          data_tarefa: string;
          data_contato: string;
        }[]>(
          `SELECT c.id, c.nome_chapa, t.empresa, t.id_tarefa, t.data_tarefa, c.data_contato
           FROM chapas c
           JOIN tarefas t ON c.id_tarefa = t.id_tarefa
           WHERE t.ativo = 1
             AND t.status_tarefa NOT IN ('Concluído', 'Cancelado')
             AND c.status_contato = 'confirmado'
             AND c.data_contato IS NOT NULL`,
        );

        const limiarMs = fupEsquecerConfirmacaoHoras * 60 * 60 * 1000;
        const now = Date.now();
        for (const r of rows) {
          // Tarefa já começou/passou: confirmação antiga não é "esquecida",
          // é só tardia — nunca reabrir depois que a janela de ação passou.
          if (minutesUntil(r.data_tarefa) <= 0) continue;
          const idadeMs = now - new Date(r.data_contato).getTime();
          if (idadeMs <= limiarMs) continue;

          try {
            const db2 = await getDb();
            await db2.execute(
              "UPDATE chapas SET status_contato = 'pendente', data_contato = NULL WHERE id = ?",
              [r.id],
            );
            window.dispatchEvent(new CustomEvent("fup:refresh"));
            logActivity({
              tipo: "confirmacao_esquecida",
              descricao: `Confirmação de ${r.nome_chapa ?? "chapa"} reaberta após ${fupEsquecerConfirmacaoHoras}h sem reforço`,
              chapa_nome: r.nome_chapa,
              empresa: r.empresa,
              id_tarefa: r.id_tarefa,
              timestamp: Date.now(),
            }).then(() => window.dispatchEvent(new CustomEvent("activity:new-diff")));
          } catch { /* noop — próxima passagem tenta de novo */ }
        }
      } catch { /* noop — DB pode não estar pronto ainda */ }
    }

    poll();
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, []);
}
