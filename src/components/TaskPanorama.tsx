import { useState, useEffect } from "react";
import {
  Clock,
  AlertTriangle,
  Check,
  BadgeCheck,
  Moon,
  ChevronRight,
  Download,
  Layers,
} from "lucide-react";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { type TaskWithChapas, UnreadDot, fmtElapsed } from "./TaskCard";
import { FillRateBar } from "./FillRateBar";
import { fmtTime, fmtSP, taskTzLabel } from "@/lib/datetime";
import { todayDateISO_SP } from "@/lib/datetime";
import { getDb } from "@/lib/db";
import { computeTaskState, taskSeverityRowClass, severityLabel } from "@/lib/taskState";
import { last11Digits } from "@/lib/umbler";
import { useUnreadChats } from "@/lib/WatcherContext";
import { OfertaBadge } from "@/components/TarefaInfo";
import { estaEmOferta, resumoDaTarefa } from "@/lib/tarefaExtras";

function csvExported(id: number) {
  try {
    return !!localStorage.getItem(`csv_exported_task_${id}`);
  } catch {
    return false;
  }
}

type Props = {
  tasks: TaskWithChapas[];
  overnightTasks?: TaskWithChapas[];
  onRefresh: () => void;
  // Só no card de grupo: o analista separa as tarefas (ver lib/agrupamentoTarefas.ts).
  onDesfazerGrupo?: (ids: number[]) => void;
  threshold: number;
  autoOpenTaskId?: number;
  autoRemoveChapaName?: string;
};

// Colunas do Panorama: a da empresa tem piso (nunca some em tela estreita) e a tabela rola se não couber.
const PANORAMA_COLUNAS = "76px minmax(160px, 1fr) minmax(120px, 190px) 100px 80px 28px";

export function TaskPanorama({ tasks, overnightTasks = [], onRefresh, onDesfazerGrupo, threshold, autoOpenTaskId, autoRemoveChapaName }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (autoOpenTaskId != null) setSelectedId(autoOpenTaskId);
  }, [autoOpenTaskId]);

  const allForLookup = [...overnightTasks, ...tasks];
  const selectedTask =
    selectedId != null
      ? allForLookup.find((t) => t.id_tarefa === selectedId) ??
        allForLookup.find((t) => t.grupo?.ids.includes(selectedId)) ?? // link de notificação pra tarefa que está dentro de um grupo
        null
      : null;

  // Efeito colateral (não visual): abrir a tarefa vinda de uma notificação de
  // remoção já marca o chapa correspondente como removido — antes vivia
  // dentro do TaskCard, movido pra cá pra não depender de qual container
  // exibe os detalhes da tarefa (TaskDetailPanel não tem esse conceito).
  useEffect(() => {
    if (!autoRemoveChapaName || selectedId !== autoOpenTaskId || !selectedTask) return;
    const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
    const match = selectedTask.chapas.find((c) => c.nome_chapa && norm(c.nome_chapa) === norm(autoRemoveChapaName));
    if (!match) return;
    getDb()
      .then((db) => db.execute(
        "UPDATE chapas SET status_contato = ?, data_remocao = ? WHERE id = ?",
        ["removido", new Date().toISOString(), match.id],
      ))
      .then(() => onRefresh())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRemoveChapaName, selectedId]);

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
      <div className={`rounded-xl border overflow-x-auto ${accent ?? "border-border"}`}>
       <div className="min-w-[600px] divide-y divide-border">
        {/* Column header */}
        <div
          className="hidden md:grid bg-muted/40 px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground select-none"
          style={{ gridTemplateColumns: PANORAMA_COLUNAS }}
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

      <TaskDetailPanel
        task={selectedTask}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        onRefresh={onRefresh}
        onDesfazerGrupo={onDesfazerGrupo}
        orderedIds={allForLookup.map((t) => t.id_tarefa)}
        onNavigateTask={(id) => setSelectedId(id)}
      />
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
  const { confirmed, requested, fillPct, minutesUntilStart, isDone, fullyValidated, showApproachAlert, severity } =
    computeTaskState(task, threshold);

  // MCM-159: agregado — visão densa (sem linha por chapa visível), então o
  // ponto aqui é "alguém desta tarefa tem mensagem nova". Só considera
  // chapas (telefone) — o grupo do cliente ficaria de fora pra não disparar
  // 1 query por linha (useClienteInfo faz SELECT completo em cliente_book).
  const { unreadPhones } = useUnreadChats();
  const taskHasUnread = task.chapas.some((c) => c.telefone_chapa && unreadPhones.has(last11Digits(c.telefone_chapa)));

  const hasCsv = csvExported(task.id_tarefa);

  // Timer de FUP compacto — visão densa (sem linha por chapa), então usa o
  // disparo mais recente da tarefa inteira (massa ou individual, tanto faz —
  // não dá pra distinguir por chapa aqui). Mesmo dado que alimenta o badge
  // do header em TaskCard/TaskDetailPanel, só que sempre visível (não gated
  // por mass-vs-individual, que só faz sentido quando há linha por chapa).
  const lastFupLog = task.fup_log.length > 0
    ? task.fup_log.reduce((a, b) => (a.data_disparo > b.data_disparo ? a : b))
    : null;
  const minutesSinceFup = lastFupLog
    ? Math.floor((Date.now() - new Date(lastFupLog.data_disparo).getTime()) / 60_000)
    : null;
  // Em Andamento nunca fica verde, mesmo concluída/validada — fica azul
  // (mesmo tratamento do TaskCard, MCM-128).
  const emAndamento = task.status_tarefa === "Em Andamento";
  // Mesma lógica para Em Análise — fica amarelo claro.
  const emAnalise = task.status_tarefa === "Em Análise";

  // Cor da linha agora vem só do severity central (confirmação x tempo) —
  // overnight/continuando saíram do cálculo de cor, o ícone de lua (abaixo)
  // já sinaliza isso separadamente.
  const { accentBorder, rowBg, timeColor } = taskSeverityRowClass(severity);

  const vStatus = task.validacao_status ?? "aguardando";
  let statusNode: React.ReactNode;
  if (emAndamento && (isDone || fullyValidated)) {
    statusNode = (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-info">
        <BadgeCheck className="h-3 w-3" /> Em Andamento
      </span>
    );
  } else if (emAnalise && (isDone || fullyValidated)) {
    statusNode = (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-analise">
        <BadgeCheck className="h-3 w-3" /> Em Análise
      </span>
    );
  } else if (isDone) {
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
      style={{ gridTemplateColumns: PANORAMA_COLUNAS }}
    >
      {/* Time */}
      <div>
        <div className={`font-display font-bold text-sm tabular-nums inline-flex items-center gap-1 ${timeColor}`}>
          {fmtTime(task.data_tarefa)}
          {/* a cor da hora não é o único sinal da severidade: ícone + texto (WCAG 1.4.1) */}
          {severity === "approach-alert" && !isDone && (
            <span title={severityLabel(severity) ?? undefined}><Clock className="h-3 w-3" aria-label="Atenção" /></span>
          )}
        </div>
        {taskTzLabel(task.cidade_uf) && (
          <div className="text-[11px] font-semibold text-muted-foreground leading-none mt-0.5">
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
          {taskHasUnread && <UnreadDot title="Mensagem nova no Umbler nesta tarefa" />}
          <span
            className={`text-sm font-medium truncate capitalize ${
              isDone ? "text-muted-foreground line-through" : "text-foreground"
            }`}
          >
            {task.empresa.toLowerCase()}
          </span>
          {task.grupo && (
            <span
              title={`${task.grupo.ids.length} tarefas do mesmo cliente, endereço e horário reunidas (${task.grupo.ids.map((i) => "#" + i).join(", ")})`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded border border-info/40 bg-info/10 text-info shrink-0"
            >
              <Layers className="h-3 w-3" aria-hidden="true" />
              {task.grupo.ids.length} tarefas
            </span>
          )}
          {estaEmOferta(task) && <OfertaBadge chapa={task.chapa_em_oferta} compacto />}
        </div>
        <div
          className="text-[11px] text-muted-foreground truncate"
          title={[task.cidade_uf, resumoDaTarefa(task, 200)].filter(Boolean).join(" · ")}
        >
          {[task.cidade_uf ?? "—", resumoDaTarefa(task, 18)].filter(Boolean).join(" · ")}
        </div>
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
        {!isDone && !fullyValidated && !showApproachAlert && minutesSinceFup !== null && (
          <span
            className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground/80 tabular-nums"
            title={`Último disparo há ${fmtElapsed(minutesSinceFup)}`}
          >
            <Clock className="h-2.5 w-2.5 opacity-60" />
            {fmtElapsed(minutesSinceFup)}
          </span>
        )}
        {!showApproachAlert && isDone && (
          <Check className={`h-3.5 w-3.5 ${emAndamento ? "text-info" : emAnalise ? "text-analise" : "text-success"}`} />
        )}
      </div>

      {/* Expand */}
      <div className="flex justify-center">
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}
