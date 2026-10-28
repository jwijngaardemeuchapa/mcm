import { fmtSP, parseTaskDate, somaDiasISO, todayDateISO_SP } from "./datetime";
import { companyMatches } from "./company";
import { emJanelaDeFup } from "./prefup";
import {
  buildConfiabilidadeMap, CONFIABILIDADE_JANELA_DIAS, CONFIABILIDADE_MIN_PARTICIPACOES, lookupConfiabilidade, type ConfiabilidadeStats,
} from "./confiabilidade";
import type { EntradaChapa, EntradaTarefa, TipoDisparo } from "./alarmeChapas";

/**
 * Monta, direto do banco, o que o alarme precisa saber de cada tarefa que ainda vai começar: quem não
 * confirmou, o que já recebeu e há quanto tempo. Independe da página aberta (o alarme é global) e da
 * carteira do Dashboard — mas respeita a carteira do analista.
 */

type Banco = { select<T>(sql: string, params?: unknown[]): Promise<T> };

export type ChapaDoAlarme = EntradaChapa & { chatId: string | null };
export type TarefaDoAlarme = Omit<EntradaTarefa, "chapas"> & {
  cidade_uf: string | null;
  chapas: ChapaDoAlarme[];
  /** Nomes de todos os chapas que não foram removidos (a lista da portaria). */
  nomes: string[];
};

/** Tarefa que já passou do ponto de "dá pra mexer nos chapas". */
const TAREFA_FORA_DE_JOGO = /cancel|conclu|finaliz|andamento|an[aá]lise/i;
/** Canais que NÃO são um contato com o chapa (avisos de cancelamento e a sincronização). */
const CANAL_NAO_E_CONTATO = /cancel|central_sync/i;

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-11);

type Tarefa = { id_tarefa: number; data_tarefa: string; empresa: string; cidade_uf: string | null; status_tarefa: string | null; quantidade_chapas: number | null };
type ChapaRow = {
  id: string; id_tarefa: number; nome_chapa: string | null; telefone_chapa: string | null; cpf: string | null;
  status_contato: string; canal_contato: string | null; data_contato: string | null;
};
type LogRow = { chapa_id: string; data_disparo: string; canal: string; aguarda_resposta_chat?: number | null; umbler_chat_id?: string | null };

function emLotes<T>(itens: T[], tamanho = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho));
  return out;
}

/** O disparo foi PréFUP ou FUP? A marca do banco manda; sem ela, a mesma regra de janela do envio (5 h / dia seguinte). */
export function tipoDoDisparo(
  quando: number, tarefa: { data_tarefa: string; cidade_uf: string | null }, canal: string, aguardaResposta: number | null | undefined,
): TipoDisparo {
  if (aguardaResposta) return "prefup";
  if (canal === "umbler_talk") return "fup"; // bot D0: sempre FUP
  const diaDisparo = fmtSP(new Date(quando).toISOString(), "yyyy-MM-dd");
  if (fmtSP(tarefa.data_tarefa, "yyyy-MM-dd") > diaDisparo) return "prefup";
  return (parseTaskDate(tarefa.data_tarefa, tarefa.cidade_uf).getTime() - quando) / 3_600_000 > 5 ? "prefup" : "fup";
}

async function carregarLog(db: Banco, ids: number[]): Promise<LogRow[]> {
  const out: LogRow[] = [];
  for (const lote of emLotes(ids)) {
    const ph = lote.map(() => "?").join(",");
    const onde = `FROM fup_log WHERE id_tarefa IN (${ph}) AND chapa_id IS NOT NULL`;
    try {
      out.push(...await db.select<LogRow[]>(`SELECT chapa_id, data_disparo, canal, aguarda_resposta_chat, umbler_chat_id ${onde}`, lote));
    } catch {
      // as colunas aguarda_resposta_chat / umbler_chat_id só existem depois do primeiro disparo
      out.push(...await db.select<LogRow[]>(`SELECT chapa_id, data_disparo, canal ${onde}`, lote));
    }
  }
  return out;
}

export async function carregarEntradasDoAlarme(
  db: Banco,
  opts: {
    horizonteHoras: number;
    /** Empresas da carteira do analista; [] = sem restrição. */
    carteira: string[];
    /** Telefones (últimos 11 dígitos) com mensagem não lida no chat. */
    naoLidas: Set<string>;
    confiabilidade?: Map<string, ConfiabilidadeStats> | null;
  },
): Promise<TarefaDoAlarme[]> {
  const agora = Date.now();
  const hoje = todayDateISO_SP();
  const todas = await db.select<Tarefa[]>(
    `SELECT id_tarefa, data_tarefa, empresa, cidade_uf, status_tarefa, quantidade_chapas FROM tarefas
     WHERE ativo = 1 AND substr(data_tarefa, 1, 10) >= ? AND substr(data_tarefa, 1, 10) <= ?`,
    [somaDiasISO(hoje, -1), somaDiasISO(hoje, 3)],
  );
  const tarefas = todas.filter((t) => {
    if (TAREFA_FORA_DE_JOGO.test(String(t.status_tarefa ?? ""))) return false;
    const min = (parseTaskDate(t.data_tarefa, t.cidade_uf).getTime() - agora) / 60_000;
    if (min <= 0 || min > opts.horizonteHoras * 60) return false;
    return opts.carteira.length === 0 || companyMatches(t.empresa, opts.carteira);
  });
  if (tarefas.length === 0) return [];

  const ids = tarefas.map((t) => t.id_tarefa);
  const chapas: ChapaRow[] = [];
  for (const lote of emLotes(ids)) {
    chapas.push(...await db.select<ChapaRow[]>(
      `SELECT id, id_tarefa, nome_chapa, telefone_chapa, cpf, status_contato, canal_contato, data_contato
       FROM chapas WHERE id_tarefa IN (${lote.map(() => "?").join(",")})`,
      lote,
    ));
  }
  const log = await carregarLog(db, ids);

  const porChapa = new Map<string, LogRow[]>();
  for (const l of log) {
    if (CANAL_NAO_E_CONTATO.test(l.canal)) continue;
    (porChapa.get(l.chapa_id) ?? porChapa.set(l.chapa_id, []).get(l.chapa_id)!).push(l);
  }
  const chapasPorTarefa = new Map<number, ChapaRow[]>();
  for (const c of chapas) (chapasPorTarefa.get(c.id_tarefa) ?? chapasPorTarefa.set(c.id_tarefa, []).get(c.id_tarefa)!).push(c);

  return tarefas.map((t): TarefaDoAlarme => {
    const dela = chapasPorTarefa.get(t.id_tarefa) ?? [];
    const reais = dela.filter((c) => c.nome_chapa && c.status_contato !== "removido");
    const confirmados = reais.filter((c) => c.status_contato === "confirmado").length;
    const pendentes = reais.filter((c) => c.status_contato !== "confirmado");

    const entradas = pendentes.map((c): ChapaDoAlarme => {
      const rows = (porChapa.get(c.id) ?? []).slice().sort((a, b) => (a.data_disparo < b.data_disparo ? -1 : 1));
      let ultimo: EntradaChapa["ultimoDisparo"] = null;
      let chatId: string | null = null;
      if (rows.length > 0) {
        const r = rows[rows.length - 1];
        const quando = new Date(r.data_disparo).getTime();
        ultimo = { quando, tipo: tipoDoDisparo(quando, t, r.canal, r.aguarda_resposta_chat), canal: r.canal };
        chatId = [...rows].reverse().find((x) => x.umbler_chat_id)?.umbler_chat_id ?? null;
      } else if (c.canal_contato && !CANAL_NAO_E_CONTATO.test(c.canal_contato) && c.data_contato) {
        // contato gravado só no chapa (ex.: FUP em massa sem chat devolvido)
        const quando = new Date(c.data_contato).getTime();
        if (!Number.isNaN(quando)) ultimo = { quando, tipo: tipoDoDisparo(quando, t, c.canal_contato, null), canal: c.canal_contato };
      }
      const conf = lookupConfiabilidade(opts.confiabilidade, { cpf: c.cpf, telefone_chapa: c.telefone_chapa, nome_chapa: c.nome_chapa });
      const confiavel = conf && conf.participacoes >= CONFIABILIDADE_MIN_PARTICIPACOES ? conf : null;
      return {
        id: c.id,
        nome: c.nome_chapa!,
        telefone: c.telefone_chapa && c.telefone_chapa.trim() ? c.telefone_chapa : null,
        status: c.status_contato,
        semRespostaEnviado: c.canal_contato === "umbler_cancelamento",
        naoLida: !!c.telefone_chapa && opts.naoLidas.has(digitos(c.telefone_chapa)),
        ultimoDisparo: ultimo,
        disparos: rows.length,
        estrelas: confiavel ? confiavel.stars : null,
        faltas: confiavel ? confiavel.faltas : null,
        chatId,
      };
    });

    return {
      id_tarefa: t.id_tarefa,
      empresa: t.empresa,
      data_tarefa: t.data_tarefa,
      cidade_uf: t.cidade_uf,
      minParaTarefa: (parseTaskDate(t.data_tarefa, t.cidade_uf).getTime() - agora) / 60_000,
      solicitados: t.quantidade_chapas || reais.length,
      confirmados,
      tipoSugerido: emJanelaDeFup(t.data_tarefa, t.cidade_uf) ? "fup" : "prefup",
      chapas: entradas,
      nomes: reais.map((c) => c.nome_chapa!),
    };
  });
}

/* ── confiabilidade (15 dias), com cache: a conta é pesada pra rodar a cada 30 s ── */

let cacheConf: { em: number; mapa: Map<string, ConfiabilidadeStats> } | null = null;
const TTL_CONFIABILIDADE_MS = 10 * 60_000;

export async function carregarConfiabilidade(db: Banco, agora = Date.now()): Promise<Map<string, ConfiabilidadeStats> | null> {
  if (cacheConf && agora - cacheConf.em < TTL_CONFIABILIDADE_MS) return cacheConf.mapa;
  try {
    const desde = somaDiasISO(todayDateISO_SP(), -(CONFIABILIDADE_JANELA_DIAS + 1));
    const rows = await db.select<Array<{ id_tarefa: number; data_tarefa: string; cpf: string | null; telefone_chapa: string | null; nome_chapa: string | null; status_contato: string; validacao_presenca: string | null }>>(
      `SELECT c.id_tarefa, t.data_tarefa, c.cpf, c.telefone_chapa, c.nome_chapa, c.status_contato, c.validacao_presenca
       FROM chapas c JOIN tarefas t ON t.id_tarefa = c.id_tarefa WHERE substr(t.data_tarefa, 1, 10) >= ?`,
      [desde],
    );
    const tarefas = [...new Map(rows.map((r) => [r.id_tarefa, { id_tarefa: r.id_tarefa, data_tarefa: r.data_tarefa }])).values()];
    cacheConf = { em: agora, mapa: buildConfiabilidadeMap(tarefas, rows) };
    return cacheConf.mapa;
  } catch {
    return null; // sem a confiabilidade o alarme funciona igual (ela só informa)
  }
}

/** Só pros testes. */
export function limparCacheConfiabilidade() {
  cacheConf = null;
}
