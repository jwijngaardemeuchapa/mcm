import { useSyncExternalStore } from "react";
import { EVENTO_FASE_FUP, versaoDaFaseFup } from "./faseFup";

function assinar(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO_FASE_FUP, aoMudar);
  return () => window.removeEventListener(EVENTO_FASE_FUP, aoMudar);
}

/**
 * Re-renderiza o componente quando o analista antecipa/desfaz a fase do FUP ("Resetar PréFUPs").
 * Quem calcula cor/estado da tarefa (computeTaskState) chama isto pra não ficar com a tela velha.
 * O valor devolvido só serve de dependência de useMemo.
 */
export function useVersaoDaFaseFup(): number {
  return useSyncExternalStore(assinar, versaoDaFaseFup, versaoDaFaseFup);
}
