import { supabase } from "@/integrations/supabase/client";

/**
 * Supabase returns at most 1000 rows per query by default.
 * Use this helper for tables that may exceed that (e.g. chapas with 900+ rows).
 */
export async function fetchAllRows<T>(
  table: "tarefas" | "chapas" | "fup_log" | "carteira",
  selector: string = "*",
  pageSize: number = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Hard cap to avoid infinite loops if anything goes wrong
  for (let i = 0; i < 50; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select(selector).range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
