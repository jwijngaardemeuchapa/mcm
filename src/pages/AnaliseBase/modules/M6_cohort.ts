import type { ChapaClassificado, CohortData, CohortEntry } from "../types"

function toYYYYMM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

export function calcularCohort(chapas: ChapaClassificado[]): CohortData {
  if (chapas.length === 0) {
    return {
      cohorts: [],
      churn_mensal: 0,
      churn_trimestral: 0,
      tempo_medio_vida_dias: 0,
      mediana_tarefas_para_casual: 0,
      mediana_tarefas_para_frequente: 0,
    }
  }

  // Group chapas by month of first task
  const byMes = new Map<string, ChapaClassificado[]>()
  for (const c of chapas) {
    const mes = toYYYYMM(c.primeira_tarefa)
    if (!byMes.has(mes)) byMes.set(mes, [])
    byMes.get(mes)!.push(c)
  }

  const meses = [...byMes.keys()].sort()
  const cohorts: CohortEntry[] = []

  for (const mes of meses) {
    const grupo = byMes.get(mes)!
    const mesDate = new Date(`${mes}-01`)
    const m1 = toYYYYMM(addMonths(mesDate, 1))
    const m2 = toYYYYMM(addMonths(mesDate, 2))
    const m3 = toYYYYMM(addMonths(mesDate, 3))

    // Retained: had at least one task in that subsequent month
    const retidosM1 = grupo.filter((c) =>
      c.tarefas_raw.some((t) => toYYYYMM(t.data_tarefa) === m1),
    ).length
    const retidosM2 = grupo.filter((c) =>
      c.tarefas_raw.some((t) => toYYYYMM(t.data_tarefa) === m2),
    ).length
    const retidosM3 = grupo.filter((c) =>
      c.tarefas_raw.some((t) => toYYYYMM(t.data_tarefa) === m3),
    ).length

    cohorts.push({
      mes,
      novos: grupo.length,
      retidos_m1: retidosM1,
      retidos_m2: retidosM2,
      retidos_m3: retidosM3,
    })
  }

  // Monthly churn: average (1 - retention_m1)
  const retencoes = cohorts
    .filter((c) => c.novos > 0)
    .map((c) => c.retidos_m1 / c.novos)
  const mediaRetencao = retencoes.length > 0
    ? retencoes.reduce((a, b) => a + b, 0) / retencoes.length
    : 0
  const churn_mensal = 1 - mediaRetencao

  // Trimestral: average (1 - retention_m3)
  const retencoesM3 = cohorts
    .filter((c) => c.novos > 0 && c.retidos_m3 > 0)
    .map((c) => c.retidos_m3 / c.novos)
  const mediaRetencaoM3 = retencoesM3.length > 0
    ? retencoesM3.reduce((a, b) => a + b, 0) / retencoesM3.length
    : 0
  const churn_trimestral = 1 - mediaRetencaoM3

  // Tempo médio de vida
  const vidas = chapas
    .filter((c) => c.total_tarefas > 1)
    .map((c) => Math.round((c.ultima_tarefa.getTime() - c.primeira_tarefa.getTime()) / 86400_000))
  const tempo_medio_vida_dias = vidas.length > 0
    ? Math.round(vidas.reduce((a, b) => a + b, 0) / vidas.length)
    : 0

  // Curva de aprendizado: how many tasks until casual/frequente
  const tarefasParaCasual = chapas
    .filter((c) => c.categoria === "casual" || c.categoria === "frequente" || c.categoria === "pilar")
    .map((c) => Math.min(c.total_tarefas, 10))
  const tarefasParaFrequente = chapas
    .filter((c) => c.categoria === "frequente" || c.categoria === "pilar")
    .map((c) => c.total_tarefas)

  return {
    cohorts,
    churn_mensal,
    churn_trimestral,
    tempo_medio_vida_dias,
    mediana_tarefas_para_casual: median(tarefasParaCasual),
    mediana_tarefas_para_frequente: median(tarefasParaFrequente),
  }
}
