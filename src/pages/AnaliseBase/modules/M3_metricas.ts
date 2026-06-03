import type { TarefaRaw, ChapaMetrics, Turno, TendenciaTipo, TurnoPerfilTipo } from "../types"
import { getTurnoId, getTurnoNome } from "./M2_turnos"

const STATUS_FINALIZADO_SET = new Set([
  "finalizado",
  "concluido",
  "concluído",
  "fup confirmado",
  "chapa a caminho",
  "confirmado",
])

function isAtendido(t: TarefaRaw): boolean {
  const s = t.status_tarefa.toLowerCase()
  const f = t.status_fup.toLowerCase()
  return (
    STATUS_FINALIZADO_SET.has(s) ||
    STATUS_FINALIZADO_SET.has(f) ||
    f.includes("confirmado") ||
    f.includes("caminho")
  )
}

function linearTrend(values: number[]): TendenciaTipo {
  if (values.length < 3) return "estavel"
  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean)
    den += (i - xMean) ** 2
  }
  if (den === 0) return "estavel"
  const slope = num / den
  if (slope > 0.1) return "subindo"
  if (slope < -0.1) return "caindo"
  return "estavel"
}

function medianFrequencia(dates: Date[]): number {
  if (dates.length === 0) return 0
  if (dates.length === 1) return 1 / 7 // 1 task ever

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime())
  const firstMs = sorted[0].getTime()
  const lastMs = sorted[sorted.length - 1].getTime()
  const spanWeeks = (lastMs - firstMs) / (7 * 24 * 3600 * 1000)
  if (spanWeeks < 0.5) return dates.length // all in same week

  // Count tasks per week
  const weekCounts = new Map<number, number>()
  for (const d of sorted) {
    const week = Math.floor((d.getTime() - firstMs) / (7 * 24 * 3600 * 1000))
    weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1)
  }
  const counts = [...weekCounts.values()].sort((a, b) => a - b)
  const mid = Math.floor(counts.length / 2)
  return counts.length % 2 === 0
    ? (counts[mid - 1] + counts[mid]) / 2
    : counts[mid]
}

export function calcularMetricas(
  tarefas: TarefaRaw[],
  turnos: Turno[],
  cpfMap: Map<string, string>,
  hoje: Date,
  janelaDias: number,
): ChapaMetrics[] {
  // Group by normalized name
  const byNome = new Map<string, TarefaRaw[]>()
  for (const t of tarefas) {
    const key = t.nome_chapa_norm
    if (!byNome.has(key)) byNome.set(key, [])
    byNome.get(key)!.push(t)
  }

  const hojeMs = hoje.getTime()
  const janelaCutoff = new Date(hojeMs - janelaDias * 86400_000)
  const janela60Cutoff = new Date(hojeMs - (janelaDias + 60) * 86400_000)

  const metrics: ChapaMetrics[] = []

  for (const [nome_norm, ts] of byNome) {
    const sorted = [...ts].sort((a, b) => a.data_tarefa.getTime() - b.data_tarefa.getTime())
    const primeira_tarefa = sorted[0].data_tarefa
    const ultima_tarefa = sorted[sorted.length - 1].data_tarefa
    const recencia_dias = Math.max(0, Math.round((hojeMs - ultima_tarefa.getTime()) / 86400_000))

    // Within analysis window
    const tsJanela = sorted.filter((t) => t.data_tarefa >= janelaCutoff)
    const total_tarefas = tsJanela.length
    const total_finalizado = tsJanela.filter(isAtendido).length
    const total_cancelado = total_tarefas - total_finalizado

    // Individual fill rate = chapa reliability: how often they complete tasks they appear in.
    // The fill rate CSV has task-level capacity data (total vagas needed/delivered per task),
    // which cannot be used as a per-chapa denominator — it would divide individual task count
    // by team capacity, producing meaningless values. Use simple ratio instead.
    const fill_rate_individual = total_tarefas > 0 ? total_finalizado / total_tarefas : 0

    // Tendência: count finalizado per week in last 60d
    const ts60d = sorted.filter((t) => {
      const ms = t.data_tarefa.getTime()
      return ms >= janela60Cutoff.getTime() && ms <= hojeMs
    })
    const weekBuckets = new Map<number, number>()
    for (const t of ts60d) {
      const w = Math.floor(t.data_tarefa.getTime() / (7 * 86400_000))
      weekBuckets.set(w, (weekBuckets.get(w) ?? 0) + (isAtendido(t) ? 1 : 0))
    }
    const weekValues = [...weekBuckets.values()]
    const tendencia = linearTrend(weekValues)

    // Frequência semanal
    const frequencia_semanal = medianFrequencia(tsJanela.map((t) => t.data_tarefa))

    // Turnos
    const turnoCounts = new Map<string, number>()
    for (const t of tsJanela) {
      const id = getTurnoId(t.hora)
      turnoCounts.set(id, (turnoCounts.get(id) ?? 0) + 1)
    }
    const total_t = tsJanela.length || 1
    const turno_distribuicao = [...turnoCounts.entries()]
      .map(([tid, cnt]) => ({
        turno_id: tid,
        turno_nome: turnos.find((tu) => tu.id === tid)?.nome ?? getTurnoNome(tsJanela[0]?.hora ?? 0),
        pct: cnt / total_t,
      }))
      .sort((a, b) => b.pct - a.pct)

    const turno_principal = turno_distribuicao[0]?.turno_id ?? null
    const turnosCount = turno_distribuicao.filter((td) => td.pct >= 0.1).length
    const turno_perfil: TurnoPerfilTipo =
      turnosCount <= 1 ? "mono" : turnosCount === 2 ? "duo" : "multi"

    // Dias preferidos/evitados
    const diaCounts = new Array(7).fill(0)
    for (const t of tsJanela) diaCounts[t.dia_semana]++
    const maxDia = Math.max(...diaCounts)
    const minDia = Math.min(...diaCounts.filter((c) => c > 0))
    const dias_preferidos = diaCounts
      .map((c, i) => ({ c, i }))
      .filter((d) => d.c === maxDia && maxDia > 0)
      .map((d) => d.i)
    const dias_evitados = diaCounts
      .map((c, i) => ({ c, i }))
      .filter((d) => d.c === minDia && minDia > 0 && d.c < maxDia)
      .map((d) => d.i)

    // Pre-compute 60d window metrics for M4 (previous 60d before the analysis window)
    const ts60dAnterior = sorted.filter((t) => {
      const ms = t.data_tarefa.getTime()
      return ms >= janela60Cutoff.getTime() && ms < janelaCutoff.getTime()
    })
    const total_60d_ant = ts60dAnterior.length
    const fill_60d_ant =
      total_60d_ant > 0 ? ts60dAnterior.filter(isAtendido).length / total_60d_ant : 0
    const recencia_60d = ts60dAnterior.length > 0
      ? Math.round((hojeMs - ts60dAnterior[ts60dAnterior.length - 1].data_tarefa.getTime()) / 86400_000)
      : 9999
    const era_pilar_60d =
      total_60d_ant >= 10 && recencia_60d < 20 && fill_60d_ant >= 0.9
    const era_frequente_60d =
      total_60d_ant >= 4 && recencia_60d < 35 && fill_60d_ant >= 0.8

    const nome = ts[0].nome_chapa
    const telefone = ts[0].telefone_chapa || null
    const cpf = cpfMap.get(nome_norm) ?? null

    metrics.push({
      nome,
      nome_norm,
      telefone,
      cpf,
      tarefas_raw: ts,
      total_tarefas,
      total_finalizado,
      total_cancelado,
      primeira_tarefa,
      ultima_tarefa,
      recencia_dias,
      frequencia_semanal,
      fill_rate_individual,
      tendencia,
      turno_perfil,
      turno_distribuicao,
      turno_principal,
      dias_preferidos,
      dias_evitados,
      era_pilar_60d,
      era_frequente_60d,
      concentracao_pct: 0, // set by M5
    })
  }

  return metrics
}
