export type TarefaRaw = {
  id_tarefa: string
  data_tarefa: Date
  hora: number
  dia_semana: number // 0 = domingo
  cidade_uf: string
  empresa: string
  status_tarefa: string
  nome_chapa: string
  nome_chapa_norm: string
  telefone_chapa: string
  quantidade_chapas: number
  status_fup: string
}

export type PoolChapa = {
  nome_completo: string
  cpf: string
  telefone: string
}

export type Turno = {
  id: string
  nome: string // matinal / diurno / vespertino / noturno / madrugada / outros
  hora_inicio: number
  hora_fim: number
  percentual: number
  total_tarefas: number
}

export type Categoria =
  | "pilar"
  | "frequente"
  | "casual"
  | "em_risco"
  | "dormente"
  | "fantasma"
  | "novo"

export type TendenciaTipo = "subindo" | "estavel" | "caindo"
export type TurnoPerfilTipo = "mono" | "duo" | "multi"
export type FlagTipo = "tem_interesse" | "sem_interesse" | "aguardando" | "em_processo"

export type LeoMetrics = {
  numero: string
  total_ofertas: number
  total_sim: number
  pct_sim: number
  passa_75pct: boolean
  repete: boolean
}

export type ChapaMetrics = {
  nome: string
  nome_norm: string
  telefone: string | null
  cpf: string | null

  tarefas_raw: TarefaRaw[]
  total_tarefas: number
  total_finalizado: number
  total_cancelado: number
  primeira_tarefa: Date
  ultima_tarefa: Date
  recencia_dias: number
  frequencia_semanal: number
  fill_rate_individual: number
  tendencia: TendenciaTipo

  turno_perfil: TurnoPerfilTipo
  turno_distribuicao: { turno_id: string; turno_nome: string; pct: number }[]
  turno_principal: string | null

  dias_preferidos: number[]
  dias_evitados: number[]

  era_pilar_60d: boolean
  era_frequente_60d: boolean

  concentracao_pct: number
}

export type ConfigLimiares = {
  pilar_min_tarefas: number
  pilar_max_recencia: number
  pilar_min_fill: number
  frequente_min_tarefas: number
  frequente_max_tarefas: number
  frequente_max_recencia: number
  frequente_min_fill: number
  casual_min_tarefas: number
  casual_max_tarefas: number
  casual_max_recencia: number
  risco_min_recencia: number
  risco_max_recencia: number
  dormente_min_recencia: number
  dormente_max_recencia: number
  dormente_min_historico: number
  fantasma_min_recencia: number
  novo_max_dias: number
  meta_semanal: number
}

export const DEFAULT_LIMIARES: ConfigLimiares = {
  pilar_min_tarefas: 15,
  pilar_max_recencia: 14,
  pilar_min_fill: 0.95,
  frequente_min_tarefas: 5,
  frequente_max_tarefas: 14,
  frequente_max_recencia: 30,
  frequente_min_fill: 0.85,
  casual_min_tarefas: 2,
  casual_max_tarefas: 4,
  casual_max_recencia: 60,
  risco_min_recencia: 15,
  risco_max_recencia: 30,
  dormente_min_recencia: 30,
  dormente_max_recencia: 89,
  dormente_min_historico: 3,
  fantasma_min_recencia: 90,
  novo_max_dias: 30,
  meta_semanal: 6,
}

export type ConfigAnalise = {
  janela_dias: number
  limiares: ConfigLimiares
}

export const DEFAULT_CONFIG: ConfigAnalise = {
  janela_dias: 90,
  limiares: DEFAULT_LIMIARES,
}

export type ChapaClassificado = ChapaMetrics & {
  categoria: Categoria
  score: number
}

export type SpofEntry = {
  turno_nome: string
  chapa_nome: string
  pct_turno: number
}

export type ConcentracaoData = {
  top5_pct: number
  top10_pct: number
  top20_pct: number
  spof_turnos: SpofEntry[]
  ranking: { nome: string; pct_total: number; pct_turno_principal: number }[]
}

export type CohortEntry = {
  mes: string // YYYY-MM
  novos: number
  retidos_m1: number
  retidos_m2: number
  retidos_m3: number
}

export type CohortData = {
  cohorts: CohortEntry[]
  churn_mensal: number
  churn_trimestral: number
  tempo_medio_vida_dias: number
  mediana_tarefas_para_casual: number
  mediana_tarefas_para_frequente: number
}

export type ListaTipo =
  | "pilares_conversa"
  | "em_risco_ligar"
  | "mono_orfaos"
  | "dormentes_recuperaveis"
  | "fantasmas_limpeza"
  | "novos_padrinho"
  | "candidatos_bonificacao"

export type ListaItem = ChapaClassificado & {
  criterio: string
  pilar_sugerido?: string
}

export type ListaAcionavel = {
  tipo: ListaTipo
  titulo: string
  descricao: string
  chapas: ListaItem[]
}

export type Snapshot = {
  id: string
  cliente: string
  periodo_inicio: string
  periodo_fim: string
  total_tarefas: number
  total_chapas: number
  configuracoes: string | null
  created_at: string
}

export type AnaliseResultado = {
  snapshot_id: string
  cliente: string
  periodo_inicio: Date
  periodo_fim: Date
  total_tarefas_unicas: number
  total_chapas: number
  turnos: Turno[]
  chapas: ChapaClassificado[]
  concentracao: ConcentracaoData
  cohort: CohortData
  listas: ListaAcionavel[]
  config: ConfigAnalise
  fill_rate_operacional?: number | null  // from fill rate CSV: total atendidos / total solicitados
}

export type ImportPreview = {
  empresas: string[]
  periodo_inicio: Date
  periodo_fim: Date
  total_linhas: number
  total_chapas_unicos: number
  colunas_detectadas: {
    id_tarefa: string | null
    data_tarefa: string | null
    empresa: string | null
    status_tarefa: string | null
    nome_chapa: string | null
    telefone_chapa: string | null
    quantidade_chapas: string | null
    status_fup: string | null
  }
  erros: string[]
}
