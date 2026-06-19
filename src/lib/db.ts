import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load("sqlite:fupmanager.db");
    // Aguarda até 5s por locks em vez de falhar imediatamente (SQLITE_BUSY code 5)
    await _db.execute("PRAGMA busy_timeout = 5000");
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
