type Severity = "ok" | "warning" | "danger" | "neutral"

type Props = {
  label: string
  value: string | number
  caption?: string
  severity?: Severity
  unit?: string
}

const BORDER: Record<Severity, string> = {
  ok: "border-t-success",
  warning: "border-t-warning",
  danger: "border-t-destructive",
  neutral: "border-t-border",
}

const VALUE_COLOR: Record<Severity, string> = {
  ok: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  neutral: "text-foreground",
}

export function KpiCard({ label, value, caption, severity = "neutral", unit }: Props) {
  return (
    <div className={`bg-card border border-border border-t-4 ${BORDER[severity]} rounded-xl p-4 flex flex-col gap-1`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-3xl font-display font-bold tabular-nums ${VALUE_COLOR[severity]}`}>
        {value}
        {unit && <span className="text-base font-normal ml-1 text-muted-foreground">{unit}</span>}
      </p>
      {caption && <p className="text-xs text-muted-foreground leading-snug">{caption}</p>}
    </div>
  )
}
