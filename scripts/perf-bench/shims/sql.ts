const BASE = "http://127.0.0.1:8765/sql";
async function call(op: string, sql: string, params?: unknown[]) {
  const r = await fetch(BASE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, sql, params }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "erro sql");
  return j;
}
export default class Database {
  static async load(_path: string) { return new Database(); }
  async select<T>(sql: string, params?: unknown[]): Promise<T> { return (await call("select", sql, params)).rows as T; }
  async execute(sql: string, params?: unknown[]) { return await call("execute", sql, params); }
  async close() { return true; }
}
