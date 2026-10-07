import { dataSP } from "./datetime";

// Carga do Dashboard (ver Dashboard.load). Antes ele lia as tabelas INTEIRAS
// (tarefas, chapas, fup_log, chat_links — todo o histórico, que só cresce) a
// cada 30 s, ordenava o fup_log criando um Date por comparação e, pra montar
// cada card, filtrava as três listas inteiras (custo T × (C+F+L), quadrático
// com o histórico). Com algumas semanas de uso isso vira segundos de CPU na
// thread da interface: o clique espera, a ventoinha sobe e "destrava" depois.

export type Linha = Record<string, unknown>;

export type TarefaLinha = Linha & {
  id_tarefa: number;
  data_tarefa: string;
  empresa: string;
  status_tarefa?: string | null;
  ativo?: boolean | number | null;
  is_overnight?: boolean | number | null;
  validacao_status?: string | null;
};

// Dias de histórico que o Dashboard realmente usa: a confiabilidade do chapa
// olha 15 dias, o overnight olha ontem; 20 dá folga. Tarefas mais antigas só
// entram se ainda estiverem ativas e não finalizadas (cards de hoje/futuro e
// a navegação por data).
export const DASHBOARD_JANELA_DIAS = 20;

// Tarefas que o Dashboard precisa. Espelha em SQL o que o código já fazia
// sobre as linhas carregadas (ativo = null conta como ativo, como o filtro
// `ativo !== false && ativo !== 0`).
const PREDICADO_TAREFAS_DASHBOARD = `(
  date(data_tarefa) >= date('now', '-${DASHBOARD_JANELA_DIAS} days')
  OR (
    COALESCE(ativo, 1) != 0
    AND LOWER(COALESCE(status_tarefa, '')) NOT LIKE 'cancel%'
    AND COALESCE(status_tarefa, '') != 'Finalizado'
  )
)`;

// Tarefas antigas (fora da janela) que ficaram com validacao_status
// 'aguardando' viravam 'pendente' no load porque eram lidas junto com tudo.
// Agora não são lidas — esta UPDATE faz a mesma transição direto no banco
// (têm mais de 20 dias, então já começaram).
export const SQL_TRANSICAO_VALIDACAO_ANTIGAS = `
  UPDATE tarefas SET validacao_status = 'pendente'
  WHERE COALESCE(validacao_status, 'aguardando') = 'aguardando'
    AND COALESCE(ativo, 1) != 0
    AND LOWER(COALESCE(status_tarefa, '')) NOT LIKE 'cancel%'
    AND date(data_tarefa) < date('now', '-${DASHBOARD_JANELA_DIAS} days')`;

export type BancoLeitura = {
  select<T>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

export type TabelasDashboard = {
  tarefas: TarefaLinha[];
  chapas: Linha[];
  fup: Linha[];
  chatLinks: Linha[];
};

export async function carregarTabelasDashboard(db: BancoLeitura): Promise<TabelasDashboard> {
  await db.execute(SQL_TRANSICAO_VALIDACAO_ANTIGAS).catch(() => {});
  const subconsulta = `SELECT id_tarefa FROM tarefas WHERE ${PREDICADO_TAREFAS_DASHBOARD}`;
  const [tarefas, chapas, fup, chatLinks] = await Promise.all([
    db.select<TarefaLinha[]>(`SELECT * FROM tarefas WHERE ${PREDICADO_TAREFAS_DASHBOARD}`),
    db.select<Linha[]>(`SELECT * FROM chapas WHERE id_tarefa IN (${subconsulta})`),
    db.select<Linha[]>(`SELECT * FROM fup_log WHERE id_tarefa IN (${subconsulta})`),
    // chat_links pode não existir numa instalação que não rodou a migração
    db.select<Linha[]>(`SELECT * FROM chat_links WHERE id_tarefa IN (${subconsulta})`).catch(() => [] as Linha[]),
  ]);
  return { tarefas, chapas, fup, chatLinks };
}

// Agrupa por tarefa uma vez (O(n)) em vez de .filter() por card. Mantém a
// ordem original dentro de cada grupo — igual ao filter que substitui.
export function agruparPorTarefa<T extends { id_tarefa: number }>(linhas: T[]): Map<number, T[]> {
  const mapa = new Map<number, T[]>();
  for (const l of linhas) {
    const grupo = mapa.get(l.id_tarefa);
    if (grupo) grupo.push(l);
    else mapa.set(l.id_tarefa, [l]);
  }
  return mapa;
}

// Mais recente primeiro. Calcula o timestamp de cada linha UMA vez (antes era
// new Date() dos dois lados a cada comparação). Mesmo comparador, mesma
// ordem final (a ordenação é estável).
export function ordenarFupRecentePrimeiro<T extends { data_disparo: string }>(linhas: T[]): T[] {
  return linhas
    .map((l) => [new Date(l.data_disparo).getTime(), l] as const)
    .sort((a, b) => b[0] - a[0])
    .map((p) => p[1]);
}

export function filtrarAtivas<T extends TarefaLinha>(tarefas: T[]): T[] {
  return tarefas.filter(
    (t) => t.ativo !== false && t.ativo !== 0 && !t.status_tarefa?.toLowerCase().startsWith("cancel"),
  );
}

// Os três recortes de tarefas que o Dashboard mostra (hoje+futuro, overnight
// de ontem, e todas as datas pra navegação). Mesma regra de antes, agora num
// lugar só que o Dashboard e o teste compartilham.
export function recortesDashboard<T extends TarefaLinha>(
  ativas: T[],
  todayISO: string,
  inCarteira: (empresa: string) => boolean,
): { todaysTasks: T[]; yesterdayOvernight: T[]; allDatesTasks: T[] } {
  const ontem = new Date(`${todayISO}T00:00:00-03:00`);
  ontem.setDate(ontem.getDate() - 1);
  const yISO = ontem.toISOString().slice(0, 10);

  const todaysTasks = ativas.filter((t) => {
    if (t.status_tarefa === "Finalizado") return false;
    if (t.status_tarefa?.toLowerCase().startsWith("cancel")) return false;
    // Todas as datas >= hoje (hoje + futuras presentes na importação)
    if (dataSP(t.data_tarefa) < todayISO) return false;
    return inCarteira(t.empresa);
  });

  const yesterdayOvernight = ativas.filter((t) => {
    if (!t.is_overnight) return false;
    if (t.status_tarefa?.toLowerCase().startsWith("cancel")) return false;
    if (dataSP(t.data_tarefa) !== yISO) return false;
    if ((t.validacao_status ?? "aguardando") === "subido_meu_chapa") return false;
    return inCarteira(t.empresa);
  });

  const allDatesTasks = ativas.filter((t) => {
    if (t.status_tarefa === "Finalizado") return false;
    if (t.status_tarefa?.toLowerCase().startsWith("cancel")) return false;
    return inCarteira(t.empresa);
  });

  return { todaysTasks, yesterdayOvernight, allDatesTasks };
}

// Assinatura barata pra comparar "mudou?" sem comparar objeto a objeto.
// Map/Set viram arrays (JSON.stringify devolveria "{}").
export function assinatura(valor: unknown): string {
  return JSON.stringify(valor, (_chave, v) =>
    v instanceof Map ? { __map: [...v.entries()] } : v instanceof Set ? { __set: [...v.values()] } : v,
  );
}

export type CartoesGuardados<T> = Map<number, { sig: string; card: T }>;

/**
 * Mantém a MESMA referência dos cards que não mudaram desde o último load.
 * Sem isso, todo load que muda UMA chapa gera objetos novos para TODOS os cards e
 * o React (mesmo com TaskCard memoizado) re-renderiza as centenas de uma vez; com
 * isso só o card que mudou de verdade refaz. Igualdade = mesma assinatura (o card
 * inteiro, incluindo chapas e fup_log), então reaproveitar nunca esconde mudança.
 */
export function reaproveitarCartoes<T extends { id_tarefa: number }>(
  anteriores: CartoesGuardados<T>,
  novos: T[],
): { lista: T[]; guardados: CartoesGuardados<T>; sig: string } {
  const guardados: CartoesGuardados<T> = new Map();
  const sigs: string[] = [];
  const lista = novos.map((c) => {
    // card é dado puro (sem Map/Set): JSON.stringify direto é bem mais rápido que a
    // versão com replacer, e roda pra milhares de cards a cada ciclo
    const sig = JSON.stringify(c);
    const ant = anteriores.get(c.id_tarefa);
    const card = ant && ant.sig === sig ? ant.card : c;
    guardados.set(c.id_tarefa, { sig, card });
    sigs.push(sig);
    return card;
  });
  return { lista, guardados, sig: sigs.join("§") };
}

// Só chama o setState se o valor mudou desde a última aplicação (por chave).
// O Dashboard recarrega a cada 30 s e cada setState com array novo re-renderiza
// a tela inteira (os TaskCards não são memoizados) — quando nada mudou, não
// há por que renderizar de novo.
export function aplicarSeMudou<T>(
  cache: Record<string, string>,
  chave: string,
  valor: T,
  setter: (v: T) => void,
  sig: string = assinatura(valor),
): void {
  if (cache[chave] === sig) return;
  cache[chave] = sig;
  setter(valor);
}
