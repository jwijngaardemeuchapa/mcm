import { getDb } from "./db";

export async function fetchAllRows<T>(
  table: "tarefas" | "chapas" | "fup_log" | "carteira",
  selector: string = "*",
): Promise<T[]> {
  const db = await getDb();
  const cols = selector === "*" ? "*" : selector.split(",").map((s) => s.trim()).join(", ");
  return db.select<T[]>(`SELECT ${cols} FROM ${table}`);
}
