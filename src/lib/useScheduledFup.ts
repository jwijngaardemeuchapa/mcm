import { useEffect, useRef, useState } from "react";
import { readSettings } from "./settings";
import { getDb } from "./db";
import { minutesUntil } from "./datetime";
import { dispatchQueue, type TaskSnap } from "./dispatchQueue";

export type AutoFupPending = {
  taskId: number;
  empresa: string;
  data_tarefa: string;
  dispatchAt: Date;
};

// Confirmation window: show dialog this many minutes before the scheduled dispatch
const CONFIRM_WINDOW_MIN = 15;

export function useScheduledFup() {
  const [pending, setPendingState] = useState<AutoFupPending | null>(null);
  const pendingTaskIdRef = useRef<number | null>(null);

  // Maps taskId → { dispatchAt, task } for confirmed tasks waiting to fire
  const confirmedRef = useRef<Map<number, { dispatchAt: Date; task: TaskSnap }>>(new Map());
  // Maps taskId → setTimeout handle
  const scheduledRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function setPending(p: AutoFupPending | null) {
    pendingTaskIdRef.current = p?.taskId ?? null;
    setPendingState(p);
  }

  function skipTask(taskId: number) {
    try { sessionStorage.setItem(`fup_auto_skip_${taskId}`, "1"); } catch { /* noop */ }
    confirmedRef.current.delete(taskId);
    setPending(null);
  }

  function confirmDispatch(taskId: number) {
    const entry = confirmedRef.current.get(taskId);
    if (!entry) { setPending(null); return; }

    // Schedule the actual startAutoFup at dispatch time
    const delay = Math.max(0, entry.dispatchAt.getTime() - Date.now());
    const timer = setTimeout(async () => {
      scheduledRef.current.delete(taskId);
      await dispatchQueue.startAutoFup(entry.task);
      try { sessionStorage.setItem(`fup_auto_done_${taskId}`, "1"); } catch { /* noop */ }
    }, delay);
    scheduledRef.current.set(taskId, timer);
    setPending(null);
  }

  useEffect(() => {
    async function poll() {
      const { fupAgendarMinAntes } = readSettings();
      if (!fupAgendarMinAntes || fupAgendarMinAntes <= 0) return;

      try {
        const db = await getDb();
        const tasks = await db.select<{ id_tarefa: number; data_tarefa: string; empresa: string }[]>(
          `SELECT id_tarefa, data_tarefa, empresa FROM tarefas
           WHERE ativo = 1
             AND status_tarefa NOT IN ('Concluído', 'Cancelado')`,
        );

        for (const t of tasks) {
          const taskId = t.id_tarefa;

          // Already handled this session
          if (tryGet(`fup_auto_done_${taskId}`) || tryGet(`fup_auto_skip_${taskId}`)) continue;
          // Already scheduled via setTimeout or running in queue
          if (scheduledRef.current.has(taskId) || dispatchQueue.getMassFupState(taskId)) continue;
          // Already showing confirmation for another task
          if (pendingTaskIdRef.current !== null && pendingTaskIdRef.current !== taskId) continue;

          const minUntilTask = minutesUntil(t.data_tarefa);
          // Task already passed
          if (minUntilTask < 0) continue;

          const dispatchAt = new Date(new Date(t.data_tarefa).getTime() - fupAgendarMinAntes * 60_000);
          const minUntilDispatch = minutesUntil(dispatchAt.toISOString());

          // Only care about tasks approaching their dispatch window (within CONFIRM_WINDOW_MIN)
          // and not already past dispatch (give a 5-min grace for short windows)
          if (minUntilDispatch > CONFIRM_WINDOW_MIN) continue;
          if (minUntilDispatch < -(fupAgendarMinAntes)) continue;

          // Check if FUP was already sent in the last 12h
          const rows = await db.select<{ c: number }[]>(
            `SELECT COUNT(*) as c FROM fup_log
             WHERE id_tarefa = ? AND canal = 'umbler_talk'
             AND data_disparo > datetime('now', '-12 hours')`,
            [taskId],
          );
          if ((rows[0]?.c ?? 0) > 0) {
            trySet(`fup_auto_done_${taskId}`, "1");
            continue;
          }

          // Also skip if manually dispatched this session (localStorage flag set by _executeMassFup)
          if (tryGetLocal(`umbler_fup_all_${taskId}`)) {
            trySet(`fup_auto_done_${taskId}`, "1");
            continue;
          }

          // Store task snap for when user confirms
          const task: TaskSnap = { id_tarefa: taskId, data_tarefa: t.data_tarefa, empresa: t.empresa };
          confirmedRef.current.set(taskId, { dispatchAt, task });

          // Show confirmation dialog (only if not already showing for this task)
          if (pendingTaskIdRef.current !== taskId) {
            setPending({ taskId, empresa: t.empresa, data_tarefa: t.data_tarefa, dispatchAt });
          }
          break;
        }
      } catch { /* noop — DB may not be ready yet */ }
    }

    poll();
    const t = setInterval(poll, 60_000);
    return () => {
      clearInterval(t);
      scheduledRef.current.forEach((timer) => clearTimeout(timer));
      scheduledRef.current.clear();
    };
  }, []);

  return { pending, confirmDispatch, skipTask };
}

function tryGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function trySet(key: string, value: string) {
  try { sessionStorage.setItem(key, value); } catch { /* noop */ }
}

function tryGetLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
