import { useEffect, useState } from "react";

// Listras diagonais só na faixa CRÍTICA: a barra vermelha não depende de enxergar a cor pra ser distinguida
// da laranja e da verde (WCAG 1.4.1 — cor + padrão + texto no tooltip).
const LISTRAS_CRITICO = "[background-image:repeating-linear-gradient(135deg,rgba(0,0,0,0.3)_0_3px,transparent_3px_7px)]";

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
  const situacao = tone === "success" ? "dentro da meta" : tone === "warning" ? "atenção" : "crítico";
  const descricao = `Fill rate ${pct}% (${confirmed} de ${requested}) — ${situacao}`;

  // Animate from 0 to pct on mount / when pct changes
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  const estiloBarra = { width: `${w}%` };
  const classeBarra = `h-full ${barColor} ${tone === "destructive" ? LISTRAS_CRITICO : ""} transition-[width] duration-[400ms] ease-out`;

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2 min-w-[120px]" title={descricao}>
        <div className={`flex-1 ${heightClass} rounded-full bg-muted overflow-hidden`} role="img" aria-label={descricao}>
          <div
            className={classeBarra}
            style={estiloBarra}
          />
        </div>
        <span className={`text-xs font-semibold tabular-nums ${textColor} whitespace-nowrap`}>
          {confirmed}/{requested}
        </span>
      </div>
    );
  }

  const missing = requested - confirmed;
  const goalGradient = missing === 1 && confirmed > 0;

  return (
    <div className="flex items-center gap-3 min-w-[180px]" title={descricao}>
      <div className={`flex-1 ${heightClass} rounded-full bg-muted overflow-hidden`} role="img" aria-label={descricao}>
        <div
          className={classeBarra}
          style={estiloBarra}
        />
      </div>
      {goalGradient ? (
        <span className="text-xs font-bold text-warning whitespace-nowrap animate-pulse">
          Falta 1!
        </span>
      ) : (
        <span className={`text-xs font-semibold tabular-nums ${textColor} whitespace-nowrap`}>
          {confirmed}/{requested} · {pct}%
        </span>
      )}
    </div>
  );
}
