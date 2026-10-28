/**
 * Duas fases de confirmação do chapa:
 *   1ª  PréFUP (template, ≥ 5 h antes da tarefa)  → flag `prefup_confirmado_em`
 *   2ª  FUP    (reforço, < 5 h antes da tarefa)   → flag `fup_confirmado_em`
 *
 * Ficou no lugar da "reabertura de confirmação esquecida": em vez de devolver o chapa
 * a "pendente" depois de N horas (e perder o fill rate e a confirmação), ele continua
 * confirmado, a flag do PréFUP fica marcada e o FUP em massa, quando chega a janela do
 * FUP, ainda mira quem não tem a flag do FUP.
 *
 * As flags só fazem sentido enquanto status_contato = 'confirmado': um gatilho no banco
 * (ver garantirFasesConfirmacao) limpa as duas quando o chapa sai de "confirmado".
 *
 * Este arquivo NÃO importa nada de propósito: db.ts o usa ao abrir o banco, e qualquer
 * importação de volta (prefup → db) viraria ciclo. A janela do FUP fica em prefup.ts (emJanelaDeFup).
 */

export type ChapaFases = {
  status_contato: string;
  prefup_confirmado_em?: string | null;
  fup_confirmado_em?: string | null;
};

export type Fase = "prefup" | "fup";

export const confirmadoNoPrefup = (c: ChapaFases) => c.status_contato === "confirmado" && !!c.prefup_confirmado_em;
export const confirmadoNoFup = (c: ChapaFases) => c.status_contato === "confirmado" && !!c.fup_confirmado_em;
/** Confirmou o PréFUP e ainda não respondeu o FUP. */
export const aguardaReforcoDeFup = (c: ChapaFases) => confirmadoNoPrefup(c) && !c.fup_confirmado_em;

/**
 * O chapa entra no FUP em massa?
 *  - removido: nunca;
 *  - não confirmado (pendente, não respondeu, cancelado...): sim, como sempre;
 *  - confirmado: só pra REFORÇO — confirmou apenas no PréFUP e já é a janela do FUP.
 *    (Antes da janela, um segundo PréFUP pra quem já confirmou não faz sentido.)
 */
export function entraNoFupEmMassa(c: ChapaFases, janelaFup: boolean): boolean {
  if (c.status_contato === "removido") return false;
  if (c.status_contato !== "confirmado") return true;
  return janelaFup && aguardaReforcoDeFup(c);
}

/** Fragmento SQL do mesmo critério "confirmou só o PréFUP" (alias da tabela: chapas c). */
export const SQL_AGUARDA_REFORCO =
  "(c.status_contato = 'confirmado' AND c.prefup_confirmado_em IS NOT NULL AND c.fup_confirmado_em IS NULL)";

/** Flags a gravar numa confirmação feita pela RESPOSTA do chapa (origem conhecida; sem origem conta como FUP). */
export function flagsDaResposta(origem: Fase | null, quando: string): { prefup_confirmado_em: string | null; fup_confirmado_em: string | null } {
  return origem === "prefup"
    ? { prefup_confirmado_em: quando, fup_confirmado_em: null }
    : { prefup_confirmado_em: null, fup_confirmado_em: quando };
}

/** Confirmação feita na mão pelo analista conta como FUP: acrescenta a flag ao patch do UPDATE. */
export function comFlagManual<T extends Record<string, unknown>>(patch: T, quando: string = new Date().toISOString()): T {
  if (patch.status_contato !== "confirmado" || "fup_confirmado_em" in patch) return patch;
  return { ...patch, fup_confirmado_em: (patch.data_contato as string | undefined) ?? quando };
}

/* ── banco ─────────────────────────────────────────────────────────────────── */

type BancoFases = {
  select<T>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

const TRIGGER_LIMPA_FASES = `CREATE TRIGGER IF NOT EXISTS trg_chapas_limpa_fases
AFTER UPDATE OF status_contato ON chapas
WHEN NEW.status_contato <> 'confirmado' AND (NEW.prefup_confirmado_em IS NOT NULL OR NEW.fup_confirmado_em IS NOT NULL)
BEGIN
  UPDATE chapas SET prefup_confirmado_em = NULL, fup_confirmado_em = NULL WHERE id = NEW.id;
END`;

/**
 * Cria (uma vez, de forma idempotente) as colunas das fases, preenche as que já existem a
 * partir de `confirmado_via` e instala o gatilho que limpa as flags quando o chapa deixa de
 * estar confirmado. Roda ao abrir o banco; feito em tempo de execução (como as outras colunas
 * "ad hoc" do app) pra não depender de numeração de migration entre as branches/instalações.
 */
export async function garantirFasesConfirmacao(db: BancoFases): Promise<void> {
  const colunas = await db.select<{ name: string }[]>("PRAGMA table_info(chapas)");
  if (colunas.length === 0) return; // tabela ainda não existe (banco novo antes da migration): tenta na próxima abertura
  const tem = new Set(colunas.map((c) => c.name));
  const primeiraVez = !tem.has("prefup_confirmado_em") || !tem.has("fup_confirmado_em");
  if (!tem.has("prefup_confirmado_em")) await db.execute("ALTER TABLE chapas ADD COLUMN prefup_confirmado_em TEXT");
  if (!tem.has("fup_confirmado_em")) await db.execute("ALTER TABLE chapas ADD COLUMN fup_confirmado_em TEXT");
  if (primeiraVez && tem.has("confirmado_via")) {
    // quem já estava confirmado por um PréFUP/FUP ganha a flag da fase (data = última data de contato)
    const agora = new Date().toISOString();
    await db.execute(
      "UPDATE chapas SET prefup_confirmado_em = COALESCE(data_contato, ?) WHERE status_contato = 'confirmado' AND confirmado_via = 'prefup' AND prefup_confirmado_em IS NULL",
      [agora],
    );
    await db.execute(
      "UPDATE chapas SET fup_confirmado_em = COALESCE(data_contato, ?) WHERE status_contato = 'confirmado' AND confirmado_via = 'fup' AND fup_confirmado_em IS NULL",
      [agora],
    );
  }
  await db.execute(TRIGGER_LIMPA_FASES);
}

/* ── gravações usadas por quem confirma pela RESPOSTA do chapa (notificação do Windows) ── */

type BancoComLinhas = BancoFases;

/** Confirma o chapa gravando a fase da resposta (origem desconhecida conta como FUP). */
export async function confirmarPorResposta(db: BancoComLinhas, chapaId: string, origem: Fase | null, agora: string): Promise<void> {
  const fases = flagsDaResposta(origem, agora);
  try {
    await db.execute(
      "UPDATE chapas SET status_contato = 'confirmado', data_contato = ?, confirmado_via = ?, prefup_confirmado_em = COALESCE(?, prefup_confirmado_em), fup_confirmado_em = COALESCE(?, fup_confirmado_em) WHERE id = ?",
      [agora, origem, fases.prefup_confirmado_em, fases.fup_confirmado_em, chapaId],
    );
  } catch {
    // colunas das fases ausentes: grava a confirmação como antes
    await db.execute("UPDATE chapas SET status_contato = 'confirmado', data_contato = ? WHERE id = ?", [agora, chapaId]);
  }
}

/**
 * O chapa já confirmou o PréFUP e respondeu "sim" ao FUP de reforço: marca a flag do FUP (o status
 * continua confirmado). Só vale se existe um FUP (não-PréFUP) disparado pra ele DEPOIS da confirmação do
 * PréFUP; sem isso, qualquer "sim" solto marcaria a flag. Devolve se marcou.
 */
export async function marcarFupDoReforco(db: BancoComLinhas, chapaId: string, agora: string): Promise<boolean> {
  try {
    const r = (await db.execute(
      `UPDATE chapas SET fup_confirmado_em = ?, data_contato = ?, confirmado_via = 'fup'
       WHERE id = ? AND status_contato = 'confirmado' AND prefup_confirmado_em IS NOT NULL AND fup_confirmado_em IS NULL
         AND EXISTS (
           SELECT 1 FROM fup_log f
           WHERE f.chapa_id = chapas.id AND COALESCE(f.aguarda_resposta_chat, 0) = 0 AND f.data_disparo > chapas.prefup_confirmado_em
         )`,
      [agora, agora, chapaId],
    )) as { rowsAffected?: number } | undefined;
    return (r?.rowsAffected ?? 0) > 0;
  } catch {
    return false;
  }
}

/* ── confirmação manual (conta como FUP) ──────────────────────────────────── */

/** UPDATE de um chapa com o patch dado; se as colunas das fases não existirem, repete sem elas. */
export async function atualizarChapa(db: BancoFases, chapaId: string, patch: Record<string, unknown>): Promise<void> {
  const aplicar = (p: Record<string, unknown>) =>
    db.execute(`UPDATE chapas SET ${Object.keys(p).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...Object.values(p), chapaId]);
  try {
    await aplicar(patch);
  } catch (e) {
    if (!("fup_confirmado_em" in patch) && !("prefup_confirmado_em" in patch)) throw e;
    const { fup_confirmado_em: _f, prefup_confirmado_em: _p, ...resto } = patch;
    void _f; void _p;
    await aplicar(resto);
  }
}

/** Confirma vários chapas na mão ("confirmar todos"): status confirmado + flag do FUP. */
export async function confirmarManualEmLote(db: BancoFases, ids: string[], agora: string): Promise<void> {
  if (ids.length === 0) return;
  const ph = ids.map(() => "?").join(",");
  try {
    await db.execute(
      `UPDATE chapas SET status_contato = 'confirmado', data_contato = ?, fup_confirmado_em = ? WHERE id IN (${ph})`,
      [agora, agora, ...ids],
    );
  } catch {
    await db.execute(`UPDATE chapas SET status_contato = 'confirmado', data_contato = ? WHERE id IN (${ph})`, [agora, ...ids]);
  }
}
