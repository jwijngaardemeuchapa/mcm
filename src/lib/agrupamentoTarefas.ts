// Agrupamento de tarefas do mesmo endereço e horário.
//
// Alguns clientes lançam UMA tarefa por chapa em vez de uma tarefa com várias vagas. Na tela
// isso vira dezenas de cards de 1 vaga cada. Aqui as tarefas do mesmo cliente + mesmo endereço +
// mesmo horário viram UM card "de grupo", com os chapas de todas as tarefas juntos.
//
// É só apresentação: as listas "cruas" (alarmes, notificações, exportações) continuam por tarefa.
// Cada chapa mantém o `id_tarefa` da tarefa de origem — é com ele que o app grava confirmação,
// FUP e validação. Módulo puro (sem banco, sem tela), testado à parte.

import { normalize } from "./normalize";
import { fmtSP } from "./datetime";

export const STATUS_EM_ANALISE = "Em Análise";

// Ordem de "avanço" da validação: o grupo só conta como pronto quando TODAS as tarefas estão.
const ORDEM_VALIDACAO = ["aguardando", "pendente", "validacao_recebida", "subido_meu_chapa"];

type Chapa = { id: string; id_tarefa?: number } & Record<string, unknown>;
type Disparo = { data_disparo: string } & Record<string, unknown>;

/** O mínimo pra decidir se duas tarefas são "a mesma": cliente, endereço, horário e status. */
export type ChaveAgrupavel = {
  data_tarefa: string;
  empresa: string;
  cidade_uf: string | null;
  status_tarefa: string;
  /** vínculo tarefa→endereço (Metabase). Sem ele, o endereço é a cidade. */
  endereco_id?: string | null;
};

/** O que o agrupamento precisa saber de um card. O card do Dashboard (TaskWithChapas) cabe aqui. */
export type CardAgrupavel = ChaveAgrupavel & {
  id_tarefa: number;
  quantidade_chapas: number;
  is_overnight?: boolean | null;
  validacao_status?: string | null;
  data_validacao_recebida?: string | null;
  data_upload_meu_chapa?: string | null;
  obs_validacao?: string | null;
  observacoes?: string | null;
  observacoes_updated_at?: string | null;
  remessa?: string | null;
  tipo_trabalho?: string | null;
  em_oferta?: number | boolean | null;
  chapa_em_oferta?: string | null;
  criada_em?: string | null;
  importado_em?: string | null;
  chapas: Chapa[];
  fup_log: Disparo[];
  urgent: boolean;
  continuingFromYesterday?: boolean;
  grupo?: unknown;
};

export type InfoGrupo<T> = {
  /** ids de todas as tarefas do grupo (a primeira é a "líder": a de menor id) */
  ids: number[];
  /** os cards originais, na ordem do grupo */
  membros: T[];
};

export type CardDeGrupo<T extends CardAgrupavel> = T & { grupo: InfoGrupo<T> };

/** Tarefa do mesmo cliente + endereço + horário (+ "em análise" separado das aprovadas). */
export function chaveDeAgrupamento(t: ChaveAgrupavel): string {
  const empresa = normalize(t.empresa ?? "").replace(/\s+/g, " ").trim();
  const endereco = t.endereco_id ? `end:${t.endereco_id}` : `cid:${normalize(t.cidade_uf ?? "").replace(/\s+/g, " ").trim()}`;
  const quando = fmtSP(t.data_tarefa, "yyyy-MM-dd HH:mm");
  const analise = t.status_tarefa === STATUS_EM_ANALISE ? "analise" : "ok";
  return [empresa, endereco, quando, analise].join("|");
}

export const ehGrupo = (t: { grupo?: unknown }): boolean => !!t.grupo;

/** Ids de todas as tarefas que o card representa (1 se não for grupo). */
export function idsDoCard(t: { id_tarefa: number; grupo?: unknown }): number[] {
  const g = t.grupo as { ids?: number[] } | undefined;
  return g?.ids ?? [t.id_tarefa];
}

/** Id da tarefa de origem de um chapa (no grupo, cada chapa vem de uma tarefa diferente). */
export function idTarefaDoChapa(chapa: { id_tarefa?: number | null }, card: { id_tarefa: number }): number {
  return chapa.id_tarefa ?? card.id_tarefa;
}

const unicos = (valores: Array<string | null | undefined>): string[] => {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const v of valores) {
    const s = (v ?? "").trim();
    if (!s) continue;
    const k = normalize(s);
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push(s);
  }
  return saida;
};

const maisRecente = (valores: Array<string | null | undefined>): string | null => {
  const ok = valores.filter((v): v is string => !!v);
  return ok.length === 0 ? null : ok.reduce((a, b) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b));
};

const maisAntigo = (valores: Array<string | null | undefined>): string | null => {
  const ok = valores.filter((v): v is string => !!v);
  return ok.length === 0 ? null : ok.reduce((a, b) => (new Date(a).getTime() <= new Date(b).getTime() ? a : b));
};

function menosAvancada(valores: Array<string | null | undefined>): string {
  let pior = ORDEM_VALIDACAO.length;
  for (const v of valores) {
    const r = ORDEM_VALIDACAO.indexOf(v ?? "aguardando");
    pior = Math.min(pior, r === -1 ? 0 : r);
  }
  return ORDEM_VALIDACAO[Math.min(pior, ORDEM_VALIDACAO.length - 1)];
}

const pedidos = (t: CardAgrupavel) => t.quantidade_chapas || t.chapas.length;

/** Funde as tarefas num único card (as de `membros` já vêm na ordem do grupo). */
export function fundirTarefas<T extends CardAgrupavel>(membros: T[]): CardDeGrupo<T> {
  const lider = membros[0];
  const chapas = membros.flatMap((m) => m.chapas.map((c) => (c.id_tarefa == null ? { ...c, id_tarefa: m.id_tarefa } : c)));
  const fup = membros
    .flatMap((m) => m.fup_log.map((f) => (f.id_tarefa == null ? { ...f, id_tarefa: m.id_tarefa } : f)))
    .sort((a, b) => new Date(b.data_disparo).getTime() - new Date(a.data_disparo).getTime());
  const nomesEmOferta = unicos(membros.map((m) => m.chapa_em_oferta));
  return {
    ...lider,
    quantidade_chapas: membros.reduce((soma, m) => soma + pedidos(m), 0),
    is_overnight: membros.some((m) => !!m.is_overnight),
    validacao_status: menosAvancada(membros.map((m) => m.validacao_status)),
    data_validacao_recebida: maisRecente(membros.map((m) => m.data_validacao_recebida)),
    data_upload_meu_chapa: maisRecente(membros.map((m) => m.data_upload_meu_chapa)),
    remessa: unicos(membros.map((m) => m.remessa)).join(" · ") || null,
    tipo_trabalho: unicos(membros.map((m) => m.tipo_trabalho)).join(" · ") || null,
    em_oferta: membros.some((m) => !!m.em_oferta) ? 1 : 0,
    chapa_em_oferta: nomesEmOferta.length > 0 ? nomesEmOferta.join(", ") : null,
    criada_em: maisAntigo(membros.map((m) => m.criada_em)),
    chapas,
    fup_log: fup,
    urgent: membros.some((m) => m.urgent),
    continuingFromYesterday: membros.some((m) => !!m.continuingFromYesterday),
    grupo: { ids: membros.map((m) => m.id_tarefa), membros },
  } as CardDeGrupo<T>;
}

// ---- agrupamento "simples" (BID): tarefas abertas sem chapas/FUP no objeto, só vagas ----

/** Tarefa da lista do BID: só números de vagas, sem os chapas (o card carrega isso sozinho). */
export type TarefaSimples = ChaveAgrupavel & {
  id_tarefa: number;
  quantidade_chapas: number;
  alocados?: number;
  remessa?: string | null;
  tipo_trabalho?: string | null;
  em_oferta?: number | boolean | null;
  chapa_em_oferta?: string | null;
};

/**
 * Agrupa tarefas abertas do BID: vagas e alocados SOMAM, a líder (menor id) dá o rosto do card.
 * Quem não tem par fica como está (mesma referência). `desfeitos` = tarefas tiradas do agrupamento.
 */
export function agruparTarefasSimples<T extends TarefaSimples>(
  lista: T[],
  desfeitos: ReadonlySet<number>,
): Array<T & { grupo?: InfoGrupo<T> }> {
  const porChave = new Map<string, T[]>();
  for (const t of lista) {
    if (desfeitos.has(t.id_tarefa)) continue;
    const k = chaveDeAgrupamento(t);
    const g = porChave.get(k);
    if (g) g.push(t);
    else porChave.set(k, [t]);
  }
  const cardDoGrupo = new Map<string, T & { grupo: InfoGrupo<T> }>();
  for (const [chave, membros] of porChave) {
    if (membros.length < 2) continue;
    const m = [...membros].sort((a, b) => a.id_tarefa - b.id_tarefa);
    const nomesEmOferta = unicos(m.map((x) => x.chapa_em_oferta));
    cardDoGrupo.set(chave, {
      ...m[0],
      quantidade_chapas: m.reduce((soma, x) => soma + (x.quantidade_chapas || 0), 0),
      alocados: m.reduce((soma, x) => soma + (x.alocados ?? 0), 0),
      remessa: unicos(m.map((x) => x.remessa)).join(" · ") || null,
      tipo_trabalho: unicos(m.map((x) => x.tipo_trabalho)).join(" · ") || null,
      em_oferta: m.some((x) => !!x.em_oferta) ? 1 : 0,
      chapa_em_oferta: nomesEmOferta.length > 0 ? nomesEmOferta.join(", ") : null,
      grupo: { ids: m.map((x) => x.id_tarefa), membros: m },
    });
  }
  const jaPosto = new Set<string>();
  const saida: Array<T & { grupo?: InfoGrupo<T> }> = [];
  for (const t of lista) {
    const k = desfeitos.has(t.id_tarefa) ? null : chaveDeAgrupamento(t);
    const card = k ? cardDoGrupo.get(k) : undefined;
    if (!card) {
      saida.push(t);
      continue;
    }
    if (jaPosto.has(k!)) continue;
    jaPosto.add(k!);
    saida.push(card);
  }
  return saida;
}

type Guardado<T extends CardAgrupavel> = { membros: T[]; card: CardDeGrupo<T> };
export type CacheDeGrupos<T extends CardAgrupavel> = Map<string, Guardado<T>>;

export const novoCacheDeGrupos = <T extends CardAgrupavel>(): CacheDeGrupos<T> => new Map();

/**
 * Agrupa os cards de `lista` (já ordenada por horário). Cada grupo ocupa o lugar do primeiro
 * membro; quem não tem par fica como está (mesma referência). `desfeitos` = tarefas que o analista
 * tirou do agrupamento. O `cache` devolve o MESMO card de grupo enquanto os membros forem os mesmos
 * objetos — sem isso o Dashboard re-renderizaria todos os cards a cada recarga de 30 s.
 */
export function agruparCards<T extends CardAgrupavel>(
  lista: T[],
  desfeitos: ReadonlySet<number>,
  cache: CacheDeGrupos<T>,
): T[] {
  const porChave = new Map<string, T[]>();
  for (const t of lista) {
    if (desfeitos.has(t.id_tarefa)) continue;
    const k = chaveDeAgrupamento(t);
    const g = porChave.get(k);
    if (g) g.push(t);
    else porChave.set(k, [t]);
  }

  const emUso = new Set<string>();
  const cardDoGrupo = new Map<string, T>();
  for (const [chave, membros] of porChave) {
    if (membros.length < 2) continue;
    const ordenados = [...membros].sort((a, b) => a.id_tarefa - b.id_tarefa); // líder = menor id
    const id = ordenados.map((m) => m.id_tarefa).join(",");
    emUso.add(id);
    const guardado = cache.get(id);
    if (guardado && guardado.membros.length === ordenados.length && guardado.membros.every((m, i) => m === ordenados[i])) {
      cardDoGrupo.set(chave, guardado.card);
    } else {
      const card = fundirTarefas(ordenados);
      cache.set(id, { membros: ordenados, card });
      cardDoGrupo.set(chave, card);
    }
  }
  for (const id of [...cache.keys()]) if (!emUso.has(id)) cache.delete(id);

  const jaPosto = new Set<string>();
  const saida: T[] = [];
  for (const t of lista) {
    const k = desfeitos.has(t.id_tarefa) ? null : chaveDeAgrupamento(t);
    const card = k ? cardDoGrupo.get(k) : undefined;
    if (!card) {
      saida.push(t);
      continue;
    }
    if (jaPosto.has(k!)) continue;
    jaPosto.add(k!);
    saida.push(card);
  }
  return saida;
}

// ---- preferências do analista (por computador) ----

const CHAVE_ATIVO = "dash_agrupar_iguais";
const CHAVE_DESFEITOS = "dash_grupos_desfeitos";

/** Agrupamento ligado? Padrão: ligado (o analista desliga no interruptor da barra). */
export function lerAgruparAtivo(): boolean {
  try {
    return localStorage.getItem(CHAVE_ATIVO) !== "0";
  } catch {
    return true;
  }
}

export function gravarAgruparAtivo(ativo: boolean): void {
  try {
    localStorage.setItem(CHAVE_ATIVO, ativo ? "1" : "0");
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

/** Tarefas que o analista tirou do agrupamento (cada uma volta a ser um card próprio). */
export function lerDesfeitos(): Set<number> {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_DESFEITOS) ?? "[]");
    return new Set(Array.isArray(bruto) ? bruto.filter((n): n is number => typeof n === "number") : []);
  } catch {
    return new Set();
  }
}

export function gravarDesfeitos(ids: ReadonlySet<number>): void {
  try {
    // guarda só o que ainda pode importar: lista curta, sem crescer pra sempre
    localStorage.setItem(CHAVE_DESFEITOS, JSON.stringify([...ids].slice(-500)));
  } catch {
    /* noop */
  }
}
