import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
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

const UndoContext = createContext<UndoContextValue | null>(null);

const MAX_STACK = 20;

export function UndoProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<UndoAction[]>([]);

  const push = useCallback((action: UndoAction) => {
    setStack((prev) => {
      const next = [...prev, action];
      if (next.length > MAX_STACK) next.shift();
      return next;
    });
  }, []);

  const undo = useCallback(async () => {
    let action: UndoAction | undefined;
    setStack((prev) => {
      if (prev.length === 0) return prev;
      action = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    // wait a tick for state to settle, then run revert
    await Promise.resolve();
    if (!action) {
      toast.info("Nada para desfazer");
      return;
    }
    try {
      await action.revert();
      toast.success(`Desfeito: ${action.label}`);
      action.onReverted?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao desfazer";
      toast.error(msg);
    }
  }, []);

  const clear = useCallback(() => setStack([]), []);

  return (
    <UndoContext.Provider value={{ last: stack[stack.length - 1] ?? null, push, undo, clear }}>
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndo must be used within UndoProvider");
  return ctx;
}
