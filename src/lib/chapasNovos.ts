/**
 * "Chapa novo" numa tarefa depois de uma sincronização: o nome aparece e NUNCA tinha aparecido nessa
 * tarefa. Quem já esteve na tarefa, saiu (o sync apaga quem some do Metabase) e voltou NÃO é novo —
 * por isso o histórico fica numa tabela própria (`chapas_vistos`), que o sync não apaga.
 *
 * Quem é "o mesmo chapa" segue a regra do sync (CPF, ou o nome quando não há CPF), com o cuidado de
 * que o CPF pode ser resolvido localmente DEPOIS (cpfResolver) enquanto o Metabase continua mandando
 * a linha sem CPF:
 *   - linha COM CPF: já vista se o CPF é conhecido, ou se o nome já foi visto SEM CPF;
 *   - linha SEM CPF: já vista se o nome é conhecido (com qualquer CPF).
 * (Dois homônimos com CPFs diferentes na mesma tarefa continuam sendo duas pessoas.)
 *
 * Sem imports de propósito (mesmo motivo de fasesConfirmacao.ts): o módulo roda no sync e nos testes.
 */

export const normNomeChapa = (s: string | null | undefined): string =>
  (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
export const normCpfChapa = (s: string | null | undefined): string => (s ?? "").toString().replace(/\D/g, "");

export type Avistamento = { id_tarefa: number; nome: string; cpf: string }; // já normalizados

type VistosDaTarefa = { cpfs: Set<string>; nomes: Set<string>; nomesSemCpf: Set<string> };
export type Vistos = Map<number, VistosDaTarefa>;

function daTarefa(vistos: Vistos, id: number): VistosDaTarefa {
  let v = vistos.get(id);
  if (!v) {
    v = { cpfs: new Set(), nomes: new Set(), nomesSemCpf: new Set() };
    vistos.set(id, v);
  }
  return v;
}

function adiciona(vistos: Vistos, a: Avistamento) {
  const v = daTarefa(vistos, a.id_tarefa);
  v.nomes.add(a.nome);
  if (a.cpf) v.cpfs.add(a.cpf);
  else v.nomesSemCpf.add(a.nome);
}

export function jaVisto(vistos: Vistos, a: Avistamento): boolean {
  const v = vistos.get(a.id_tarefa);
  if (!v) return false;
  return a.cpf ? v.cpfs.has(a.cpf) || v.nomesSemCpf.has(a.nome) : v.nomes.has(a.nome);
}

/**
 * Confere uma leva de avistamentos (na ordem do sync) contra o histórico.
 * `podeSerNovo` é do chamador: o chapa não existia na tarefa (ainda não estava no banco) e a tarefa já era
 * conhecida (tarefa que chega pela 1ª vez traz todos os chapas de uma vez — isso é importação, não "novo").
 * Devolve quais viraram NOVOS (índices da entrada) e as linhas a gravar no histórico. Muta `vistos`
 * (quem aparece duas vezes na mesma leva só conta uma).
 */
export function analisarAvistamentos(
  vistos: Vistos,
  itens: Array<Avistamento & { podeSerNovo: boolean }>,
): { novos: number[]; linhas: Avistamento[] } {
  const novos: number[] = [];
  const linhas: Avistamento[] = [];
  itens.forEach((it, i) => {
    if (!it.nome) return;
    if (jaVisto(vistos, it)) return;
    if (it.podeSerNovo) novos.push(i);
    linhas.push({ id_tarefa: it.id_tarefa, nome: it.nome, cpf: it.cpf });
    adiciona(vistos, it);
  });
  return { novos, linhas };
}

/* ── banco ─────────────────────────────────────────────────────────────────── */

type Banco = {
  select<T>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

const LOTE = 150; // 4 colunas × 150 linhas = 600 binds por INSERT

async function gravaLinhas(db: Banco, linhas: Avistamento[], quando: string) {
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    await db.execute(
      `INSERT OR IGNORE INTO chapas_vistos (id_tarefa, nome, cpf, visto_em) VALUES ${lote.map(() => "(?,?,?,?)").join(",")}`,
      lote.flatMap((l) => [l.id_tarefa, l.nome, l.cpf, quando]),
    );
  }
}

/**
 * Cria a tabela (uma vez) e a semeia com os chapas que JÁ estão nas tarefas: quem está no banco quando o
 * recurso nasce conta como "já visto" — senão o 1º sync depois da atualização trataria todo mundo como novo.
 * Se o semeio falha, a tabela é desfeita pra tentar de novo no próximo sync (tabela pela metade faria quem já
 * estava na tarefa parecer novo ao voltar).
 */
export async function garantirChapasVistos(db: Banco): Promise<void> {
  const existe = await db.select<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chapas_vistos'");
  if (existe.length > 0) return;
  const atuais = await db.select<{ id_tarefa: number; nome_chapa: string | null; cpf: string | null }[]>(
    "SELECT id_tarefa, nome_chapa, cpf FROM chapas WHERE nome_chapa IS NOT NULL AND nome_chapa != ''",
  ); // se a tabela de chapas ainda não existe, falha aqui e nada é criado
  await db.execute(
    `CREATE TABLE chapas_vistos (
       id_tarefa INTEGER NOT NULL,
       nome TEXT NOT NULL,
       cpf TEXT NOT NULL DEFAULT '',
       visto_em TEXT NOT NULL,
       PRIMARY KEY (id_tarefa, nome, cpf)
     )`,
  );
  try {
    const vistos: Vistos = new Map();
    const { linhas } = analisarAvistamentos(
      vistos,
      atuais.map((c) => ({ id_tarefa: c.id_tarefa, nome: normNomeChapa(c.nome_chapa), cpf: normCpfChapa(c.cpf), podeSerNovo: false })),
    );
    await gravaLinhas(db, linhas, new Date().toISOString());
  } catch (e) {
    try { await db.execute("DROP TABLE IF EXISTS chapas_vistos"); } catch { /* noop */ }
    throw e;
  }
}

/** Histórico das tarefas dadas (em lotes pra não estourar o limite de binds). */
export async function carregarVistos(db: Banco, idsTarefa: number[]): Promise<Vistos> {
  const vistos: Vistos = new Map();
  for (let i = 0; i < idsTarefa.length; i += 500) {
    const lote = idsTarefa.slice(i, i + 500);
    const linhas = await db.select<{ id_tarefa: number; nome: string; cpf: string }[]>(
      `SELECT id_tarefa, nome, cpf FROM chapas_vistos WHERE id_tarefa IN (${lote.map(() => "?").join(",")})`,
      lote,
    );
    for (const l of linhas) adiciona(vistos, { id_tarefa: l.id_tarefa, nome: l.nome, cpf: l.cpf ?? "" });
  }
  return vistos;
}

export async function registrarVistos(db: Banco, linhas: Avistamento[]): Promise<void> {
  if (linhas.length > 0) await gravaLinhas(db, linhas, new Date().toISOString());
}
