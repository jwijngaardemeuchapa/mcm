import { useState, useEffect } from "react";
import {
  Clock,
  AlertTriangle,
  Check,
  BadgeCheck,
  Moon,
  ChevronRight,
  Download,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TaskCard, type TaskWithChapas } from "./TaskCard";
import { FillRateBar } from "./FillRateBar";
import { fmtTime, fmtSP, parseTaskDate, taskTzLabel } from "@/lib/datetime";
import { todayDateISO_SP } from "@/lib/datetime";

function csvExported(id: number) {
  try {
    return !!localStorage.getItem(`csv_exported_task_${id}`);
  } catch {
    return false;
  }
}

function computeRow(task: TaskWithChapas, threshold: number) {
  const confirmed = task.chapas.filter((c) => c.status_contato === "confirmado").length;
  const requested = task.quantidade_chapas || task.chapas.length;
  const fillPct = requested > 0 ? Math.round((confirmed / requested) * 100) : 0;
  const minutesUntilStart = (parseTaskDate(task.data_tarefa, task.cidade_uf).getTime() - Date.now()) / 60_000;
  const isDone =
    task.chapas.length > 0 &&
    task.chapas.every((c) => c.status_contato === "confirmado") &&
    (task.validacao_status ?? "aguardando") === "subido_meu_chapa";
  const realChapas = task.chapas.filter(
    (c) => c.nome_chapa && c.status_contato !== "removido",
  );
  const fullyValidated =
    realChapas.length > 0 &&
    realChapas.every(
      (c) => c.validacao_presenca === "presente" || c.validacao_presenca === "ausente",
    );
  const showApproachAlert =
    !isDone && minutesUntilStart > 0 && minutesUntilStart <= 60 && fillPct < threshold;
  return { confirmed, requested, fillPct, minutesUntilStart, isDone, fullyValidated, showApproachAlert };
}

type Props = {
  tasks: TaskWithChapas[];
  overnightTasks?: TaskWithChapas[];
  onRefresh: () => void;
  threshold: number;
  autoOpenTaskId?: number;
  autoRemoveChapaName?: string;
};

export function TaskPanorama({ tasks, overnightTasks = [], onRefresh, threshold, autoOpenTaskId, autoRemoveChapaName }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (autoOpenTaskId != null) setSelectedId(autoOpenTaskId);
  }, [autoOpenTaskId]);

  const allForLookup = [...overnightTasks, ...tasks];
  const selectedTask =
    selectedId != null ? allForLookup.find((t) => t.id_tarefa === selectedId) ?? null : null;

  const todayISO = todayDateISO_SP();
  const byDate = new Map<string, TaskWithChapas[]>();
  tasks.forEach((t) => {
    const k = fmtSP(t.data_tarefa, "yyyy-MM-dd");
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(t);
  });
  const dates = Array.from(byDate.keys()).sort();

  function renderTable(group: TaskWithChapas[], accent?: string) {
    return (
      <div className={`rounded-xl border overflow-hidden divide-y divide-border ${accent ?? "border-border"}`}>
        {/* Column header */}
        <div
          className="hidden md:grid bg-muted/40 px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground select-none"
          style={{ gridTemplateColumns: "76px 1fr 190px 110px 90px 32px" }}
        >
          <span>Horário</span>
          <span>Empresa</span>
          <span>Fill rate</span>
          <span>Status</span>
          <span>Alertas</span>
          <span />
        </div>
        {group.map((t) => (
          <PanoramaRow
            key={t.id_tarefa}
            task={t}
            threshold={threshold}
            onClick={() => setSelectedId(t.id_tarefa)}
          />
        ))}
      </div>
    );
  }

  function renderDateGroup(dateISO: string, group: TaskWithChapas[]) {
    const isToday = dateISO === todayISO;
    const label = isToday
      ? "Hoje"
      : fmtSP(`${dateISO}T12:00:00-03:00`, "EEEE, dd/MM");
    return (
      <div key={dateISO} className="space-y-2">
        {!isToday && (
          <div className="flex items-center gap-3 pt-1">
            <span className="text-sm font-display font-semibold text-foreground capitalize">
              {label}
            </span>
            <span className="text-xs text-muted-foreground">
              ({group.length} tarefa{group.length > 1 ? "s" : ""})
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}
        {renderTable(group)}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {overnightTasks.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-display font-semibold text-base text-overnight flex items-center gap-2">
              <Moon className="h-4 w-4" /> Em andamento — iniciadas ontem
            </h2>
            {renderTable(overnightTasks, "border-overnight/30")}
          </div>
        )}

        {dates.map((d) => renderDateGroup(d, byDate.get(d)!))}

        {tasks.length === 0 && overnightTasks.length === 0 && (
          <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
            Nenhuma tarefa visível com os filtros atuais.
          </div>
        )}
      </div>

      <Sheet open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent
          side="right"
          className="w-full sm:w-[680px] sm:max-w-[90vw] p-0 overflow-y-auto"
        >
          <SheetHeader className="px-4 pt-4 pb-0">
            <SheetTitle className="text-sm font-semibold text-muted-foreground">
              Detalhes da tarefa
            </SheetTitle>
          </SheetHeader>
          <div className="p-4">
            {selectedTask && (
              <TaskCard
                task={selectedTask}
                onRefresh={onRefresh}
                autoRemoveChapaName={selectedId === autoOpenTaskId ? autoRemoveChapaName : undefined}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Single panorama row                                                        */
/* -------------------------------------------------------------------------- */

function PanoramaRow({
  task,
  threshold,
  onClick,
}: {
  task: TaskWithChapas;
  threshold: number;
  onClick: () => void;
}) {
  const { confirmed, requested, fillPct, minutesUntilStart, isDone, fullyValidated, showApproachAlert } =
    computeRow(task, threshold);

  const hasCsv = csvExported(task.id_tarefa);

  let accentBorder = "border-l-border";
  let rowBg = "";
  if (task.continuingFromYesterday) { accentBorder = "border-l-overnight"; rowBg = "bg-overnight/5"; }
  else if (isDone) { accentBorder = "border-l-success"; rowBg = "bg-success/[0.04]"; }
  else if (fullyValidated) { accentBorder = "border-l-success"; }
  else if (showApproachAlert) { accentBorder = "border-l-warning"; rowBg = "bg-warning/5"; }
  else if (task.urgent) { accentBorder = "border-l-destructive"; rowBg = "bg-destructive/[0.04]"; }
  else if (task.is_overnight) { accentBorder = "border-l-overnight"; }

  const timeColor = isDone
    ? "text-muted-foreground"
    : showApproachAlert
    ? "text-warning"
    : task.urgent
    ? "text-destructive"
    : "text-foreground";

  const vStatus = task.validacao_status ?? "aguardando";
  let statusNode: React.ReactNode;
  if (isDone) {
    statusNode = (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
        <BadgeCheck className="h-3 w-3" /> Concluída
      </span>
    );
  } else if (fullyValidated) {
    statusNode = (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
        <BadgeCheck className="h-3 w-3" /> Validada
      </span>
    );
  } else {
    const map: Record<string, React.ReactNode> = {
      aguardando: <span className="text-[11px] text-muted-foreground">Aguardando</span>,
      pendente: <span className="text-[11px] font-medium text-info">Pendente</span>,
      validacao_recebida: <span className="text-[11px] font-medium text-warning">Val. recebida</span>,
      subido_meu_chapa: <span className="text-[11px] font-medium text-success">Subida</span>,
    };
    statusNode = map[vStatus] ?? (
      <span className="text-[11px] text-muted-foreground">{vStatus}</span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full grid items-center px-4 py-3 text-left hover:bg-muted/30 active:bg-muted/50 transition-colors border-l-4 ${accentBorder} ${rowBg}`}
      style={{ gridTemplateColumns: "76px 1fr 190px 110px 90px 32px" }}
    >
      {/* Time */}
      <div>
        <div className={`font-display font-bold text-sm tabular-nums ${timeColor}`}>
          {fmtTime(task.data_tarefa)}
        </div>
        {taskTzLabel(task.cidade_uf) && (
          <div className="text-[10px] font-semibold text-muted-foreground leading-none mt-0.5">
            {taskTzLabel(task.cidade_uf)}
          </div>
        )}
      </div>

      {/* Company + city */}
      <div className="min-w-0 pr-3">
        <div className="flex items-center gap-1.5">
          {(task.is_overnight || task.continuingFromYesterday) && (
            <Moon className="h-3 w-3 text-overnight shrink-0" />
          )}
          <span
            className={`text-sm font-medium truncate capitalize ${
              isDone ? "text-muted-foreground line-through" : "text-foreground"
            }`}
          >
            {task.empresa.toLowerCase()}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{task.cidade_uf ?? "—"}</div>
      </div>

      {/* Fill rate bar */}
      <div className="pr-3">
        <FillRateBar confirmed={confirmed} requested={requested} variant="compact" heightClass="h-1.5" />
      </div>

      {/* Status */}
      <div>{statusNode}</div>

      {/* Alerts */}
      <div className="flex items-center gap-1.5">
        {showApproachAlert && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-warning animate-pulse">
            <Clock className="h-3.5 w-3.5" />
            {Math.ceil(minutesUntilStart)}m
          </span>
        )}
        {!hasCsv && !isDone && (
          <span title="CSV ainda não exportado">
            <Download className="h-3 w-3 text-warning opacity-60" />
          </span>
        )}
        {!showApproachAlert && isDone && <Check className="h-3.5 w-3.5 text-success" />}
        {task.urgent && !isDone && !showApproachAlert && (
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        )}
      </div>

      {/* Expand */}
      <div className="flex justify-center">
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}
