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

// Tarefa entrou "Em Andamento" com menos chapas reais (nome_chapa + não
// removido, mesmo filtro de `realChapas` usado em TaskCard) do que
// quantidade_chapas planejada, e ainda não tem motivo registrado — precisa
// de justificativa obrigatória do analista (4 opções fixas, ver
// AndamentoJustificationAlert). Some assim que `andamento_motivo` é
// preenchido, mesmo que a tarefa continue com vagas em aberto depois.
export function needsAndamentoJustification(task: TaskWithChapas): boolean {
  if (task.status_tarefa !== "Em Andamento") return false;
  if (task.andamento_motivo) return false;
  const realChapas = task.chapas.filter((c) => c.nome_chapa && c.status_contato !== "removido");
  return realChapas.length < task.quantidade_chapas;
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

  // Cor da borda/bloco passou a seguir SÓ confirmação x tempo, desacoplada
  // de validação de presença/upload no Meu Chapa (isDone/fullyValidated) e
  // da flag `urgent` da importação — pedido explícito do usuário, que
  // achava a cor "bagunçada" (cinza com tudo confirmado, vermelho mesmo com
  // gente confirmada). Regra nova, por prioridade:
  //   1. Em Andamento → azul (sempre, independente do resto)
  //   2. Em Análise → cinza (sempre)
  //   3. confirmed === requested → verde
  //   4. zero confirmado E ≤60min pro início (ou já passou do horário) → vermelho
  //   5. ≤3h pro início (e não caiu nos casos acima) → amarelo
  //   6. mais de 3h pro início → cinza
  // Overnight/continuando-de-ontem saíram do cálculo de cor — o ícone de
  // lua e o banner "continuando desde ontem" continuam sinalizando isso,
  // só não mudam mais a cor da borda.
  const isFullyConfirmed = requested > 0 && confirmed === requested;
  const zeroConfirmedNearOrPastStart = confirmed === 0 && minutesUntilStart <= 60;
  const withinApproachWindow = minutesUntilStart <= 180;

  let severity: TaskSeverity = "default";
  if (emAndamento) severity = "andamento";
  else if (emAnalise) severity = "default";
  else if (isFullyConfirmed) severity = "done";
  else if (zeroConfirmedNearOrPastStart) severity = "urgent";
  else if (withinApproachWindow) severity = "approach-alert";

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

// Borda + ring pro card inteiro (TaskCard) — mesmo severity das outras
// duas views, só que como acento de borda em vez de bloco sólido.
export function taskSeverityCardBorderClass(severity: TaskSeverity): string {
  switch (severity) {
    case "andamento":
      return "border-info/50 border-l-4 border-l-info ring-1 ring-info/20";
    case "done":
    case "validated":
      return "border-success/60 border-l-4 border-l-success ring-1 ring-success/20";
    case "approach-alert":
      return "border-warning/60 ring-2 ring-warning/30";
    case "urgent":
      return "border-destructive/50 ring-1 ring-destructive/20";
    default:
      return "border-border";
  }
}

// Acento de linha (Panorama) — border-l fina + tingimento leve de fundo.
export function taskSeverityRowClass(severity: TaskSeverity): { accentBorder: string; rowBg: string; timeColor: string } {
  switch (severity) {
    case "andamento":
      return { accentBorder: "border-l-info", rowBg: "bg-info/[0.04]", timeColor: "text-foreground" };
    case "done":
    case "validated":
      return { accentBorder: "border-l-success", rowBg: "bg-success/[0.04]", timeColor: "text-muted-foreground" };
    case "approach-alert":
      return { accentBorder: "border-l-warning", rowBg: "bg-warning/5", timeColor: "text-warning" };
    case "urgent":
      return { accentBorder: "border-l-destructive", rowBg: "bg-destructive/[0.04]", timeColor: "text-destructive" };
    default:
      return { accentBorder: "border-l-border", rowBg: "", timeColor: "text-foreground" };
  }
}
