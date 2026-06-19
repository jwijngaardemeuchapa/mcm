import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { readSettings } from "./settings";
import { ingestTarefas } from "./ingestTarefas";
import { getDb, uuid } from "./db";

export async function sincronizarMetabase(silent = false): Promise<boolean> {
  const s = readSettings();
  const cardId = s.metabaseTarefasCardId;
  if (!cardId) {
    if (!silent) toast.error("Configure o ID da pergunta do Metabase em Integrações");
    return false;
  }
  try {
    const status = await invoke<{ configured: boolean }>("metabase_status");
    if (!status.configured) {
      if (!silent) toast.error("Metabase não configurado em Integrações");
      return false;
    }
    const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
    const result = await ingestTarefas(rows);
    localStorage.setItem("metabase_last_sync", new Date().toISOString());
    if (!silent) toast.success(`Sync concluído — ${result.tarefas} tarefas, ${result.chapas} chapas`);
    return true;
  } catch {
    if (!silent) toast.error("Erro ao sincronizar com Metabase");
    return false;
  }
}

export async function sincronizarMetabase30h(silent = false): Promise<boolean> {
  const s = readSettings();
  const cardId = s.metabaseTarefas30hCardId;
  if (!cardId) {
    if (!silent) toast.error("Configure o ID da pergunta '30h' do Metabase em Integrações");
    return false;
  }
  try {
    const status = await invoke<{ configured: boolean }>("metabase_status");
    if (!status.configured) {
      if (!silent) toast.error("Metabase não configurado em Integrações");
      return false;
    }
    const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
    const result = await ingestTarefas(rows);
    localStorage.setItem("metabase_last_sync_30h", new Date().toISOString());
    if (!silent) toast.success(`Sync amanhã — ${result.tarefas} tarefas, ${result.chapas} chapas`);
    return true;
  } catch {
    if (!silent) toast.error("Erro ao sincronizar tarefas das próximas 30h");
    return false;
  }
}

const GRUPOS = ["G1", "G2", "G3", "G4", "G5"];

export async function sincronizarCarteira(silent = false): Promise<boolean> {
  const s = readSettings();
  const cardId = s.metabaseCarteiraCardId;
  if (!cardId) {
    if (!silent) toast.error("Configure o ID da pergunta de Carteira em Integrações");
    return false;
  }
  try {
    const status = await invoke<{ configured: boolean }>("metabase_status");
    if (!status.configured) {
      if (!silent) toast.error("Metabase não configurado em Integrações");
      return false;
    }
    const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
    const db = await getDb();
    const now = new Date().toISOString();
    let count = 0;
    for (const row of rows) {
      const keys = Object.keys(row);
      const nameKey = keys.find((k) => /nome\s*fantasia|empresa|raz.o\s*social|company|nome/i.test(k));
      const cnpjKey = keys.find((k) => /cnpj/i.test(k));
      const grupoKey = keys.find((k) => /^carteira$/i.test(k));
      const name = nameKey ? String(row[nameKey] ?? "").trim().replace(/\s+/g, " ") : "";
      if (!name) continue;
      const grupoRaw = grupoKey ? String(row[grupoKey] ?? "").trim() : "";
      const grupo = GRUPOS.includes(grupoRaw) ? grupoRaw : null;
      const cnpj = cnpjKey ? String(row[cnpjKey] ?? "").trim() || null : null;
      await db.execute(
        `INSERT INTO carteira (id, nome_fantasia, cnpj, grupo, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(nome_fantasia) DO UPDATE SET cnpj = excluded.cnpj, grupo = COALESCE(excluded.grupo, carteira.grupo)`,
        [uuid(), name, cnpj, grupo, now],
      );
      count++;
    }
    localStorage.setItem("carteira_last_sync", new Date().toISOString());
    if (!silent) toast.success(`Carteira sincronizada — ${count} empresas`);
    return true;
  } catch {
    if (!silent) toast.error("Erro ao sincronizar carteira");
    return false;
  }
}

export function devesSincronizarCarteira(): boolean {
  const last = localStorage.getItem("carteira_last_sync");
  if (!last) return true;
  const lastDate = new Date(last);
  const now = new Date();
  // Encontra a última segunda-feira
  const dayOfWeek = now.getDay(); // 0=dom, 1=seg...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - daysSinceMonday);
  lastMonday.setHours(0, 0, 0, 0);
  return lastDate < lastMonday;
}
