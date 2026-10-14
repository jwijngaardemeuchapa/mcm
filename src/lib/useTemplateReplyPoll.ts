import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getDb } from "./db";
import { readSettings } from "./settings";
import { fetchUmblerRecentMessages } from "./umbler";
import { processFirestoreMessage, type RespostaEvent } from "./firestoreQueue";
import { buscarPendentesPrefup, respostaDoPrefup } from "./respostaPrefup";

const RESPOSTA_LABEL: Record<string, string> = {
  confirmado: "Confirmado ✓",
  cancelado: "Cancelado ✗",
  interesse_sim: "Interesse ✓",
  interesse_nao: "Sem interesse ✗",
};

/**
 * PréFUP (template aixkbF8X47lF-5Rt, ver dispatchQueue.ts/isPrefupTemplateWindow)
 * não passa pelo fluxo de chatbot — não existe start-bot nem webhook chamando
 * de volta a resposta. A única forma de saber se o chapa respondeu SIM/NÃO é
 * ler o chat da Umbler direto. `fup_log.aguarda_resposta_chat = 1` marca os
 * disparos feitos por esse caminho (gravado em _executeChapaFup/_executeMassFup);
 * aqui a gente varre os chapas ainda pendentes cujo ÚLTIMO disparo foi um PréFUP,
 * busca as mensagens do chat e reaproveita o mesmo classificador/pipeline de
 * resposta do Firestore (classifyResponse já entende "SIM"/"NÃO" isolados — ver a
 * branch de `words.length <= 4` em firestoreQueue.ts), só trocando a origem do payload.
 *
 * Só conta a fala do contato que veio DEPOIS do disparo do PréFUP (e antes de qualquer
 * disparo seguinte no mesmo chat) — ver respostaPrefup.ts. Antes valia a última fala do
 * contato em qualquer momento, e um "sim" antigo confirmava o chapa sozinho.
 */
export async function pollOnce(onEvent?: (ev: RespostaEvent) => void) {
  const { umblerSettings } = readSettings();
  if (!umblerSettings.bearerToken || !umblerSettings.organizationId) return;

  const db = await getDb();
  const rows = await buscarPendentesPrefup(db).catch(() => []);
  if (rows.length === 0) return;

  for (const row of rows) {
    try {
      const messages = await fetchUmblerRecentMessages({ chatId: row.umbler_chat_id, settings: umblerSettings, take: 10 });
      const resposta = respostaDoPrefup(messages, { disparoEm: row.data_disparo, proximoDisparoEm: row.proximo_disparo });
      if (!resposta) continue;

      const result = await processFirestoreMessage(
        { chat: { phone: row.telefone_chapa }, resposta_opcao: resposta },
        "chat_umbler",
        // só ESTE chapa, e sabemos que é PréFUP (o poll só olha disparos de PréFUP)
        { chapaId: row.chapa_id, origem: "prefup" },
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
