import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";

export type WebhookResponseEvent = {
  tipo: "fup" | "bid";
  chapa_nome: string;
  chapa_telefone: string | null;
  resposta: string;
  id_tarefa: number | null;
  empresa: string | null;
  disparo_id: string | null;
  message_body: string | null;
  received_at: string;
};

const RESPOSTA_LABEL: Record<string, string> = {
  confirmado: "Confirmado ✓",
  cancelado: "Cancelado ✗",
  interesse_sim: "Interesse ✓",
  interesse_nao: "Sem interesse ✗",
  aceita_app: "Aceita app ✓",
  nao_aceita_app: "Não aceita app",
  precisa_ajuda: "Precisa de ajuda",
};

export function useWebhookListener(onEvent?: (ev: WebhookResponseEvent) => void) {
  useEffect(() => {
    const isTauri = "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;

    const promise = listen<WebhookResponseEvent>("webhook:response", (ev) => {
      const { chapa_nome, resposta, tipo } = ev.payload;
      const label = RESPOSTA_LABEL[resposta] ?? resposta;
      const tipoLabel = tipo === "bid" ? "BID" : "FUP";
      toast.success(`${tipoLabel} — ${chapa_nome}: ${label}`);
      onEvent?.(ev.payload);
    });

    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, [onEvent]);
}
