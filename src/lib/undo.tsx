import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

export type UndoAction = {
  /** Short human-readable label shown in the toast / undo button tooltip. */
  label: string;
  /** Function that reverts the action. Should return a promise; errors are toasted. */
  revert: () => Promise<void>;
  /** Called after a successful undo to refresh the UI. */
  onReverted?: () => void;
};

type UndoContextValue = {
  last: UndoAction | null;
  push: (action: UndoAction) => void;
  undo: () => Promise<void>;
  clear: () => void;
};

// Dois contextos: as AÇÕES (push/undo/clear) nunca mudam de identidade; o "último"
// muda a cada push. Antes era um objeto só, recriado a cada render: cada clique
// que empilha um "desfazer" (toda confirmação) re-renderizava TODOS os TaskCards,
// que só querem o push. Quem precisa do "último" (botão Desfazer) usa useUndo().
type UndoActions = Pick<UndoContextValue, "push" | "undo" | "clear">;
const UndoActionsContext = createContext<UndoActions | null>(null);
const UndoLastContext = createContext<UndoAction | null>(null);

const MAX_STACK = 20;

export function UndoProvider({ children }: { children: ReactNode }) {
  // Ref is the source of truth — immune to StrictMode double-invocation of state updaters.
  const stackRef = useRef<UndoAction[]>([]);
  // State only used to trigger re-renders of consumers (e.g. enabling the Undo button).
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  // Guard against concurrent undo clicks reverting the same action twice.
  const undoingRef = useRef(false);

  const push = useCallback(
    (action: UndoAction) => {
      stackRef.current.push(action);
      if (stackRef.current.length > MAX_STACK) stackRef.current.shift();
      bump();
    },
    [bump],
  );

  const undo = useCallback(async () => {
    if (undoingRef.current) return;
    const action = stackRef.current.pop();
    bump();
    if (!action) {
      toast.info("Nada para desfazer");
      return;
    }
    undoingRef.current = true;
    try {
      await action.revert();
      toast.success(`Desfeito: ${action.label}`);
      action.onReverted?.();
    } catch (e) {
      // Re-add to stack so the user can retry.
      stackRef.current.push(action);
      bump();
      const msg = e instanceof Error ? e.message : "Erro ao desfazer";
      toast.error(msg);
    } finally {
      undoingRef.current = false;
    }
  }, [bump]);

  const clear = useCallback(() => {
    stackRef.current = [];
    bump();
  }, [bump]);

  const last = stackRef.current[stackRef.current.length - 1] ?? null;

  const actions = useMemo(() => ({ push, undo, clear }), [push, undo, clear]);

  return (
    <UndoActionsContext.Provider value={actions}>
      <UndoLastContext.Provider value={last}>{children}</UndoLastContext.Provider>
    </UndoActionsContext.Provider>
  );
}

/** Só push/undo/clear — estável, não re-renderiza quando a pilha muda. */
export function useUndoActions(): UndoActions {
  const ctx = useContext(UndoActionsContext);
  if (!ctx) throw new Error("useUndo must be used within UndoProvider");
  return ctx;
}

/** Tudo, incluindo o "último" — re-renderiza a cada push/undo. */
export function useUndo(): UndoContextValue {
  const actions = useUndoActions();
  const last = useContext(UndoLastContext);
  return { last, ...actions };
}
