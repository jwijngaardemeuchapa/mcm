import { useEffect } from "react";
import { toast } from "sonner";
import { getDb } from "./db";
import { readSettings } from "./settings";
import { dispatchQueue, type ChapaSnap, type TaskSnap } from "./dispatchQueue";
import { logActivity } from "./activityLog";
import { getCarteiraDoAnalista } from "./carteira";
import { companyMatches } from "./company";
import type { ChapaNovaSync } from "./ingestTarefas";

/**
 * FUP automático pra chapa NOVO numa tarefa depois de um sync (o sync avisa pelo evento "chapas:novos";
 * quem é "novo" está em chapasNovos.ts). Cada chapa recebe um FUP individual — o mesmo da tela (PréFUP ou FUP,
 * conforme a janela) —, com os mesmos 60 s de contagem, cancelável no painel de disparos. Vários chapas saem
 * espaçados. Só pra empresas da carteira do analista (o sync traz as tarefas de todo mundo). Desligado por
 * padrão (`fupAutoNovosChapas`).
 */

/** Mais que isso de uma vez parece carga em massa (ou erro), não "chegou um nome": não dispara, só avisa. */
export const LIMITE_NOVOS_POR_SYNC = 40;
export const INTERVALO_ENTRE_CHAPAS_MS = 10_000;

const TAREFA_FORA_DE_JOGO = /cancel|conclu|finaliz|andamento/i;

type Banco = { select<T>(sql: string, params?: unknown[]): Promise<T> };

export type AlvoFup = { chapa: ChapaSnap; task: TaskSnap };

const digitos = (tel: string | null | undefined) => (tel ?? "").replace(/\D/g, "").slice(-11);

/**
 * Dos chapas novos, quem de fato recebe o FUP: ainda pendente, com telefone, sem nenhum FUP registrado, em
 * tarefa ativa que ainda não começou. Não repete o telefone de quem já foi contatado nessa tarefa (nome corrigido
 * no Metabase vira "chapa novo" com o mesmo telefone) nem dois novos com o mesmo telefone.
 */
export async function escolherAlvos(db: Banco, novos: ChapaNovaSync[], agora: number = Date.now()): Promise<AlvoFup[]> {
  const ordem = new Map(novos.map((n, i) => [n.id, i]));
  const linhas: Array<ChapaSnap & { id_tarefa: number; data_tarefa: string; empresa: string; cidade_uf: string | null; status_tarefa: string | null }> = [];
  for (let i = 0; i < novos.length; i += 400) {
    const lote = novos.slice(i, i + 400);
    linhas.push(...await db.select<typeof linhas>(
      `SELECT c.id, c.nome_chapa, c.telefone_chapa, c.status_contato, t.id_tarefa, t.data_tarefa, t.empresa, t.cidade_uf, t.status_tarefa
       FROM chapas c
       JOIN tarefas t ON t.id_tarefa = c.id_tarefa
       WHERE c.id IN (${lote.map(() => "?").join(",")})
         AND t.ativo = 1
         AND c.status_contato = 'pendente'
         AND c.telefone_chapa IS NOT NULL AND c.telefone_chapa != ''
         AND NOT EXISTS (SELECT 1 FROM fup_log f WHERE f.chapa_id = c.id)`,
      lote.map((n) => n.id),
    ));
  }
  linhas.sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0));

  const elegiveis = linhas.filter(
    (l) => new Date(l.data_tarefa).getTime() > agora && !TAREFA_FORA_DE_JOGO.test(String(l.status_tarefa ?? "")),
  );
  if (elegiveis.length === 0) return [];

  // telefones já contatados nessas tarefas
  const tarefas = [...new Set(elegiveis.map((l) => l.id_tarefa))];
  const jaContatados = new Set<string>();
  for (let i = 0; i < tarefas.length; i += 400) {
    const lote = tarefas.slice(i, i + 400);
    const rows = await db.select<{ id_tarefa: number; telefone_chapa: string | null }[]>(
      `SELECT DISTINCT c2.id_tarefa, c2.telefone_chapa FROM fup_log f JOIN chapas c2 ON c2.id = f.chapa_id
       WHERE c2.id_tarefa IN (${lote.map(() => "?").join(",")})`,
      lote,
    );
    rows.forEach((r) => jaContatados.add(`${r.id_tarefa}|${digitos(r.telefone_chapa)}`));
  }

  const alvos: AlvoFup[] = [];
  for (const l of elegiveis) {
    const chave = `${l.id_tarefa}|${digitos(l.telefone_chapa)}`;
    if (jaContatados.has(chave)) continue;
    jaContatados.add(chave);
    alvos.push({
      chapa: { id: l.id, nome_chapa: l.nome_chapa, telefone_chapa: l.telefone_chapa, status_contato: l.status_contato },
      task: { id_tarefa: l.id_tarefa, data_tarefa: l.data_tarefa, empresa: l.empresa, cidade_uf: l.cidade_uf },
    });
  }
  return alvos;
}

/** Conferido quando acaba a contagem: o chapa continua pendente, sem FUP, e a tarefa ainda não começou. */
async function aindaVale(alvo: AlvoFup): Promise<boolean> {
  if (new Date(alvo.task.data_tarefa).getTime() <= Date.now()) return false;
  const db = await getDb();
  const r = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM chapas c
     WHERE c.id = ? AND c.status_contato = 'pendente' AND NOT EXISTS (SELECT 1 FROM fup_log f WHERE f.chapa_id = c.id)`,
    [alvo.chapa.id],
  );
  return (r[0]?.n ?? 0) > 0;
}

export type IniciarFup = (alvo: AlvoFup) => void;

const iniciarPadrao: IniciarFup = (alvo) => {
  if (dispatchQueue.getChapaJobState(alvo.chapa.id)) return; // já tem um disparo em contagem pra ele
  dispatchQueue.startChapaJob(alvo.chapa.id, "fup", alvo.chapa, alvo.task, { aindaVale: () => aindaVale(alvo) });
};

/** Chapas novos chegaram do sync: se o recurso está ligado, agenda o FUP de quem se qualifica. Devolve quantos. */
export async function reagirAChapasNovos(
  novos: ChapaNovaSync[],
  deps: { db?: Banco; iniciar?: IniciarFup; agora?: number; carteira?: () => Promise<string[]> } = {},
): Promise<number> {
  if (novos.length === 0 || !readSettings().fupAutoNovosChapas) return 0;
  const todos = await escolherAlvos(deps.db ?? (await getDb()), novos, deps.agora);
  if (todos.length === 0) return 0;
  // Só as empresas da carteira deste analista (mesma regra do Dashboard; carteira vazia = sem restrição).
  // Sem conseguir ler a carteira, não dispara: melhor não enviar do que enviar a tarefa de outro analista.
  let carteira: string[];
  try {
    carteira = await (deps.carteira ?? getCarteiraDoAnalista)();
  } catch {
    return 0;
  }
  const alvos = carteira.length === 0 ? todos : todos.filter((a) => companyMatches(a.task.empresa, carteira));
  if (alvos.length === 0) return 0;
  if (alvos.length > LIMITE_NOVOS_POR_SYNC) {
    toast.warning(
      `${alvos.length} chapas novos de uma vez — o FUP automático não disparou (limite de ${LIMITE_NOVOS_POR_SYNC} por sync). Use o FUP em massa.`,
    );
    return 0;
  }

  const iniciar = deps.iniciar ?? iniciarPadrao;
  alvos.forEach((alvo, i) => {
    if (i === 0) iniciar(alvo);
    else setTimeout(() => iniciar(alvo), i * INTERVALO_ENTRE_CHAPAS_MS);
    void logActivity({
      tipo: "fup_auto",
      descricao: "FUP automático — chapa novo na tarefa",
      chapa_nome: alvo.chapa.nome_chapa,
      empresa: alvo.task.empresa,
      id_tarefa: alvo.task.id_tarefa,
      timestamp: Date.now(),
    }).then(() => window.dispatchEvent(new CustomEvent("activity:new-diff")));
  });
  const nomes = alvos.slice(0, 3).map((a) => a.chapa.nome_chapa).join(", ");
  toast.info(
    `${alvos.length} chapa(s) novo(s) na tarefa — FUP automático em 1 min${alvos.length > 1 ? " (espaçado)" : ""}: ${nomes}${alvos.length > 3 ? "…" : ""}. Dá pra cancelar no painel de disparos.`,
  );
  return alvos.length;
}

/** Monta uma vez no layout do app: escuta o aviso de chapas novos que o sync emite. */
export function useFupNovosChapas() {
  useEffect(() => {
    function onNovos(e: Event) {
      const chapas = (e as CustomEvent<{ chapas?: ChapaNovaSync[] }>).detail?.chapas ?? [];
      reagirAChapasNovos(chapas).catch(() => { /* melhor-esforço: nunca atrapalha o sync */ });
    }
    window.addEventListener("chapas:novos", onNovos);
    return () => window.removeEventListener("chapas:novos", onNovos);
  }, []);
}
