import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Moon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { type TaskWithChapas } from "./TaskCard";
import { fmtTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";

type AlertLevel = "critical" | "warning" | "info";

export type AlertItem = {
  id: string;
  level: AlertLevel;
  Icon: typeof AlertTriangle;
  text: string;
  taskId?: number;
  actionLabel?: string;
  onAction?: () => void;
};

function isCompleted(t: TaskWithChapas): boolean {
  return (
    t.validacao_status === "validacao_recebida" ||
    t.validacao_status === "subido_meu_chapa" ||
    t.status_tarefa === "Concluído"
  );
}

function buildAlerts(tasks: TaskWithChapas[]): AlertItem[] {
  const alerts: AlertItem[] = [];

  tasks.filter((t) => t.urgent && !isCompleted(t)).forEach((t) => {
    alerts.push({
      id: `urgent-${t.id_tarefa}`,
      level: "critical",
      Icon: AlertTriangle,
      text: `Urgente · ${t.empresa.toLowerCase()} · iniciou às ${fmtTime(t.data_tarefa)} — confirme presença`,
      taskId: t.id_tarefa,
      actionLabel: "Ver →",
    });
  });

  tasks.filter((t) => t.continuingFromYesterday && !isCompleted(t)).forEach((t) => {
    alerts.push({
      id: `overnight-${t.id_tarefa}`,
      level: "warning",
      Icon: Moon,
      text: `Overnight em andamento · ${t.empresa.toLowerCase()} · desde ${fmtTime(t.data_tarefa)}`,
      taskId: t.id_tarefa,
      actionLabel: "Ver →",
    });
  });

  return alerts;
}

const COLORS: Record<AlertLevel, { wrap: string; dot: string; icon: string; text: string; btn: string }> = {
  critical: {
    wrap: "bg-destructive/8 border-destructive/40",
    dot: "bg-destructive",
    icon: "text-destructive",
    text: "text-destructive",
    btn: "text-destructive hover:bg-destructive/10",
  },
  warning: {
    wrap: "bg-warning/8 border-warning/40",
    dot: "bg-warning",
    icon: "text-warning",
    text: "text-warning",
    btn: "text-warning hover:bg-warning/10",
  },
  info: {
    wrap: "bg-info/8 border-info/40",
    dot: "bg-info",
    icon: "text-info",
    text: "text-foreground",
    btn: "text-info hover:bg-info/10",
  },
};

export function AlertBanner({
  tasks,
  onFlashTask,
  extraAlerts,
}: {
  tasks: TaskWithChapas[];
  onFlashTask: (id: number) => void;
  extraAlerts?: AlertItem[];
}) {
  const taskAlerts = buildAlerts(tasks);
  const alerts = [...taskAlerts, ...(extraAlerts ?? [])];

  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    if (index >= alerts.length && alerts.length > 0) setIndex(0);
  }, [alerts.length, index]);

  useEffect(() => {
    if (alerts.length <= 1) return;
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % alerts.length);
        setFade(true);
      }, 180);
    }, 5000);
    return () => clearInterval(t);
  }, [alerts.length]);

  if (alerts.length === 0) return null;

  const alert = alerts[Math.min(index, alerts.length - 1)];
  const c = COLORS[alert.level];
  const { Icon } = alert;

  function handleAction() {
    if (alert.onAction) {
      alert.onAction();
    } else if (alert.taskId !== undefined) {
      onFlashTask(alert.taskId);
    }
  }

  return (
    <div
      className={`rounded-xl border px-3 py-2 flex items-center gap-3 transition-colors ${c.wrap}`}
      role="alert"
      aria-live="polite"
    >
      <span className={`h-2 w-2 rounded-full shrink-0 animate-pulse ${c.dot}`} />
      <Icon className={`h-4 w-4 shrink-0 ${c.icon}`} />

      <p
        className={`flex-1 text-sm font-medium min-w-0 truncate ${c.text} transition-opacity duration-150 ${fade ? "opacity-100" : "opacity-0"}`}
      >
        {alert.text}
      </p>

      {alerts.length > 1 && (
        <span className="text-[11px] font-semibold text-muted-foreground shrink-0 tabular-nums">
          {index + 1}/{alerts.length}
        </span>
      )}

      {alerts.length > 1 && (
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + alerts.length) % alerts.length)}
            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground transition-colors"
            aria-label="Alerta anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % alerts.length)}
            className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground transition-colors"
            aria-label="Próximo alerta"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {(alert.taskId !== undefined || alert.onAction) && alert.actionLabel && (
        <Button
          size="sm"
          variant="ghost"
          className={`h-7 text-xs shrink-0 ${c.btn}`}
          onClick={handleAction}
        >
          {alert.actionLabel}
        </Button>
      )}
    </div>
  );
}
