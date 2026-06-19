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
export function useFirestoreQueue(onEvent?: (ev: RespostaEvent) => void) {
  const processedRef = useRef<Set<string>>(new Set());
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

      unsubRef.current = onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach(async (change) => {
            if (change.type !== "added") return;
            const id = change.doc.id;
            if (processedRef.current.has(id)) return;
            processedRef.current.add(id);

            const data = change.doc.data() as { payload?: unknown };
            const payload = data?.payload ?? data;

            try {
              const result = await processFirestoreMessage(payload);
              if (result.handled) {
                await deleteDoc(docRef(db, FIRESTORE_MESSAGES_COLLECTION, id));
                const ev = result.event;
                const tipoLabel = ev.tipo === "bid" ? "BID" : "FUP";
                const isRecusa = ["cancelado", "interesse_nao", "nao_aceita_app", "precisa_ajuda"].includes(ev.resposta);
                const label = `${tipoLabel} — ${ev.chapa_nome}: ${RESPOSTA_LABEL[ev.resposta] ?? ev.resposta}`;
                if (isRecusa) {
                  toast.warning(label, { duration: 8_000 });
                } else {
                  toast.success(label);
                }
                cb?.(ev);
                window.dispatchEvent(new CustomEvent("fup:refresh"));
              } else {
                processedRef.current.delete(id);
                await updateDoc(docRef(db, FIRESTORE_MESSAGES_COLLECTION, id), { status: "error" }).catch(() => {});
              }
            } catch (e) {
              processedRef.current.delete(id);
              console.error("Firestore: erro ao processar mensagem", id, e);
            }
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
