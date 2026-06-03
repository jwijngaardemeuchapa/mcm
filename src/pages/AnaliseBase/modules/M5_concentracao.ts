import type { ChapaClassificado, ConcentracaoData } from "../types"

export function calcularConcentracao(chapas: ChapaClassificado[]): {
  chapas: ChapaClassificado[]
  concentracao: ConcentracaoData
} {
  const totalFinalizado = chapas.reduce((s, c) => s + c.total_finalizado, 0)
  if (totalFinalizado === 0) {
    return {
      chapas,
      concentracao: {
        top5_pct: 0,
        top10_pct: 0,
        top20_pct: 0,
        spof_turnos: [],
        ranking: [],
      },
    }
  }

  const sorted = [...chapas].sort((a, b) => b.total_finalizado - a.total_finalizado)

  const withPct = sorted.map((c) => ({
    ...c,
    concentracao_pct: totalFinalizado > 0 ? c.total_finalizado / totalFinalizado : 0,
  }))

  const top5_pct = withPct.slice(0, 5).reduce((s, c) => s + c.concentracao_pct, 0)
  const top10_pct = withPct.slice(0, 10).reduce((s, c) => s + c.concentracao_pct, 0)
  const top20_pct = withPct.slice(0, 20).reduce((s, c) => s + c.concentracao_pct, 0)

  // SPOF por turno: chapas representing > 25% of their shift's capacity
  const turnoTotais = new Map<string, number>()
  for (const c of chapas) {
    if (c.turno_principal) {
      turnoTotais.set(
        c.turno_principal,
        (turnoTotais.get(c.turno_principal) ?? 0) + c.total_finalizado,
      )
    }
  }

  const spof_turnos = withPct
    .filter((c) => {
      if (!c.turno_principal) return false
      const turnoTotal = turnoTotais.get(c.turno_principal) ?? 0
      if (turnoTotal === 0) return false
      return c.total_finalizado / turnoTotal > 0.25
    })
    .map((c) => {
      const turnoTotal = turnoTotais.get(c.turno_principal!) ?? 1
      return {
        turno_nome: c.turno_distribuicao.find((td) => td.turno_id === c.turno_principal)?.turno_nome ?? c.turno_principal!,
        chapa_nome: c.nome,
        pct_turno: c.total_finalizado / turnoTotal,
      }
    })

  const ranking = withPct.slice(0, 30).map((c) => ({
    nome: c.nome,
    pct_total: c.concentracao_pct,
    pct_turno_principal: c.turno_principal
      ? c.total_finalizado / (turnoTotais.get(c.turno_principal) ?? 1)
      : 0,
  }))

  // Merge concentracao_pct back into original array order
  const pctMap = new Map(withPct.map((c) => [c.nome_norm, c.concentracao_pct]))
  const chapasComPct = chapas.map((c) => ({
    ...c,
    concentracao_pct: pctMap.get(c.nome_norm) ?? 0,
  }))

  return {
    chapas: chapasComPct,
    concentracao: { top5_pct, top10_pct, top20_pct, spof_turnos, ranking },
  }
}
