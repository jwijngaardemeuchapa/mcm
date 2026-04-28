type Props = { confirmed: number; requested: number };

export function FillRateBar({ confirmed, requested }: Props) {
  const pct = requested > 0 ? Math.min(100, Math.round((confirmed / requested) * 100)) : 0;
  const color =
    pct >= 100 ? "bg-success" : pct >= 50 ? "bg-gradient-fill" : "bg-warning";
  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-foreground whitespace-nowrap">
        {confirmed}/{requested} <span className="text-muted-foreground">({pct}%)</span>
      </span>
    </div>
  );
}
