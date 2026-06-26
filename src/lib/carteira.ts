import { getDb } from "./db";
import { readSettings } from "./settings";

/**
 * Nomes de empresas "visíveis" segundo o filtro de grupos da carteira ativo no momento.
 *
 * - Sem grupo ativo → retorna `[]` (= sem filtro; o consumidor deve deixar tudo passar).
 * - Com grupos ativos → empresas dos grupos selecionados + as fixadas (`fixar_visivel=1`).
 *   Se o filtro zerar, cai para todos os nomes da carteira (mesma semântica do Dashboard).
 *
 * Espelha a lógica de `load()` em Dashboard.tsx. Leve: uma query na carteira (tabela pequena),
 * chamada só quando o filtro muda ou em ticks esparsos — nunca por notificação.
 */
export async function getActiveCarteiraNames(): Promise<string[]> {
  const { carteiraGruposAtivos: grupos = [] } = readSettings();
  if (grupos.length === 0) return [];
  try {
    const db = await getDb();
    const rows = await db.select<{ nome_fantasia: string; grupo: string | null }[]>(
      "SELECT nome_fantasia, grupo FROM carteira",
    );
    const fixarSet = await db
      .select<{ nome_fantasia: string }[]>("SELECT nome_fantasia FROM empresa_config WHERE fixar_visivel = 1")
      .then((r) => new Set(r.map((x) => x.nome_fantasia)))
      .catch(() => new Set<string>());
    const filtered = rows
      .filter((r) => fixarSet.has(r.nome_fantasia) || (r.grupo !== null && grupos.includes(r.grupo)))
      .map((r) => r.nome_fantasia);
    return filtered.length > 0 ? filtered : rows.map((r) => r.nome_fantasia);
  } catch {
    return [];
  }
}
