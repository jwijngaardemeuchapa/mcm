import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import type { TarefaRaw } from "../types"

type Props = { tarefas: TarefaRaw[]; threshold?: number }

function toYYYYMM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

const STATUS_OK = new Set(["finalizado", "concluido", "concluído", "fup confirmado", "chapa a caminho", "confirmado"])

export function SparklineFillRate({ tarefas, threshold = 85 }: Props) {
  // Aggregate fill rate per month
  const byMes = new Map<string, { fin: number; tot: number }>()
  const tarefasUnicas = [...new Map(tarefas.map((t) => [t.id_tarefa, t])).values()]

  for (const t of tarefasUnicas) {
    const mes = toYYYYMM(t.data_tarefa)
    if (!byMes.has(mes)) byMes.set(mes, { fin: 0, tot: 0 })
    const entry = byMes.get(mes)!
    entry.tot += t.quantidade_chapas || 1
    // Count confirmed as finalized from the task
    const confirmed = tarefas.filter(
      (r) => r.id_tarefa === t.id_tarefa && (STATUS_OK.has(r.status_fup) || STATUS_OK.has(r.status_tarefa)),
    ).length
    entry.fin += confirmed
  }

  const data = [...byMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, { fin, tot }]) => ({
      mes: mes.slice(5), // MM
      fill: tot > 0 ? Math.round((fin / tot) * 100) : 0,
    }))

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Tooltip
          formatter={(v: number) => [`${v}%`, "Fill Rate"]}
          contentStyle={{ fontSize: 11 }}
        />
        <ReferenceLine y={threshold} stroke="var(--warning)" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="fill"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
