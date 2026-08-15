import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load("sqlite:fupmanager.db");
    // Aguarda até 5s por locks em vez de falhar imediatamente (SQLITE_BUSY code 5)
    await _db.execute("PRAGMA busy_timeout = 5000");
    // WAL: leitores não ficam bloqueados por um escritor em andamento. Sem
    // isso, a transação de ingestTarefas() (BEGIN IMMEDIATE.../COMMIT,
    // adicionada pra corrigir o MCM-151) segura o lock de escrita durante
    // TODO o sync — em journal mode padrão (rollback journal), isso bloqueia
    // qualquer leitura concorrente (polling do WatcherContext a cada 60s,
    // queries do Dashboard) até o COMMIT terminar; se o sync demorar mais
    // que os 5s de busy_timeout (esperado num dia com muitas tarefas), o
    // leitor recebe SQLITE_BUSY (code 5) — exatamente o bug reportado
    // "database is locked ao sincronizar depois de atualizar". WAL resolve
    // isso sem abrir mão da atomicidade do fix anterior.
    await _db.execute("PRAGMA journal_mode = WAL");
  }
  return _db;
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function placeholders(count: number): string {
  return Array(count).fill("?").join(",");
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
