import type {
  ChapaMetrics,
  ChapaClassificado,
  Categoria,
  ConfigLimiares,
} from "../types"

function score(m: ChapaMetrics, meta_semanal: number): number {
  const fillWeight = m.fill_rate_individual
  const freqWeight = Math.min(1, m.frequencia_semanal / meta_semanal)
  const recWeight = Math.max(0, 1 - m.recencia_dias / 90)
  const base = fillWeight * freqWeight * recWeight * 100

  // BID acceptance bonus: up to +15 for aprovados, -5 for chronic non-responders
  let leoBonus = 0
  if (m.leo) {
    if (m.leo.passa_75pct) leoBonus = Math.round(m.leo.pct_sim * 15)
    else if (m.leo.total_ofertas >= 3 && m.leo.pct_sim < 0.25) leoBonus = -5
  }

  return Math.max(0, Math.min(100, Math.round(base + leoBonus)))
}

function classify(m: ChapaMetrics, l: ConfigLimiares, hoje: Date): Categoria {
  const diasPrimeiroTarefa = Math.round(
    (hoje.getTime() - m.primeira_tarefa.getTime()) / 86400_000,
  )

  // Novo: first task < N days ago
  if (diasPrimeiroTarefa <= l.novo_max_dias) return "novo"

  // Pilar
  if (
    m.total_tarefas >= l.pilar_min_tarefas &&
    m.recencia_dias < l.pilar_max_recencia &&
    m.fill_rate_individual >= l.pilar_min_fill
  )
    return "pilar"

  // Frequente
  if (
    m.total_tarefas >= l.frequente_min_tarefas &&
    m.total_tarefas <= l.frequente_max_tarefas &&
    m.recencia_dias < l.frequente_max_recencia &&
    m.fill_rate_individual >= l.frequente_min_fill
  )
    return "frequente"

  // Casual
  if (
    m.total_tarefas >= l.casual_min_tarefas &&
    m.total_tarefas <= l.casual_max_tarefas &&
    m.recencia_dias < l.casual_max_recencia
  )
    return "casual"

  // Em Risco: was pilar/frequente in prev 60d window, now drifting
  if (
    (m.era_pilar_60d || m.era_frequente_60d) &&
    m.recencia_dias >= l.risco_min_recencia &&
    m.recencia_dias <= l.risco_max_recencia
  )
    return "em_risco"

  // Dormente
  if (
    m.recencia_dias >= l.dormente_min_recencia &&
    m.recencia_dias <= l.dormente_max_recencia &&
    m.total_tarefas >= l.dormente_min_historico
  )
    return "dormente"

  // Fantasma: inactive ≥ 90d or never really worked
  return "fantasma"
}

export function classificar(
  metricas: ChapaMetrics[],
  limiares: ConfigLimiares,
  hoje: Date,
): ChapaClassificado[] {
  return metricas.map((m) => ({
    ...m,
    categoria: classify(m, limiares, hoje),
    score: score(m, limiares.meta_semanal),
  }))
}

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  pilar: "Pilar",
  frequente: "Frequente",
  casual: "Casual",
  em_risco: "Em Risco",
  dormente: "Dormente",
  fantasma: "Fantasma",
  novo: "Novo",
}

export const CATEGORIA_COLOR: Record<Categoria, string> = {
  pilar: "bg-success/15 text-success border-success/30",
  frequente: "bg-info/15 text-info border-info/30",
  casual: "bg-muted/60 text-muted-foreground border-border",
  em_risco: "bg-warning/15 text-warning border-warning/30",
  dormente: "bg-orange-500/15 text-orange-600 border-orange-400/30",
  fantasma: "bg-muted/30 text-muted-foreground/60 border-border",
  novo: "bg-primary/15 text-primary border-primary/30",
}
