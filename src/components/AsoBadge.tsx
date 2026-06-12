import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { asoInfo } from "@/lib/aso";

// Badge de ASO com leitura de vencimento (15/7/1 dias). Quando a data não é
// reconhecida, mantém o comportamento antigo: badge verde "tem ASO".
export function AsoBadge({ aso }: { aso: string | null | undefined }) {
  if (!aso) return null;
  const info = asoInfo(aso);

  if (!info || info.level === "ok") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-[9px] font-bold text-success px-1 py-0.5 rounded bg-success/10 border border-success/20 cursor-help shrink-0">ASO</span>
        </TooltipTrigger>
        <TooltipContent>
          {info ? `ASO válido até ${info.dateLabel} (${info.days} dias)` : `ASO válido: ${aso}`}
        </TooltipContent>
      </Tooltip>
    );
  }

  const cls =
    info.level === "warn15"
      ? "text-warning bg-warning/10 border-warning/30"
      : "text-destructive bg-destructive/10 border-destructive/30";

  const label =
    info.level === "expired" ? "ASO venc." : `ASO ${info.days}d`;

  const tip =
    info.level === "expired"
      ? `ASO vencido há ${Math.abs(info.days)} dia(s) — em ${info.dateLabel}`
      : `ASO vence em ${info.days} dia(s) — ${info.dateLabel}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`text-[9px] font-bold px-1 py-0.5 rounded border cursor-help shrink-0 ${cls}`}>{label}</span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
