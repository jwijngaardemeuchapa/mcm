import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getDb } from "./db";
import { readSettings } from "./settings";
import { fetchUmblerRecentMessages } from "./umbler";
import { processFirestoreMessage, type RespostaEvent } from "./firestoreQueue";

const RESPOSTA_LABEL: Record<string, string> = {
  confirmado: "Confirmado ✓",
  cancelado: "Cancelado ✗",
  interesse_sim: "Interesse ✓",
  interesse_nao: "Sem interesse ✗",
};

type PendingRow = {
  chapa_id: string;
  telefone_chapa: string | null;
  umbler_chat_id: string;
};

/**
 * PréFUP (template aixkbF8X47lF-5Rt, ver dispatchQueue.ts/isPrefupTemplateWindow)
 * não passa pelo fluxo de chatbot — não existe start-bot nem webhook chamando
 * de volta a resposta. A única forma de saber se o chapa respondeu SIM/NÃO é
 * ler o chat da Umbler direto. `fup_log.aguarda_resposta_chat = 1` marca os
 * disparos feitos por esse caminho (gravado em _executeChapaFup/_executeMassFup);
 * aqui a gente varre os chapas ainda pendentes com esse flag, busca a última
 * mensagem do CONTATO em cada chat e reaproveita o mesmo classificador/pipeline
 * de resposta do Firestore (classifyResponse já entende "SIM"/"NÃO" isolados —
 * ver a branch de `words.length <= 4` em firestoreQueue.ts), só trocando a
 * origem do payload.
 */
async function pollOnce(onEvent?: (ev: RespostaEvent) => void) {
  const { umblerSettings } = readSettings();
  if (!umblerSettings.bearerToken || !umblerSettings.organizationId) return;

  const db = await getDb();
  const rows = await db
    .select<PendingRow[]>(
      `SELECT c.id AS chapa_id, c.telefone_chapa, f.umbler_chat_id
       FROM chapas c
       JOIN tarefas t ON c.id_tarefa = t.id_tarefa
       JOIN (
         SELECT chapa_id, umbler_chat_id, MAX(data_disparo) AS md
         FROM fup_log
         WHERE aguarda_resposta_chat = 1 AND umbler_chat_id IS NOT NULL AND chapa_id IS NOT NULL
         GROUP BY chapa_id
       ) f ON f.chapa_id = c.id
       WHERE c.canal_contato = 'umbler_talk'
         AND c.status_contato NOT IN ('confirmado', 'cancelado', 'removido')
         AND t.ativo = 1`,
    )
    .catch(() => []);
  if (rows.length === 0) return;

  for (const row of rows) {
    try {
      const messages = await fetchUmblerRecentMessages({ chatId: row.umbler_chat_id, settings: umblerSettings, take: 10 });
      const lastContact = [...messages].reverse().find((m) => m.source === "Contact" && m.content?.trim());
      if (!lastContact?.content) continue;

      const result = await processFirestoreMessage(
        { chat: { phone: row.telefone_chapa }, resposta_opcao: lastContact.content },
        "chat_umbler",
      );
      if (!result.handled) continue;

      const ev = result.event;
      const isRecusa = ["cancelado", "interesse_nao"].includes(ev.resposta);
      const label = `PréFUP — ${ev.chapa_nome}: ${RESPOSTA_LABEL[ev.resposta] ?? ev.resposta}`;
      if (isRecusa) toast.warning(label, { duration: 8_000 });
      else toast.success(label);
      onEvent?.(ev);
      window.dispatchEvent(new CustomEvent("fup:refresh"));
    } catch {
      // best-effort — tenta de novo no próximo tick, sem quebrar o watcher
    }
  }
}

// 45s: mesma ordem de grandeza do polling de mensagens não lidas (40s em
// WatcherContext.tsx) — bem dentro do limite de 100 req/5s da Umbler, já que
// a lista de pendentes tende a ser pequena (só PréFUP ainda sem resposta).
export function useTemplateReplyPoll(onEvent?: (ev: RespostaEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const tick = () => { pollOnce(onEventRef.current).catch(() => {}); };
    tick();
    const t = setInterval(tick, 45_000);
    return () => clearInterval(t);
  }, []);
}
