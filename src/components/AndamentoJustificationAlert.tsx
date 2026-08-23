import { useState, useEffect } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { type TaskWithChapas } from "./TaskCard";
import { needsAndamentoJustification } from "@/lib/taskState";
import { fmtTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { getDb, errMsg } from "@/lib/db";
import { pushAndamentoMotivoToCentral, fetchAndamentoAcoes } from "@/lib/central";
import { toast } from "sonner";

// As 4 opções são fixas por spec — motivo obrigatório quando uma tarefa
// entra "Em Andamento" com menos chapas reais do que quantidade_chapas
// (começou short-staffed). Rótulos em português, verbatim (não traduzir/
// abreviar) porque viram texto persistido em andamento_motivo.
const REASONS = [
  "Confirmou e não compareceu",
  "Desistiu no FUP",
  "Vagas não foram fechadas",
  "Não conseguimos contato com o ajudante",
] as const;

/**
 * Banner de justificativa obrigatória — modelado em cima de AlertBanner
 * (mesmo visual de "central de atenção", cycle entre pendências, "Ver →"),
 * mas cada item pede uma ação (escolher 1 dos 4 motivos) antes de poder
 * avançar/sumir, então não usa o auto-advance de 5s do AlertBanner: atrapalharia
 * o analista no meio da escolha.
 */
export function AndamentoJustificationAlert({
  tasks,
  onFlashTask,
  onRefresh,
}: {
  tasks: TaskWithChapas[];
  onFlashTask: (id: number) => void;
  onRefresh: () => void;
}) {
  const pending = tasks.filter(needsAndamentoJustification);

  const [index, setIndex] = useState(0);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Ações vêm da Central (configurável em Integrações), buscadas uma vez
  // por sessão — fetchAndamentoAcoes já cai num fallback local se a
  // Central estiver fora do ar, então não precisa de estado de erro aqui.
  const [acoes, setAcoes] = useState<string[]>([]);
  useEffect(() => {
    fetchAndamentoAcoes().then(setAcoes);
  }, []);

  useEffect(() => {
    if (index >= pending.length && pending.length > 0) setIndex(0);
  }, [pending.length, index]);

  // Reseta a seleção ao trocar de tarefa (manual ou porque a atual saiu da
  // lista depois de justificada) — não pode "vazar" a escolha de uma tarefa
  // pra outra.
  const currentTask = pending[Math.min(index, pending.length - 1)] ?? null;
  useEffect(() => {
    setSelectedReason(null);
    setSelectedAction(null);
  }, [currentTask?.id_tarefa]);

  if (pending.length === 0 || !currentTask) return null;

  async function handleConfirm() {
    if (!selectedReason || !selectedAction || !currentTask) return;
    setSaving(true);
    try {
      const db = await getDb();
      try { await db.execute("ALTER TABLE tarefas ADD COLUMN andamento_acao TEXT"); } catch { /* exists */ }
      await db.execute(
        "UPDATE tarefas SET andamento_motivo = ?, andamento_acao = ?, andamento_motivo_registrado_em = ? WHERE id_tarefa = ?",
        [selectedReason, selectedAction, new Date().toISOString(), currentTask.id_tarefa],
      );
      toast.success(`Motivo e ação registrados — ${currentTask.empresa.toLowerCase()}`);
      pushAndamentoMotivoToCentral({
        id_tarefa: currentTask.id_tarefa,
        motivo: selectedReason,
        acao: selectedAction,
      });
      onRefresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-xl border px-3 py-2.5 flex flex-col gap-2 bg-warning/8 border-warning/40 transition-colors"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 rounded-full shrink-0 bg-warning" />
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />

        <p className="flex-1 text-sm font-medium min-w-0 truncate text-warning">
          Em andamento com vagas em aberto · {currentTask.empresa.toLowerCase()} · iniciou às{" "}
          {fmtTime(currentTask.data_tarefa)} — motivo pendente
        </p>

        {pending.length > 1 && (
          <span className="text-[11px] font-semibold text-muted-foreground shrink-0 tabular-nums">
            {index + 1}/{pending.length}
          </span>
        )}

        {pending.length > 1 && (
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + pending.length) % pending.length)}
              className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground transition-colors"
              aria-label="Tarefa anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % pending.length)}
              className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground transition-colors"
              aria-label="Próxima tarefa"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs shrink-0 text-warning hover:bg-warning/10"
          onClick={() => onFlashTask(currentTask.id_tarefa)}
        >
          Ver →
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        <span className="text-[11px] font-semibold text-muted-foreground w-full">Motivo:</span>
        {REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            onClick={() => setSelectedReason(reason)}
            disabled={saving}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
              selectedReason === reason
                ? "bg-warning text-warning-foreground border-warning font-semibold"
                : "bg-card border-warning/30 text-foreground hover:bg-warning/10"
            }`}
          >
            {reason}
          </button>
        ))}
      </div>

      {selectedReason && (
        <div className="flex flex-wrap items-center gap-1.5 pl-5">
          <span className="text-[11px] font-semibold text-muted-foreground w-full">
            Ação tomada:
          </span>
          {acoes.map((acao) => (
            <button
              key={acao}
              type="button"
              onClick={() => setSelectedAction(acao)}
              disabled={saving}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                selectedAction === acao
                  ? "bg-warning text-warning-foreground border-warning font-semibold"
                  : "bg-card border-warning/30 text-foreground hover:bg-warning/10"
              }`}
            >
              {acao}
            </button>
          ))}
          <Button
            size="sm"
            className="h-7 text-xs ml-1"
            disabled={!selectedAction || saving}
            onClick={handleConfirm}
          >
            <Check className="h-3 w-3" /> Confirmar
          </Button>
        </div>
      )}
    </div>
  );
}
