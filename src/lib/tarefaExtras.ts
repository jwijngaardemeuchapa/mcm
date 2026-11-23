/**
 * Informações da tarefa que vêm do Metabase (card consulta_fup): tipo de trabalho, remessa (CTE, container,
 * "INDICADO"...) e oferta a chapa dirigido (tarefa em oferta = ainda sem chapa alocado: o chapa dirigido não aceitou).
 *
 * Sem imports de propósito (mesmo motivo de fasesConfirmacao.ts): db.ts usa isto ao abrir o banco.
 */

export type TarefaExtras = {
  remessa?: string | null;
  tipo_trabalho?: string | null;
  em_oferta?: number | boolean | null;
  chapa_em_oferta?: string | null;
  /** Quando a tarefa foi criada no Meu Chapa (ISO, fuso de Brasília). */
  criada_em?: string | null;
};

type Banco = {
  select<T>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

const COLUNAS: Array<[string, string]> = [
  ["remessa", "TEXT"],
  ["tipo_trabalho", "TEXT"],
  ["em_oferta", "INTEGER NOT NULL DEFAULT 0"],
  ["chapa_em_oferta", "TEXT"],
  ["criada_em", "TEXT"],
];

async function colunasDe(db: Banco): Promise<Set<string>> {
  return new Set((await db.select<{ name: string }[]>("PRAGMA table_info(tarefas)")).map((c) => c.name));
}

/**
 * Cria (idempotente) as colunas das quatro informações em `tarefas` — em tempo de execução, como as das fases de
 * confirmação, pra não depender de numeração de migration. Devolve se TODAS existem depois (false = tabela ainda
 * não criada ou ALTER impossível: quem chama segue sem elas).
 */
export async function garantirColunasDaTarefa(db: Banco): Promise<boolean> {
  const tem = await colunasDe(db);
  if (tem.size === 0) return false;
  for (const [nome, tipo] of COLUNAS) {
    if (tem.has(nome)) continue;
    try {
      await db.execute(`ALTER TABLE tarefas ADD COLUMN ${nome} ${tipo}`);
    } catch {
      /* outra chamada (abertura do banco x sync) pode ter criado no mesmo instante */
    }
  }
  const depois = await colunasDe(db);
  return COLUNAS.every(([nome]) => depois.has(nome));
}

/** Sim/não vindo do Metabase (boolean, 1/0, "true", "Sim"...). */
export function lerSimNao(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const t = String(v ?? "").trim().toLowerCase();
  return ["true", "t", "1", "sim", "s", "yes", "y", "verdadeiro"].includes(t);
}

/** Texto aparado; vazio vira null. */
export function textoOuNulo(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return t ? t : null;
}

/** Remessa curta pra caber na linha (o texto completo vai no hover). */
export function remessaCurta(remessa: string, max = 24): string {
  const t = remessa.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export const estaEmOferta = (t: TarefaExtras): boolean => t.em_oferta === true || (typeof t.em_oferta === "number" && t.em_oferta !== 0);

/** "Descarga · Remessa CTE 123" — o complemento que entra nas mensagens e nas listas. */
export function resumoDaTarefa(t: TarefaExtras, maxRemessa = 24): string {
  const partes: string[] = [];
  const tipo = textoOuNulo(t.tipo_trabalho);
  const remessa = textoOuNulo(t.remessa);
  if (tipo) partes.push(tipo);
  if (remessa) partes.push(`Remessa ${remessaCurta(remessa, maxRemessa)}`);
  return partes.join(" · ");
}

/** A busca encontra a tarefa por tipo ou remessa? (`q` já normalizado: minúsculo, sem acento.) */
export function tarefaCasaBusca(t: TarefaExtras, q: string, normalizar: (s: string) => string): boolean {
  if (!q) return false;
  return normalizar(t.remessa ?? "").includes(q) || normalizar(t.tipo_trabalho ?? "").includes(q);
}

/** Linha opcional da Lista de Presença (a 4ª, antes vazia): só aparece se houver tipo de trabalho ou remessa. */
export function linhaTipoRemessaPlanilha(t: TarefaExtras): string[] {
  const tipo = textoOuNulo(t.tipo_trabalho);
  const remessa = textoOuNulo(t.remessa);
  if (!tipo && !remessa) return [];
  return ["Tipo de trabalho:", tipo ?? "", "", "Remessa:", remessa ?? "", ""];
}
