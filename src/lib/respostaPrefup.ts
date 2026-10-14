import { somaDiasISO, todayDateISO_SP } from "./datetime";

/**
 * Leitura da resposta ao PréFUP (template, sem chatbot) direto do chat da Umbler.
 *
 * O poll antigo pegava a ÚLTIMA mensagem do contato nas últimas 10 do chat, sem olhar a
 * hora: um "sim" de qualquer outro momento (resposta a um BID, a outra tarefa, ontem) que
 * ainda fosse a última fala do contato confirmava o chapa sozinho — sem ele ter respondido
 * ao PréFUP. Aqui só vale a fala do contato que veio DEPOIS do disparo do PréFUP e ANTES de
 * qualquer disparo seguinte naquele mesmo chat (a partir daí a resposta é pra outra mensagem).
 */

export type MensagemChat = { source: string; content: string | null; eventAtUTC: string };

// O disparo é gravado com o relógio do PC e a mensagem tem a hora da Umbler: uma folga pequena
// evita perder uma resposta rápida por diferença de relógio. É bem menor que qualquer "sim"
// antigo de verdade (horas/dias antes).
export const FOLGA_RELOGIO_MS = 90_000;

/** ISO sem fuso ("2026-10-14T10:00:00") é tratado como UTC; vazio/ilegível → NaN. */
export function instanteUtc(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const t = iso.trim();
  if (!t) return NaN;
  const temFuso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(t);
  return Date.parse(temFuso ? t : `${t}Z`);
}

/**
 * Texto da última fala do contato dentro da janela (disparo, próximoDisparo), ou null se o
 * chapa ainda não respondeu a ESTE PréFUP. Mensagem sem hora legível não vale (não dá pra
 * saber se é anterior ao disparo).
 */
export function respostaDoPrefup(
  mensagens: MensagemChat[],
  janela: { disparoEm: string; proximoDisparoEm?: string | null },
): string | null {
  const desde = instanteUtc(janela.disparoEm) - FOLGA_RELOGIO_MS;
  if (Number.isNaN(desde)) return null;
  const proximo = instanteUtc(janela.proximoDisparoEm ?? null);
  const ate = Number.isNaN(proximo) ? Infinity : proximo - FOLGA_RELOGIO_MS;

  let ultima: { texto: string; quando: number } | null = null;
  for (const m of mensagens) {
    if (m.source !== "Contact") continue;
    const texto = m.content?.trim();
    if (!texto) continue;
    const quando = instanteUtc(m.eventAtUTC);
    if (Number.isNaN(quando) || quando <= desde || quando >= ate) continue;
    if (!ultima || quando >= ultima.quando) ultima = { texto, quando };
  }
  return ultima?.texto ?? null;
}

/* ── candidatos do poll ───────────────────────────────────────────────────── */

type BancoSelect = { select<T>(sql: string, params?: unknown[]): Promise<T> };

export type PendentePrefup = {
  chapa_id: string;
  telefone_chapa: string | null;
  umbler_chat_id: string;
  data_disparo: string;
  /** Primeiro disparo posterior no MESMO chat (outra tarefa, BID...) — depois dele a resposta é pra outra coisa. */
  proximo_disparo: string | null;
};

/**
 * Chapas que estão esperando resposta de um PréFUP, de ontem em diante (tarefa de semanas atrás
 * que nunca foi confirmada não é mais "esperando resposta": ficava sendo consultada pra sempre
 * e qualquer "sim" novo no chat podia confirmá-la). Conta o ÚLTIMO disparo do chapa: se depois
 * do PréFUP saiu um FUP/BID, a resposta pertence a esse e o chapa sai do poll.
 */
export async function buscarPendentesPrefup(db: BancoSelect, hojeISO: string = todayDateISO_SP()): Promise<PendentePrefup[]> {
  const base = await db.select<Omit<PendentePrefup, "proximo_disparo">[]>(
    `SELECT c.id AS chapa_id, c.telefone_chapa, f.umbler_chat_id, f.data_disparo
     FROM chapas c
     JOIN tarefas t ON c.id_tarefa = t.id_tarefa
     JOIN fup_log f ON f.chapa_id = c.id
     WHERE f.id = (
         SELECT f2.id FROM fup_log f2
         WHERE f2.chapa_id = c.id AND f2.umbler_chat_id IS NOT NULL
         ORDER BY f2.data_disparo DESC, f2.rowid DESC LIMIT 1
       )
       AND f.aguarda_resposta_chat = 1
       AND c.canal_contato = 'umbler_talk'
       AND c.status_contato NOT IN ('confirmado', 'cancelado', 'removido')
       AND t.ativo = 1
       AND substr(t.data_tarefa, 1, 10) >= ?`,
    [somaDiasISO(hojeISO, -1)],
  );

  const saida: PendentePrefup[] = [];
  for (const row of base) {
    const datas: string[] = [];
    const fups = await db
      .select<{ data_disparo: string }[]>(
        `SELECT data_disparo FROM fup_log WHERE umbler_chat_id = ? AND chapa_id <> ? AND data_disparo > ?`,
        [row.umbler_chat_id, row.chapa_id, row.data_disparo],
      )
      .catch(() => []);
    datas.push(...fups.map((x) => x.data_disparo));
    // bid_disparos.umbler_chat_id é criada sob demanda no primeiro BID: sem a coluna, segue sem ela.
    const bids = await db
      .select<{ data_disparo: string }[]>(
        `SELECT data_disparo FROM bid_disparos WHERE umbler_chat_id = ? AND data_disparo > ?`,
        [row.umbler_chat_id, row.data_disparo],
      )
      .catch(() => []);
    datas.push(...bids.map((x) => x.data_disparo));
    const validos = datas.filter((d) => !Number.isNaN(instanteUtc(d))).sort((a, b) => instanteUtc(a) - instanteUtc(b));
    saida.push({ ...row, proximo_disparo: validos[0] ?? null });
  }
  return saida;
}
