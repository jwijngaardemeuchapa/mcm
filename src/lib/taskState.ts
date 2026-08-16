import { parseTaskDate } from "@/lib/datetime";
import type { TaskWithChapas } from "@/components/TaskCard";

/**
 * Estado de validação/severidade visual de uma tarefa — extraído porque
 * TaskCard, TaskPanorama e TaskTimeline calculavam isso de forma
 * independente (isDone/fullyValidated duplicados; Timeline ainda usava só
 * fillPct bruto e ignorava subido_meu_chapa), podendo mostrar cor/badge
 * diferente pra mesma tarefa em cada view. Ver auditoria de consistência
 * Cards/Panorama/Timeline.
 */

export type TaskSeverity =
  | "andamento"
  | "analise"
  | "done"
  | "validated"
  | "approach-alert"
  | "urgent"
  | "default";

export type TaskState = {
  confirmed: number;
  requested: number;
  fillPct: number;
  minutesUntilStart: number;
  isDone: boolean;
  fullyValidated: boolean;
  showApproachAlert: boolean;
  isValidated: boolean;
  emAndamento: boolean;
  emAnalise: boolean;
  severity: TaskSeverity;
};

// Definição de "validado" já usada pela MAIORIA das views (AlertBanner,
// PriorityPanel, Dashboard): validacao_status recebida do cliente OU já
// subida no Meu Chapa — não só "validacao_recebida" como o Timeline fazia.
export function isTaskValidated(validacao_status: string | null | undefined): boolean {
  const v = validacao_status ?? "aguardando";
  return v === "validacao_recebida" || v === "subido_meu_chapa";
}

export function computeTaskState(
  task: TaskWithChapas,
  fillRateWarningThreshold: number,
): TaskState {
  const confirmed = task.chapas.filter((c) => c.status_contato === "confirmado").length;
  const requested = task.quantidade_chapas || task.chapas.length;
  const fillPct = requested > 0 ? Math.round((confirmed / requested) * 100) : 0;
  const minutesUntilStart =
    (parseTaskDate(task.data_tarefa, task.cidade_uf).getTime() - Date.now()) / 60_000;

  const isDone =
    task.chapas.length > 0 &&
    task.chapas.every((c) => c.status_contato === "confirmado") &&
    (task.validacao_status ?? "aguardando") === "subido_meu_chapa";

  const realChapas = task.chapas.filter((c) => c.nome_chapa && c.status_contato !== "removido");
  const fullyValidated =
    realChapas.length > 0 &&
    realChapas.every(
      (c) => c.validacao_presenca === "presente" || c.validacao_presenca === "ausente",
    );

  const showApproachAlert =
    !isDone && minutesUntilStart > 0 && minutesUntilStart <= 60 && fillPct < fillRateWarningThreshold;

  const isValidated = isTaskValidated(task.validacao_status);

  // Em Andamento/Em Análise nunca ficam verdes, mesmo já validadas/subidas —
  // mesmo tratamento em TaskCard, TaskPanorama (MCM-128).
  const emAndamento = task.status_tarefa === "Em Andamento";
  const emAnalise = task.status_tarefa === "Em Análise";

  let severity: TaskSeverity = "default";
  if (emAndamento && (isDone || fullyValidated)) severity = "andamento";
  else if (emAnalise && (isDone || fullyValidated)) severity = "analise";
  else if (isDone) severity = "done";
  else if (fullyValidated) severity = "validated";
  else if (showApproachAlert) severity = "approach-alert";
  else if (task.urgent) severity = "urgent";

  return {
    confirmed,
    requested,
    fillPct,
    minutesUntilStart,
    isDone,
    fullyValidated,
    showApproachAlert,
    isValidated,
    emAndamento,
    emAnalise,
    severity,
  };
}

// Classes de cor "sólida" (bloco compacto) por tier de severidade — usadas
// pelo Timeline, que precisa de UMA classe por tarefa em vez das
// combinações de borda/ring que Cards/Panorama já tratam por conta própria.
export function taskSeverityBlockClass(severity: TaskSeverity): string {
  switch (severity) {
    case "andamento":
      return "bg-info border-info/50 text-info-foreground";
    case "analise":
      return "bg-analise border-analise/50 text-analise-foreground";
    case "done":
    case "validated":
      return "bg-success border-success/50 text-success-foreground";
    case "approach-alert":
      return "bg-warning border-warning/50 text-warning-foreground";
    case "urgent":
      return "bg-destructive border-destructive/50 text-destructive-foreground";
    default:
      return "bg-muted border-border text-foreground";
  }
}
