import { getDb } from "./db";

export type ActivityEntry = {
  id: string;
  tipo: "confirmado" | "recusou" | "removido" | "sync_apareceu" | "sync_sumiu" | "sync_aceite" | "auto_cancel" | "bid_interesse" | "bid_aceite" | "fup_auto" | "confirmacao_esquecida";
  descricao: string;
  chapa_nome: string | null;
  empresa: string | null;
  id_tarefa: number | null;
  timestamp: number;
};

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export async function logActivity(entry: Omit<ActivityEntry, "id">): Promise<void> {
  try {
    const db = await getDb();
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO activity_log (id, tipo, descricao, chapa_nome, empresa, id_tarefa, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, entry.tipo, entry.descricao, entry.chapa_nome ?? null, entry.empresa ?? null, entry.id_tarefa ?? null, entry.timestamp],
    );
  } catch { /* noop — log nunca bloqueia o fluxo principal */ }
}

export async function fetchActivityLog(limit = 100): Promise<ActivityEntry[]> {
  try {
    const db = await getDb();
    return await db.select<ActivityEntry[]>(
      `SELECT id, tipo, descricao, chapa_nome, empresa, id_tarefa, timestamp
       FROM activity_log
       ORDER BY timestamp DESC
       LIMIT ?`,
      [limit],
    );
  } catch {
    return [];
  }
}

export async function pruneActivityLog(): Promise<void> {
  try {
    const db = await getDb();
    const cutoff = Date.now() - TTL_MS;
    await db.execute("DELETE FROM activity_log WHERE timestamp < ?", [cutoff]);
  } catch { /* noop */ }
}

export async function clearActivityLog(): Promise<void> {
  try {
    const db = await getDb();
    await db.execute("DELETE FROM activity_log");
  } catch { /* noop */ }
}
