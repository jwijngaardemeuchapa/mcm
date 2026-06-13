import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";
import { fmtSP } from "@/lib/datetime";
import type { AutoFupPending } from "@/lib/useScheduledFup";

type Props = {
  pending: AutoFupPending;
  onConfirm: () => void;
  onSkip: () => void;
};

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function AutoFupConfirmDialog({ pending, onConfirm, onSkip }: Props) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, pending.dispatchAt.getTime() - Date.now()),
  );

  useEffect(() => {
    setRemaining(Math.max(0, pending.dispatchAt.getTime() - Date.now()));
    const t = setInterval(() => {
      const r = Math.max(0, pending.dispatchAt.getTime() - Date.now());
      setRemaining(r);
      if (r === 0) {
        clearInterval(t);
        onSkip();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [pending.dispatchAt, onSkip]);

  const hora = fmtSP(pending.data_tarefa, "HH:mm");
  const data = fmtSP(pending.data_tarefa, "dd/MM");
  const dispatchHora = fmtSP(pending.dispatchAt.toISOString(), "HH:mm");
  const urgent = remaining < 120_000;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onSkip(); }}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className={`h-4 w-4 ${urgent ? "text-destructive animate-pulse" : "text-warning"}`} />
            FUP automático agendado
          </DialogTitle>
        </DialogHeader>

        <div className="py-1 space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Tarefa</p>
            <p className="text-sm font-semibold text-foreground capitalize">{pending.empresa.toLowerCase()}</p>
            <p className="text-xs text-muted-foreground">
              às {hora} · {data} · FUP previsto para {dispatchHora}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Janela de confirmação expira em</p>
            <span className={`font-mono text-sm font-bold tabular-nums ${urgent ? "text-destructive" : "text-foreground"}`}>
              {fmtCountdown(remaining)}
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Os chapas que receberão o FUP serão avaliados no momento do disparo — confirmados e removidos são excluídos automaticamente.
          </p>
        </div>

        <DialogFooter className="flex gap-2 sm:flex-row">
          <Button variant="outline" size="sm" onClick={onSkip} className="flex-1 gap-1.5">
            <X className="h-3.5 w-3.5" />
            Cancelar
          </Button>
          <Button size="sm" onClick={onConfirm} className="flex-1 gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Confirmar disparo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
