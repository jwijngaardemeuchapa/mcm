import { useMemo, useState } from "react";
import { Zap, ChevronDown, ChevronUp, Clock, AlertTriangle, Eye, Bell } from "lucide-react";
import { type TaskWithChapas } from "./TaskCard";
import { fmtTime, parseTaskDate } from "@/lib/datetime";
import { Button } from "@/components/ui/button";

export type LembreteAlertItem = {
  id: string;
  taskId: number;
  empresa: string;
  horario: string;
  message: string;
  minutesUntil: number;
};

type Level = "emergente" | "urgente" | "monitorar";

type PriorityItem = {
  task: TaskWithChapas;
  level: Level;
  minutesUntil: number;
  confirmed: number;
  requested: number;
  fill: number;
  vacant: number;
  reason: string;
  score: number;
};

const LEVEL_META: Record<Level, { label: string; dot: string; badge: string; text: string }> = {
  emergente: {
    label: "EMERGENTE",
    dot: "bg-destructive",
    badge: "bg-destructive/15 text-destructive border border-destructive/40",
    text: "text-destructive",
  },
  urgente: {
    label: "URGENTE",
    dot: "bg-warning",
    badge: "bg-warning/15 text-warning border border-warning/40",
    text: "text-warning",
  },
  monitorar: {
    label: "MONITORAR",
    dot: "bg-info",
    badge: "bg-info/15 text-info border border-info/40",
    text: "text-info",
  },
};

function fmtMinutes(min: number): string {
  if (min <= 0) return "agora";
  if (min < 60) return `${Math.ceil(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.ceil(min % 60);
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function buildPriorities(tasks: TaskWithChapas[], threshold: number): PriorityItem[] {
  const now = Date.now();
  const items: PriorityItem[] = [];

  for (const t of tasks) {
    if (t.validacao_status === "validacao_recebida") continue;
    if (t.validacao_status === "subido_meu_chapa") continue;
    if (t.status_tarefa === "Concluído") continue;

    const startMs = parseTaskDate(t.data_tarefa, t.cidade_uf).getTime();
    const minutesUntil = (startMs - now) / 60_000;

    const requested = t.quantidade_chapas || t.chapas.filter((c) => c.nome_chapa).length;
    if (requested === 0) continue;

    const confirmed = t.chapas.filter((c) => c.status_contato === "confirmado").length;
    const fill = Math.round((confirmed / requested) * 100);
    const vacant = Math.max(0, requested - confirmed);

    // How much each missing chapa damages fill rate (small tasks = high impact)
    const chapaFillImpact = Math.round(100 / requested); // e.g. 50% for 2-chapa task

    // How billing-relevant this task is (proxy: more chapas = more revenue at stake)
    const isBigTask = requested >= 6;
    const isSmallTask = requested <= 3;

    let level: Level | null = null;
    let reason = "";

    if (t.urgent) {
      level = "emergente";
      reason = "urgente · confirme presença";
    } else if (t.continuingFromYesterday && fill < threshold) {
      level = "urgente";
      reason = `overnight · fill ${fill}% · ${vacant} vaga${vacant > 1 ? "s" : ""}`;
    } else if (confirmed === 0 && minutesUntil <= 120) {
      level = "emergente";
      reason = `sem chapas · inicia ${fmtMinutes(minutesUntil)}`;
    } else if (fill < 50 && minutesUntil <= 60) {
      level = "emergente";
      reason = `fill crítico ${fill}% · ${vacant} vaga${vacant > 1 ? "s" : ""} · ${fmtMinutes(minutesUntil)}`;
    } else if (fill < threshold && minutesUntil <= 90) {
      level = "urgente";
      reason = `fill ${fill}% · inicia ${fmtMinutes(minutesUntil)}`;
      if (isSmallTask && chapaFillImpact >= 25) reason += ` · alto impacto no fill`;
    } else if (fill < threshold && minutesUntil <= 240) {
      level = isBigTask ? "urgente" : "monitorar";
      reason = isBigTask
        ? `${vacant} vaga${vacant > 1 ? "s" : ""} em aberto · alto faturamento`
        : `fill ${fill}% · ${fmtMinutes(minutesUntil)}`;
    } else if (fill < threshold && minutesUntil <= 480) {
      level = "monitorar";
      reason = `fill ${fill}% · inicia ${fmtMinutes(minutesUntil)}`;
    }

    if (!level) continue;

    // Score: lower = higher urgency
    // Factor 1: time pressure (negative = already past start)
    const timePressure = minutesUntil <= 0 ? -9999 : minutesUntil;
    // Factor 2: fill damage (worse fill + small task = more urgent)
    const fillUrgency = (100 - fill) * (isSmallTask ? 2 : isBigTask ? 0.8 : 1);
    const score = timePressure - fillUrgency;

    items.push({ task: t, level, minutesUntil, confirmed, requested, fill, vacant, reason, score });
  }

  const order: Record<Level, number> = { emergente: 0, urgente: 1, monitorar: 2 };
  return items.sort((a, b) => {
    const ld = order[a.level] - order[b.level];
    return ld !== 0 ? ld : a.score - b.score;
  });
}

export function PriorityPanel({
  tasks,
  onFlashTask,
  fillThreshold,
  hideMonitorar = false,
  lembreteItems = [],
}: {
  tasks: TaskWithChapas[];
  onFlashTask: (id: number) => void;
  fillThreshold: number;
  hideMonitorar?: boolean;
  lembreteItems?: LembreteAlertItem[];
}) {
  const [expanded, setExpanded] = useState(true);

  const allItems = useMemo(() => buildPriorities(tasks, fillThreshold), [tasks, fillThreshold]);
  const items = hideMonitorar ? allItems.filter((i) => i.level !== "monitorar") : allItems;

  const emergentes = items.filter((i) => i.level === "emergente").length;
  const urgentes = items.filter((i) => i.level === "urgente").length;
  const monitorar = items.filter((i) => i.level === "monitorar").length;
  const nLembretes = lembreteItems.length;

  if (tasks.length === 0) return null;

  const allGood = items.length === 0 && nLembretes === 0;

  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <Zap className={`h-4 w-4 shrink-0 ${allGood ? "text-success" : "text-warning"}`} />
        <span className="text-sm font-semibold text-foreground">Prioridades de Ação</span>

        {allGood ? (
          <span className="text-xs text-success font-medium">todas as tarefas OK</span>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {nLembretes > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-info">
                <Bell className="h-3 w-3" />
                {nLembretes} lembrete{nLembretes > 1 ? "s" : ""}
              </span>
            )}
            {emergentes > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                {emergentes} emergente{emergentes > 1 ? "s" : ""}
              </span>
            )}
            {urgentes > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                {urgentes} urgente{urgentes > 1 ? "s" : ""}
              </span>
            )}
            {monitorar > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-info">
                <span className="h-1.5 w-1.5 rounded-full bg-info" />
                {monitorar} monitorar
              </span>
            )}
          </div>
        )}

        <span className="ml-auto text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-border">
          {allGood ? (
            <div className="px-4 py-4 flex items-center gap-2 text-sm text-success">
              <span className="h-2 w-2 rounded-full bg-success" />
              Todas as tarefas com fill rate adequado. Continue monitorando.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Lembretes section */}
              {lembreteItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-2.5 bg-info/5 hover:bg-info/10 transition-colors"
                >
                  <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-info/15 text-info border border-info/40">
                    LEMBRETE
                  </span>
                  <Bell className="h-3.5 w-3.5 text-info shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground capitalize truncate block">
                      {item.empresa.toLowerCase()}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate block italic">
                      {item.message}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground shrink-0 w-10 text-center">
                    {fmtTime(item.horario)}
                  </span>
                  <div className="shrink-0 w-14 text-right">
                    {item.minutesUntil <= 0 ? (
                      <span className="text-[10px] font-semibold text-destructive flex items-center gap-0.5 justify-end">
                        <AlertTriangle className="h-3 w-3" /> em curso
                      </span>
                    ) : (
                      <span className={`text-[11px] font-semibold tabular-nums flex items-center gap-0.5 justify-end ${
                        item.minutesUntil <= 60 ? "text-destructive" : item.minutesUntil <= 120 ? "text-warning" : "text-info"
                      }`}>
                        <Clock className="h-3 w-3" />
                        {fmtMinutes(item.minutesUntil)}
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs shrink-0 gap-1 text-info hover:bg-muted"
                    onClick={() => onFlashTask(item.taskId)}
                  >
                    <Eye className="h-3 w-3" />
                    Ver
                  </Button>
                </div>
              ))}

              {/* Priority items */}
              {items.map(({ task, level, minutesUntil, confirmed, requested, fill, reason }) => {
                const meta = LEVEL_META[level];
                const fillBg =
                  fill >= 80 ? "bg-success" : fill >= 60 ? "bg-warning" : "bg-destructive";

                return (
                  <div
                    key={task.id_tarefa}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
                  >
                    {/* Badge */}
                    <span
                      className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.badge}`}
                    >
                      {meta.label}
                    </span>

                    {/* Empresa + reason */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground capitalize truncate block">
                        {task.empresa.toLowerCase()}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate block">
                        {reason}
                      </span>
                    </div>

                    {/* Horário */}
                    <span className="text-xs font-mono text-muted-foreground shrink-0 w-10 text-center">
                      {fmtTime(task.data_tarefa)}
                    </span>

                    {/* Chapas */}
                    <span className="text-xs tabular-nums shrink-0 w-10 text-center">
                      <span className={`font-bold ${meta.text}`}>{confirmed}</span>
                      <span className="text-muted-foreground">/{requested}</span>
                    </span>

                    {/* Fill bar */}
                    <div className="w-16 shrink-0">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${fillBg} transition-[width]`}
                          style={{ width: `${fill}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-bold tabular-nums ${meta.text}`}>
                        {fill}%
                      </span>
                    </div>

                    {/* Time countdown */}
                    <div className="shrink-0 w-14 text-right">
                      {minutesUntil <= 0 ? (
                        <span className="text-[10px] font-semibold text-destructive flex items-center gap-0.5 justify-end">
                          <AlertTriangle className="h-3 w-3" /> em curso
                        </span>
                      ) : (
                        <span className={`text-[11px] font-semibold tabular-nums flex items-center gap-0.5 justify-end ${
                          minutesUntil <= 60 ? "text-destructive" : minutesUntil <= 120 ? "text-warning" : "text-muted-foreground"
                        }`}>
                          <Clock className="h-3 w-3" />
                          {fmtMinutes(minutesUntil)}
                        </span>
                      )}
                    </div>

                    {/* Action */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`h-7 text-xs shrink-0 gap-1 ${meta.text} hover:bg-muted`}
                      onClick={() => onFlashTask(task.id_tarefa)}
                    >
                      <Eye className="h-3 w-3" />
                      Ver
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
