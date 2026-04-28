import { Check } from "lucide-react";

export type ValidationStep = "aguardando" | "pendente" | "validacao_recebida" | "subido_meu_chapa";

const order: ValidationStep[] = ["aguardando", "pendente", "validacao_recebida", "subido_meu_chapa"];
const labels: Record<ValidationStep, string> = {
  aguardando: "Confirmação",
  pendente: "Validação pendente",
  validacao_recebida: "Validação recebida",
  subido_meu_chapa: "Subido Meu Chapa",
};

export function ValidationStepper({ status }: { status: ValidationStep }) {
  const currentIdx = order.indexOf(status);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {order.map((step, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        return (
          <div key={step} className="flex items-center gap-1.5">
            <div
              className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold border-2 transition-colors ${
                done
                  ? "bg-success border-success text-success-foreground"
                  : current
                  ? "bg-info border-info text-info-foreground animate-pulse"
                  : "bg-background border-muted-foreground/30 text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span
              className={`text-[11px] font-semibold ${
                done ? "text-success" : current ? "text-info" : "text-muted-foreground"
              }`}
            >
              {labels[step]}
            </span>
            {i < order.length - 1 && (
              <div
                className={`h-px w-4 ${done ? "bg-success" : "bg-muted-foreground/20"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
