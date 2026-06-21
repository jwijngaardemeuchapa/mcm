import { useEffect, useRef } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  updateDoc,
  doc as docRef,
} from "firebase/firestore";
import { toast } from "sonner";
import { getFirestoreDb, ensureAnonAuth, firebaseConfigPresent, FIRESTORE_MESSAGES_COLLECTION } from "./firebase";
import { processFirestoreMessage, type RespostaEvent } from "./firestoreQueue";
import { readSettings } from "./settings";

const RESPOSTA_LABEL: Record<string, string> = {
  confirmado: "Confirmado ✓",
  cancelado: "Cancelado ✗",
  interesse_sim: "Interesse ✓",
  interesse_nao: "Sem interesse ✗",
  aceita_app: "Aceita app ✓",
  nao_aceita_app: "Não aceita app",
  precisa_ajuda: "Precisa de ajuda",
};

/**
 * Escuta a fila Firestore (coleção `messages`) em tempo real.
 * Filtra apenas status='pending'; a correlação ao disparo é feita por telefone
 * dentro de processFirestoreMessage — se não há match local, o doc não é apagado.
 */
// Miss transiente (canal_contato ainda não gravado / sync em andamento) é
// reprocessado algumas vezes com backoff antes de desistir. Mantém o doc 'pending'
// durante as tentativas — se o app fechar, o próximo boot reprocessa.
const MAX_RETRIES = 4;
const RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000];

export function useFirestoreQueue(onEvent?: (ev: RespostaEvent) => void) {
  const processedRef = useRef<Set<string>>(new Set());
  const retryRef = useRef<Map<string, number>>(new Map());
  const unsubRef = useRef<(() => void) | null>(null);

  function startListener(cb?: (ev: RespostaEvent) => void) {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (!readSettings().firestoreEnabled) return;
    if (!firebaseConfigPresent()) return;

    let cancelled = false;
    (async () => {
      try { await ensureAnonAuth(); } catch (e) {
        console.error("Firestore: falha na autenticação anônima", e);
        return;
      }
      if (cancelled) return;

      const db = getFirestoreDb();
      const q = query(
        collection(db, FIRESTORE_MESSAGES_COLLECTION),
        where("status", "==", "pending"),
      );

      const handleDoc = async (id: string, payload: unknown): Promise<void> => {
        let result;
        try {
          result = await processFirestoreMessage(payload);
        } catch (e) {
          processedRef.current.delete(id);
          retryRef.current.delete(id);
          console.error("Firestore: erro ao processar mensagem", id, e);
          return;
        }

        if (result.handled) {
          retryRef.current.delete(id);
          await deleteDoc(docRef(db, FIRESTORE_MESSAGES_COLLECTION, id)).catch(() => {});
          const ev = result.event;
          const tipoLabel = ev.tipo === "bid" ? "BID" : "FUP";
          const isRecusa = ["cancelado", "interesse_nao", "nao_aceita_app", "precisa_ajuda"].includes(ev.resposta);
          const label = `${tipoLabel} — ${ev.chapa_nome}: ${RESPOSTA_LABEL[ev.resposta] ?? ev.resposta}`;
          if (isRecusa) toast.warning(label, { duration: 8_000 });
          else toast.success(label);
          cb?.(ev);
          window.dispatchEvent(new CustomEvent("fup:refresh"));
          return;
        }

        // Não tratado. Se transiente e ainda há tentativas, reprocessa com backoff
        // SEM marcar erro (doc segue 'pending'). processedRef mantém o id para o
        // snapshot não reentrar enquanto aguardamos.
        const attempts = retryRef.current.get(id) ?? 0;
        if (result.transient && attempts < MAX_RETRIES) {
          retryRef.current.set(id, attempts + 1);
          setTimeout(() => { handleDoc(id, payload).catch(() => {}); }, RETRY_DELAYS_MS[attempts]);
          return;
        }

        // Permanente ou tentativas esgotadas → marca erro (sai da fila pending).
        retryRef.current.delete(id);
        processedRef.current.delete(id);
        await updateDoc(docRef(db, FIRESTORE_MESSAGES_COLLECTION, id), { status: "error" }).catch(() => {});
      };

      unsubRef.current = onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type !== "added") return;
            const id = change.doc.id;
            if (processedRef.current.has(id)) return;
            processedRef.current.add(id);

            const data = change.doc.data() as { payload?: unknown };
            const payload = data?.payload ?? data;
            handleDoc(id, payload).catch(() => {});
          });
        },
        (error) => { console.error("Firestore: erro na conexão da fila", error); },
      );

      // cancelled flag for the async startup path
      if (cancelled && unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    })();

    return () => { cancelled = true; };
  }

  useEffect(() => {
    const stop = startListener(onEvent);
    const onStorage = () => { startListener(onEvent); };
    window.addEventListener("storage", onStorage);
    return () => {
      stop?.();
      unsubRef.current?.();
      unsubRef.current = null;
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
