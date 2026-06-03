import type { TarefaRaw, Turno } from "../types"

type BucketDef = { id: string; nome: string; inicio: number; fim: number }

const BUCKETS: BucketDef[] = [
  { id: "madrugada", nome: "Madrugada", inicio: 0, fim: 5 },
  { id: "matinal", nome: "Matinal", inicio: 5, fim: 10 },
  { id: "diurno", nome: "Diurno", inicio: 10, fim: 15 },
  { id: "vespertino", nome: "Vespertino", inicio: 15, fim: 20 },
  { id: "noturno", nome: "Noturno", inicio: 20, fim: 24 },
]

function getBucket(hora: number): BucketDef {
  return (
    BUCKETS.find((b) => hora >= b.inicio && hora < b.fim) ??
    BUCKETS[BUCKETS.length - 1]
  )
}

export function detectarTurnos(tarefas: TarefaRaw[], minPct = 0.05): Turno[] {
  if (tarefas.length === 0) return []

  // Deduplicate by id_tarefa (each task counts once even if it has many chapas)
  const tarefasUnicas = [...new Map(tarefas.map((t) => [t.id_tarefa, t])).values()]
  const total = tarefasUnicas.length

  const counts = new Map<string, number>()
  for (const t of tarefasUnicas) {
    const b = getBucket(t.hora)
    counts.set(b.id, (counts.get(b.id) ?? 0) + 1)
  }

  const turnos: Turno[] = []
  let outrosCount = 0

  for (const b of BUCKETS) {
    const count = counts.get(b.id) ?? 0
    const pct = count / total
    if (pct >= minPct) {
      turnos.push({
        id: b.id,
        nome: b.nome,
        hora_inicio: b.inicio,
        hora_fim: b.fim,
        percentual: pct,
        total_tarefas: count,
      })
    } else if (count > 0) {
      outrosCount += count
    }
  }

  if (outrosCount > 0) {
    turnos.push({
      id: "outros",
      nome: "Outros",
      hora_inicio: -1,
      hora_fim: -1,
      percentual: outrosCount / total,
      total_tarefas: outrosCount,
    })
  }

  return turnos.sort((a, b) => b.total_tarefas - a.total_tarefas)
}

export function getTurnoId(hora: number): string {
  return getBucket(hora).id
}

export function getTurnoNome(hora: number): string {
  return getBucket(hora).nome
}
