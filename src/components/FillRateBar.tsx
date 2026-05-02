import { useEffect, useState } from "react";

type Props = {
  confirmed: number;
  requested: number;
  /** "compact" omits the fraction text and is meant for inline use. */
  variant?: "default" | "compact";
  /** Tailwind class controlling the bar height. Defaults to h-2 (8px). */
  heightClass?: string;
};

export function FillRateBar({
  confirmed,
  requested,
  variant = "default",
  heightClass = "h-2",
}: Props) {
  const pct = requested > 0 ? Math.min(100, Math.round((confirmed / requested) * 100)) : 0;
  const tone = pct >= 80 ? "success" : pct >= 50 ? "warning" : "destructive";
  const barColor =
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-destructive";
  const textColor =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-destructive";

  // Animate from 0 to pct on mount / when pct changes
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className={`flex-1 ${heightClass} rounded-full bg-muted overflow-hidden`}>
          <div
            className={`h-full ${barColor} transition-[width] duration-[400ms] ease-out`}
            style={{ width: `${w}%` }}
          />
        </div>
        <span className={`text-xs font-semibold tabular-nums ${textColor} whitespace-nowrap`}>
          {confirmed}/{requested}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <div className={`flex-1 ${heightClass} rounded-full bg-muted overflow-hidden`}>
        <div
          className={`h-full ${barColor} transition-[width] duration-[400ms] ease-out`}
          style={{ width: `${w}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${textColor} whitespace-nowrap`}>
        {confirmed}/{requested} · {pct}%
      </span>
    </div>
  );
}
