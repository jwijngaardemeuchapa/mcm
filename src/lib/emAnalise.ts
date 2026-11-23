import { dataSP, somaDiasISO } from "./datetime";

// Seção "Em análise" do Dashboard: tarefas com status "Em Análise", de hoje em
// diante, da mais próxima pra mais distante (quem vence primeiro pede decisão
// primeiro). Regra pura, sem imports de tela — o Dashboard e o teste usam a mesma.

export const STATUS_EM_ANALISE = "Em Análise";

export type TarefaEmAnalise = {
  id_tarefa: number;
  empresa: string;
  data_tarefa: string;
  status_tarefa?: string | null;
  quantidade_chapas?: number | null;
  criada_em?: string | null;
  chapas?: unknown[];
};

export const estaEmAnalise = (t: { status_tarefa?: string | null }): boolean => t.status_tarefa === STATUS_EM_ANALISE;

/** Tarefas em análise de hoje em diante, ordenadas por data/horário. */
export function selecionarEmAnalise<T extends TarefaEmAnalise>(tarefas: T[], todayISO: string): T[] {
  return tarefas
    .filter((t) => estaEmAnalise(t) && dataSP(t.data_tarefa) >= todayISO)
    .sort((a, b) => new Date(a.data_tarefa).getTime() - new Date(b.data_tarefa).getTime());
}

/**
 * Em análise e SEM ninguém alocado: não há nada pra operar no card (FUP, confirmação), então sai das listas
 * principais e fica só na seção "Em análise". Com chapa alocado continua nas listas (e também na seção).
 */
export const soNaSecaoEmAnalise = (t: TarefaEmAnalise): boolean => estaEmAnalise(t) && (t.chapas?.length ?? 0) === 0;

/** "Hoje", "Amanhã" ou "ter 25/11" — o dia da tarefa, no fuso de Brasília. */
export function rotuloDoDia(dataTarefa: string, todayISO: string, nomeDoDia: (iso: string) => string): string {
  const dia = dataSP(dataTarefa);
  if (dia === todayISO) return "Hoje";
  if (dia === somaDiasISO(todayISO, 1)) return "Amanhã";
  return nomeDoDia(dia);
}

/** "agora", "há 25 min", "há 3 h", "ontem", "há 4 dias" — quando a tarefa foi criada. null se não há data válida. */
export function criadaHa(criadaEm: string | null | undefined, agoraMs: number): string | null {
  if (!criadaEm) return null;
  const ms = new Date(criadaEm).getTime();
  if (!Number.isFinite(ms)) return null;
  const min = Math.floor((agoraMs - ms) / 60000);
  if (min < 0) return "agora";
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}
