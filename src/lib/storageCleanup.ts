// Chaves de localStorage criadas por tarefa — sem limpeza acumulam para sempre.
// Após cada importação, remove as chaves de tarefas que não existem mais no banco.

const TASK_KEY_PREFIXES = [
  "bid_params_",
  "umbler_fup_all_",
  "umbler_task_cancel_",
  "fup_empresa_ovr_",
  "csv_exported_task_",
];

// umbler_cancel_{taskId}_{chapaId} — id da tarefa é o primeiro segmento
const CHAPA_CANCEL_PREFIX = "umbler_cancel_";

export function cleanupTaskLocalStorage(validIds: Set<number>) {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const prefix = TASK_KEY_PREFIXES.find((p) => key.startsWith(p));
      if (prefix) {
        const id = parseInt(key.slice(prefix.length), 10);
        if (!Number.isNaN(id) && !validIds.has(id)) toRemove.push(key);
        continue;
      }
      if (key.startsWith(CHAPA_CANCEL_PREFIX)) {
        const id = parseInt(key.slice(CHAPA_CANCEL_PREFIX.length), 10);
        if (!Number.isNaN(id) && !validIds.has(id)) toRemove.push(key);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch { /* noop */ }
}
