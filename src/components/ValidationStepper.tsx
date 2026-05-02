import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type ValidationStep = "aguardando" | "pendente" | "validacao_recebida" | "subido_meu_chapa";

const order: ValidationStep[] = ["aguardando", "pendente", "validacao_recebida", "subido_meu_chapa"];
const labels: Record<ValidationStep, string> = {
  aguardando: "Confirmação",
  pendente: "Validação pendente",
  validacao_recebida: "Validação recebida",
  subido_meu_chapa: "Subido Meu Chapa",
};

/** Color tone applied to the pill based on the current step. */
function toneFor(step: ValidationStep): { bg: string; text: string; dot: string } {
  switch (step) {
    case "aguardando":
      return {
        bg: "bg-info/10 border-info/40 hover:bg-info/15",
        text: "text-info",
        dot: "bg-info",
      };
    case "pendente":
      return {
        bg: "bg-warning/15 border-warning/50 hover:bg-warning/25",
        text: "text-warning",
        dot: "bg-warning",
      };
    case "validacao_recebida":
      return {
        bg: "bg-info/10 border-info/40 hover:bg-info/15",
        text: "text-info",
        dot: "bg-info",
      };
    case "subido_meu_chapa":
      return {
        bg: "bg-success/15 border-success/40 hover:bg-success/25",
        text: "text-success",
        dot: "bg-success",
      };
  }
}

/**
 * Compact stepper pill: shows current step + step counter ("Etapa N de 4").
 * Click to expand the inline 4-step view; click again to collapse.
 */
export function ValidationStepper({ status }: { status: ValidationStep }) {
  const [open, setOpen] = useState(false);
  const currentIdx = Math.max(0, order.indexOf(status));
  const completed = currentIdx; // steps before current are done
  const tone = toneFor(status);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors min-h-[28px] ${tone.bg} ${tone.text}`}
        title="Ver todas as etapas"
        aria-expanded="false"
        aria-label={`Etapa ${currentIdx + 1} de 4 — ${labels[status]}`}
      >
        <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
        <span>
          Etapa {currentIdx + 1} de 4 — {labels[status]}
        </span>
        {completed > 0 && (
          <span className="opacity-70 font-normal">· {completed} concluída{completed > 1 ? "s" : ""}</span>
        )}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className="inline-flex items-center gap-1.5 flex-wrap px-2 py-1 rounded-md border border-border bg-card hover:bg-muted/40 transition-colors"
      title="Ocultar etapas"
      aria-expanded="true"
    >
      {order.map((step, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        return (
          <span key={step} className="flex items-center gap-1.5">
            <span
              className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold border-2 ${
                done
                  ? "bg-success border-success text-success-foreground"
                  : current
                  ? `${tone.dot} border-transparent text-white`
                  : "bg-background border-muted-foreground/30 text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span
              className={`text-[11px] font-semibold ${
                done ? "text-success" : current ? tone.text : "text-muted-foreground"
              }`}
            >
              {labels[step]}
            </span>
            {i < order.length - 1 && (
              <span className={`h-px w-3 ${done ? "bg-success" : "bg-muted-foreground/20"}`} />
            )}
          </span>
        );
      })}
    </button>
  );
}
