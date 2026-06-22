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
  hasPriorFup?: boolean; // FUP anterior existia mas foi enviado cedo — este é o lembrete de aproximação
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

          // Verifica se já houve FUP manual.
          // Se sim, só bloqueia o auto-disparo se o FUP foi enviado a MENOS de
          // fupAutoDispatchBloqueioHoras antes da tarefa — ou seja, próximo o suficiente
          // para não precisar de reforço. Se o FUP foi cedo (ex: 8h antes para tarefa às 18h)
          // o auto-disparo de aproximação ainda deve acontecer.
          const { fupAutoDispatchBloqueioHoras } = readSettings();
          const bloqueioMs = fupAutoDispatchBloqueioHoras * 60 * 60 * 1000;
          const taskMs = new Date(t.data_tarefa).getTime();

          const fupRows = await db.select<{ data_disparo: string }[]>(
            `SELECT data_disparo FROM fup_log
             WHERE id_tarefa = ? AND canal = 'umbler_talk'
             ORDER BY data_disparo DESC LIMIT 1`,
            [taskId],
          );

          if (fupRows.length > 0) {
            const lastFupMs = new Date(fupRows[0].data_disparo).getTime();
            const deltaMs = taskMs - lastFupMs; // ms entre o FUP e o início da tarefa
            if (deltaMs <= bloqueioMs) {
              // FUP foi enviado perto da tarefa — já está coberto, não precisa do auto-disparo
              trySet(`fup_auto_done_${taskId}`, "1");
              continue;
            }
            // FUP foi cedo demais — permite o auto-disparo de aproximação (não marca done)
          } else if (tryGetLocal(`umbler_fup_all_${taskId}`)) {
            // Disparo manual nesta sessão mas sem registro no fup_log ainda:
            // aplica a mesma regra pela hora atual como proxy do fup
            const deltaMs = taskMs - Date.now();
            if (deltaMs <= bloqueioMs) {
              trySet(`fup_auto_done_${taskId}`, "1");
              continue;
            }
          }

          // Store task snap for when user confirms
          const hasPriorFup = fupRows.length > 0 || !!tryGetLocal(`umbler_fup_all_${taskId}`);
          const task: TaskSnap = { id_tarefa: taskId, data_tarefa: t.data_tarefa, empresa: t.empresa };
          confirmedRef.current.set(taskId, { dispatchAt, task });

          // Show confirmation dialog (only if not already showing for this task)
          if (pendingTaskIdRef.current !== taskId) {
            setPending({ taskId, empresa: t.empresa, data_tarefa: t.data_tarefa, dispatchAt, hasPriorFup });
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
