import type { TarefaRaw, Turno } from "../types"
import { getTurnoId } from "../modules/M2_turnos"

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

type Props = {
  tarefas: TarefaRaw[]
  turnos: Turno[]
}

export function HeatmapTurnos({ tarefas, turnos }: Props) {
  if (turnos.length === 0) return null

  const activeTurnos = turnos.filter((t) => t.id !== "outros")

  // Count per turno × dia
  const counts = new Map<string, number>()
  for (const t of tarefas) {
    const key = `${getTurnoId(t.hora)}_${t.dia_semana}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const maxCount = Math.max(0, ...counts.values())

  function intensity(count: number): string {
    if (count === 0) return "bg-muted/30"
    const pct = count / maxCount
    if (pct >= 0.75) return "bg-primary/80 text-primary-foreground"
    if (pct >= 0.5) return "bg-primary/50"
    if (pct >= 0.25) return "bg-primary/30"
    return "bg-primary/15"
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            <th className="text-left text-[10px] text-muted-foreground font-medium pr-3 pb-1 w-24">Turno</th>
            {DIAS.map((d) => (
              <th key={d} className="text-center text-[10px] text-muted-foreground font-medium pb-1 w-10">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeTurnos.map((turno) => (
            <tr key={turno.id}>
              <td className="text-[11px] text-muted-foreground pr-3 py-1 whitespace-nowrap">
                {turno.nome}
              </td>
              {[0, 1, 2, 3, 4, 5, 6].map((dia) => {
                const count = counts.get(`${turno.id}_${dia}`) ?? 0
                return (
                  <td key={dia} className="py-0.5 px-0.5">
                    <div
                      className={`h-7 w-9 rounded flex items-center justify-center text-[10px] font-mono font-semibold transition-colors ${intensity(count)}`}
                      title={`${turno.nome} ${DIAS[dia]}: ${count} tarefas`}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
