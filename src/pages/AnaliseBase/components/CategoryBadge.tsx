import type { Categoria } from "../types"
import { CATEGORIA_COLOR, CATEGORIA_LABEL } from "../modules/M4_classificacao"

type Props = { categoria: Categoria; score?: number; size?: "sm" | "md" | "lg" }

export function CategoryBadge({ categoria, score, size = "md" }: Props) {
  const cls = CATEGORIA_COLOR[categoria]
  const label = CATEGORIA_LABEL[categoria]

  if (size === "lg") {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-sm ${cls}`}>
        {label}
        {score !== undefined && (
          <span className="font-mono text-xs opacity-70">{score}</span>
        )}
      </span>
    )
  }

  if (size === "sm") {
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border font-semibold text-[10px] ${cls}`}>
        {label}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold text-xs ${cls}`}>
      {label}
      {score !== undefined && (
        <span className="font-mono opacity-70">{score}</span>
      )}
    </span>
  )
}
