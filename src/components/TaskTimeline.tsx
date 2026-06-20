import React, { useMemo, useRef, useEffect, useCallback } from "react";
import { type TaskWithChapas } from "./TaskCard";
import { fmtSP, todayDateISO_SP, nowSP } from "@/lib/datetime";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Building2, Clock, Users, CheckCircle2, BadgeCheck, LocateFixed } from "lucide-react";

interface TaskTimelineProps {
  tasks: TaskWithChapas[];
  onTaskClick: (id: number) => void;
}

export function TaskTimeline({ tasks, onTaskClick }: TaskTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Constants
  const HOUR_WIDTH = 120; // 120px per hour
  const DEFAULT_DURATION_HOURS = 2; // Default 2 hours block

  const { startHour, endHour, processedTasks } = useMemo(() => {
    if (tasks.length === 0) return { startHour: 6, endHour: 18, processedTasks: [] };

    let minH = 24;
    let maxH = 0;

    const processed = tasks.map((t) => {
      const h = parseInt(fmtSP(t.data_tarefa, "HH"), 10);
      const m = parseInt(fmtSP(t.data_tarefa, "mm"), 10);
      const startFloat = h + m / 60;
      const endFloat = startFloat + DEFAULT_DURATION_HOURS;

      if (startFloat < minH) minH = Math.floor(startFloat);
      if (endFloat > maxH) maxH = Math.ceil(endFloat);

      // Fill rate calculation
      const totalVagas = t.quantidade_chapas || t.chapas.length || 1;
      const confirmados = t.chapas.filter(c => c.status_contato === "confirmado").length;
      const fillPct = (confirmados / totalVagas) * 100;
      
      const concluida = t.status_tarefa === "Concluído";
      const validada = (t.validacao_status ?? "aguardando") === "validacao_recebida";

      let colorClass = "bg-destructive border-destructive/50 text-destructive-foreground";
      if (fillPct >= 80) colorClass = "bg-success border-success/50 text-success-foreground";
      else if (fillPct >= 50) colorClass = "bg-warning border-warning/50 text-warning-foreground";
      if (concluida) colorClass += " opacity-50 saturate-50";

      return {
        ...t,
        startFloat,
        endFloat,
        fillPct,
        confirmados,
        totalVagas,
        colorClass,
        concluida,
        validada
      };
    });

    minH = Math.max(0, minH - 1); // 1 hour padding
    maxH = Math.min(24, maxH + 1); // 1 hour padding

    // Distribute into lanes (rows) to prevent overlap
    const lanes: { end: number }[] = [];
    
    // Sort tasks by start time
    const sorted = [...processed].sort((a, b) => a.startFloat - b.startFloat);
    
    const withLanes = sorted.map(t => {
      let laneIdx = lanes.findIndex(l => l.end <= t.startFloat);
      if (laneIdx === -1) {
        lanes.push({ end: t.endFloat });
        laneIdx = lanes.length - 1;
      } else {
        lanes[laneIdx].end = t.endFloat;
      }
      return { ...t, lane: laneIdx };
    });

    return { startHour: minH, endHour: maxH, processedTasks: withLanes };
  }, [tasks]);

  // É hoje? (linha do "Agora" só faz sentido quando a timeline mostra o dia atual)
  const today = todayDateISO_SP();
  const firstTaskDay = tasks[0] ? fmtSP(tasks[0].data_tarefa, "yyyy-MM-dd") : today;
  const isToday = today === firstTaskDay;

  // Centraliza o scroll na linha do "Agora"
  const centerOnNow = useCallback(() => {
    if (!scrollRef.current) return;
    const now = nowSP();
    const currentFloat = now.getHours() + now.getMinutes() / 60;
    if (currentFloat < startHour || currentFloat > endHour) return;
    const nowX = (currentFloat - startHour) * HOUR_WIDTH;
    const half = scrollRef.current.clientWidth / 2;
    scrollRef.current.scrollLeft = Math.max(0, nowX - half);
  }, [startHour, endHour]);

  // Auto-centraliza UMA vez (ao entrar na página / primeira carga de dados).
  // Não re-centraliza nos refreshes seguintes — preserva a posição do usuário.
  const didCenterRef = useRef(false);
  useEffect(() => {
    if (didCenterRef.current || tasks.length === 0 || !isToday) return;
    centerOnNow();
    didCenterRef.current = true;
  }, [tasks.length, isToday, centerOnNow]);

  const hoursArray = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const totalWidth = hoursArray.length * HOUR_WIDTH;

  // Altura baseada no número real de lanes (não no total de tarefas)
  const numLanes = processedTasks.length > 0
    ? Math.max(...processedTasks.map((t) => t.lane)) + 1
    : 1;
  const containerHeight = Math.max(120, numLanes * 50 + 60);

  return (
    <div className="relative">
      {isToday && (
        <button
          onClick={centerOnNow}
          className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted"
          title="Centralizar na hora atual"
        >
          <LocateFixed className="h-3.5 w-3.5 text-primary" />
          Agora
        </button>
      )}
      <div ref={scrollRef} className="w-full overflow-x-auto rounded-xl border border-border bg-card p-4">
      <div className="relative min-w-max" style={{ width: totalWidth, height: containerHeight }}>

        {/* Linhas de grade verticais — altura total do container */}
        {hoursArray.map((h) => (
          <div
            key={`grid-${h}`}
            className="absolute top-0 bottom-0 w-px bg-border/30"
            style={{ left: (h - startHour) * HOUR_WIDTH }}
          />
        ))}

        {/* Header - rótulos de hora */}
        <div className="absolute top-0 left-0 right-0 h-6 flex border-b border-border/50 text-xs text-muted-foreground">
          {hoursArray.map((h) => (
            <div key={h} className="relative h-full" style={{ width: HOUR_WIDTH }}>
              <span className="absolute -left-3 top-0 bg-card px-1">{String(h).padStart(2, "0")}:00</span>
            </div>
          ))}
        </div>

        {/* Task Blocks */}
        <div className="absolute top-10 left-0 right-0 bottom-0">
          <TooltipProvider delayDuration={200}>
            {processedTasks.map((t) => (
              <Tooltip key={t.id_tarefa}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onTaskClick(t.id_tarefa)}
                    className={`absolute h-10 rounded-md border text-left px-2 py-1 shadow-sm transition-all hover:ring-2 hover:ring-primary overflow-hidden ${t.colorClass}`}
                    style={{
                      left: (t.startFloat - startHour) * HOUR_WIDTH,
                      width: Math.max(80, (t.endFloat - t.startFloat) * HOUR_WIDTH - 4),
                      top: t.lane * 50
                    }}
                  >
                    <div className="text-[10px] font-bold truncate flex items-center gap-1">
                      {t.concluida && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                      {!t.concluida && t.validada && <BadgeCheck className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{t.empresa.toUpperCase()}</span>
                    </div>
                    <div className="text-[10px] flex items-center gap-1 opacity-90 whitespace-nowrap">
                      <Users className="h-3 w-3 shrink-0" />
                      {t.confirmados}/{t.totalVagas}
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="z-50 text-xs space-y-1 p-3">
                  <div className="font-bold border-b border-border/50 pb-1 mb-1">{t.empresa}</div>
                  <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {fmtSP(t.data_tarefa, "HH:mm")}</div>
                  <div className="flex items-center gap-1.5"><Building2 className="h-3 w-3" /> {t.cidade_uf || "N/A"}</div>
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> {t.confirmados} de {t.totalVagas} confirmados ({Math.round(t.fillPct)}%)
                  </div>
                  {t.concluida && (
                    <div className="flex items-center gap-1.5 text-success font-medium">
                      <CheckCircle2 className="h-3 w-3" /> Tarefa concluída
                    </div>
                  )}
                  {!t.concluida && t.validada && (
                    <div className="flex items-center gap-1.5 text-warning font-medium">
                      <BadgeCheck className="h-3 w-3" /> Validação recebida
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
        
        {/* Current Time Indicator (if within range and today) */}
        {(() => {
          if (!isToday) return null;
          const now = nowSP();
          const currentFloat = now.getHours() + now.getMinutes() / 60;
          if (currentFloat >= startHour && currentFloat <= endHour) {
            return (
              <div
                className="absolute top-0 bottom-0 w-px bg-primary z-10"
                style={{ left: (currentFloat - startHour) * HOUR_WIDTH, height: "100%" }}
              >
                <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1 rounded">Agora</div>
              </div>
            );
          }
          return null;
        })()}

      </div>
      </div>
    </div>
  );
}
