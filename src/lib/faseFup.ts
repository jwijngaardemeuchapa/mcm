// Fase do FUP — o que o analista VÊ depois que os PréFUPs foram confirmados.
//
// O chapa que confirmou só o PréFUP continua "confirmado" (conta no fill rate, nada se perde), mas
// quando a tarefa entra na fase do FUP ele deixa de aparecer verde: vira "Aguardando FUP" (âmbar) até
// confirmar o FUP, e só então fica verde. Assim dá pra ver de relance quem já respondeu o FUP e quem não.
//
// A fase do FUP começa sozinha quando faltam 5 h ou menos pro início da tarefa (a mesma fronteira
// PréFUP x FUP do disparo) e termina quando a tarefa começa. O analista também pode antecipar com o
// botão "Resetar PréFUPs": a tarefa entra na fase do FUP antes da hora (e dá pra desfazer).
//
// Módulo sem banco e sem tela: o taskState (cor do card) e os componentes usam a mesma regra.

import { parseTaskDate } from "./datetime";
import { idsDoCard } from "./agrupamentoTarefas";
import type { ChapaFases } from "./fasesConfirmacao";

/** Fronteira PréFUP x FUP (a mesma de isPrefupTemplateWindow em prefup.ts): 5 h antes do início. */
export const MINUTOS_JANELA_FUP = 300;

export type EstadoDaFase =
  | "fup_ok" //       confirmou o FUP (verde cheio)
  | "aguarda_fup" //  confirmou só o PréFUP e a tarefa já está na fase do FUP (âmbar)
  | "prefup_ok" //    confirmou só o PréFUP e ainda é a fase do PréFUP (verde, como sempre)
  | "normal"; //      não confirmado, ou confirmado sem fase registrada (dado antigo)

type TarefaDaFase = { id_tarefa: number; data_tarefa: string; cidade_uf?: string | null; grupo?: unknown };

/** Falta ≤ 5 h e a tarefa ainda não começou? (a fase do FUP "automática") */
export function naJanelaAutomaticaDoFup(dataTarefa: string, cidadeUf?: string | null, agora: number = Date.now()): boolean {
  const minutos = (parseTaskDate(dataTarefa, cidadeUf).getTime() - agora) / 60_000;
  return minutos > 0 && minutos <= MINUTOS_JANELA_FUP;
}

/* ── "Resetar PréFUPs" (antecipa a fase do FUP) — preferência do analista, por computador ── */

const CHAVE = "fup_fase_antecipada";
const VALIDADE_MS = 3 * 86_400_000; // marcas antigas não ficam pra sempre
export const EVENTO_FASE_FUP = "mcm:fase-fup";

let marcas: Map<number, number> | null = null;
let versao = 0;

function carregar(): Map<number, number> {
  if (marcas) return marcas;
  marcas = new Map();
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as Record<string, unknown>;
    const limite = Date.now() - VALIDADE_MS;
    for (const [id, quando] of Object.entries(bruto)) {
      if (typeof quando === "number" && quando >= limite && Number.isFinite(Number(id))) marcas.set(Number(id), quando);
    }
  } catch {
    /* armazenamento indisponível ou corrompido: começa vazio */
  }
  return marcas;
}

function gravar(): void {
  versao++;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(Object.fromEntries(carregar())));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_FASE_FUP));
  } catch {
    /* sem window (teste de node puro) */
  }
}

/** Alguma das tarefas está com a fase do FUP antecipada pelo analista? */
export function faseFupAntecipada(ids: number[]): boolean {
  const m = carregar();
  return ids.some((id) => m.has(id));
}

/** Antecipa a fase do FUP nessas tarefas ("Resetar PréFUPs"). */
export function anteciparFaseFup(ids: number[], agora: number = Date.now()): void {
  const m = carregar();
  ids.forEach((id) => m.set(id, agora));
  gravar();
}

/** Desfaz a antecipação (volta a valer só a janela automática). */
export function desfazerFaseFup(ids: number[]): void {
  const m = carregar();
  ids.forEach((id) => m.delete(id));
  gravar();
}

/** Contador que sobe a cada mudança — pra componentes re-renderizarem (useSyncExternalStore). */
export const versaoDaFaseFup = (): number => versao;

/** Só pra teste: esquece o que está em memória e relê do armazenamento. */
export function _reiniciarFaseFup(): void {
  marcas = null;
  versao = 0;
}

/* ── a fase de uma tarefa e de um chapa ── */

/**
 * A tarefa está na fase do FUP? Janela automática (≤ 5 h) ou antecipada pelo analista — e só até a
 * tarefa começar (depois do horário não faz sentido cobrir FUP). Card de grupo: vale se alguma das tarefas.
 */
export function faseFupAtiva(t: TarefaDaFase, agora: number = Date.now()): boolean {
  const minutos = (parseTaskDate(t.data_tarefa, t.cidade_uf).getTime() - agora) / 60_000;
  if (minutos <= 0) return false;
  return minutos <= MINUTOS_JANELA_FUP || faseFupAntecipada(idsDoCard(t));
}

export function estadoDaFase(c: ChapaFases, faseFup: boolean): EstadoDaFase {
  if (c.status_contato !== "confirmado") return "normal";
  if (c.fup_confirmado_em) return "fup_ok";
  if (c.prefup_confirmado_em) return faseFup ? "aguarda_fup" : "prefup_ok";
  return "normal";
}

export type ContagemDaFase = { fupOk: number; aguardaFup: number; prefupOk: number };

export function contagemDaFase(chapas: ChapaFases[], faseFup: boolean): ContagemDaFase {
  const r: ContagemDaFase = { fupOk: 0, aguardaFup: 0, prefupOk: 0 };
  for (const c of chapas) {
    const e = estadoDaFase(c, faseFup);
    if (e === "fup_ok") r.fupOk++;
    else if (e === "aguarda_fup") r.aguardaFup++;
    else if (e === "prefup_ok") r.prefupOk++;
  }
  return r;
}

type LinhaDeFup = { chapa_id?: string | null; canal: string; data_disparo: string; aguarda_resposta_chat?: number | null };

/**
 * Quando o FUP (não o PréFUP) foi enviado pra esse chapa, DEPOIS de ele confirmar o PréFUP.
 * null = o FUP ainda não saiu pra ele. Só conta o disparo do bot de FUP (`umbler_talk` sem o flag de PréFUP).
 */
export function fupEnviadoDepoisDoPrefup(fupLog: LinhaDeFup[], chapaId: string, prefupConfirmadoEm: string | null | undefined): string | null {
  const desde = prefupConfirmadoEm ? new Date(prefupConfirmadoEm).getTime() : 0;
  let melhor: string | null = null;
  for (const f of fupLog) {
    if (f.chapa_id !== chapaId || f.canal !== "umbler_talk" || f.aguarda_resposta_chat) continue;
    const ms = new Date(f.data_disparo).getTime();
    if (!Number.isFinite(ms) || ms <= desde) continue;
    if (melhor === null || ms > new Date(melhor).getTime()) melhor = f.data_disparo;
  }
  return melhor;
}
