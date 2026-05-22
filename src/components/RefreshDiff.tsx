import { useState } from "react";
import {
  UserPlus,
  UserMinus,
  Copy,
  Check,
  MessageSquareWarning,
  ArrowRight,
  Phone,
  MessageCircle,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { type TaskWithChapas } from "./TaskCard";
import { normalize } from "@/lib/normalize";
import { fmtTime, parseTaskDate } from "@/lib/datetime";
import { toast } from "sonner";

/* ─────────────────────────────────────────── types ── */

export type DiffChapa = {
  nome: string;
  telefone: string;
  taskId: number;
  empresa: string;
  dataTarefa: string;
  cidadeUf: string | null;
};

export type DiffResult = {
  added: DiffChapa[];
  removed: DiffChapa[];
  detectedAt: number;
  newTaskIds: Set<number>;
};

const OCCURRENCE_TYPES = [
  "Não deu retorno ao FUP",
  "Cancelamento tardio",
  "Não consta na validação do cliente",
  "Abandono de tarefa",
  "Bloqueio por parte do cliente",
  "Cliente dispensou o chapa",
  "Base indisponível",
] as const;

type OccurrenceType = (typeof OCCURRENCE_TYPES)[number];

/* ─────────────────────────────────────── compute diff ── */

export function chapKey(taskId: number, nome: string) {
  return `${taskId}::${normalize(nome)}`;
}

export function computeRefreshDiff(
  prev: TaskWithChapas[],
  next: TaskWithChapas[],
): DiffResult {
  // prev active chapas (not removido)
  const prevActive = new Map<string, DiffChapa>();
  const prevTaskIds = new Set<number>();
  prev.forEach((task) => {
    task.chapas.forEach((c) => {
      if (!c.nome_chapa || c.status_contato === "removido") return;
      prevTaskIds.add(task.id_tarefa);
      prevActive.set(chapKey(task.id_tarefa, c.nome_chapa), {
        nome: c.nome_chapa,
        telefone: c.telefone_chapa ?? "",
        taskId: task.id_tarefa,
        empresa: task.empresa,
        dataTarefa: task.data_tarefa,
        cidadeUf: task.cidade_uf ?? null,
      });
    });
  });

  // next: ALL chapas (any status) — to detect true external removals
  const nextAll = new Map<string, boolean>();
  const nextActive = new Map<string, DiffChapa>();
  next.forEach((task) => {
    task.chapas.forEach((c) => {
      if (!c.nome_chapa) return;
      const k = chapKey(task.id_tarefa, c.nome_chapa);
      nextAll.set(k, true);
      if (c.status_contato !== "removido") {
        nextActive.set(k, {
          nome: c.nome_chapa,
          telefone: c.telefone_chapa ?? "",
          taskId: task.id_tarefa,
          empresa: task.empresa,
          dataTarefa: task.data_tarefa,
          cidadeUf: task.cidade_uf ?? null,
        });
      }
    });
  });

  // Added: in nextActive but not in prevActive at all
  const added: DiffChapa[] = [];
  nextActive.forEach((v, k) => {
    if (!prevActive.has(k)) added.push(v);
  });

  // Removed: was in prevActive but completely absent from next (not even as "removido")
  // If they appear as "removido" in nextAll, that was a user action — skip
  const removed: DiffChapa[] = [];
  prevActive.forEach((v, k) => {
    if (!nextAll.has(k)) removed.push(v);
  });

  // Truly new tasks: their task ID had no active chapas in prev at all
  const newTaskIds = new Set<number>();
  added.forEach((c) => {
    if (!prevTaskIds.has(c.taskId)) newTaskIds.add(c.taskId);
  });

  return { added, removed, detectedAt: Date.now(), newTaskIds };
}

/* ───────────────────────────────────── group helpers ── */

type TaskGroup<T> = {
  taskId: number;
  empresa: string;
  dataTarefa: string;
  items: T[];
};

function groupByTask<T extends DiffChapa>(items: T[]): TaskGroup<T>[] {
  const map = new Map<number, TaskGroup<T>>();
  items.forEach((c) => {
    if (!map.has(c.taskId)) {
      map.set(c.taskId, { taskId: c.taskId, empresa: c.empresa, dataTarefa: c.dataTarefa, items: [] });
    }
    map.get(c.taskId)!.items.push(c);
  });
  return Array.from(map.values());
}

/* ─────────────────────────────────── clipboard helper ── */

async function copyText(text: string, label = "Copiado") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

/* ──────────────────────────────── PhoneLine sub-component ── */

function PhoneLine({ telefone, nome }: { telefone: string; nome: string }) {
  const [copied, setCopied] = useState(false);
  if (!telefone) return <span className="text-[11px] text-muted-foreground/50">sem número</span>;
  const digits = telefone.replace(/\D/g, "");
  const fmt =
    digits.length === 11
      ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
      : digits.length === 10
      ? `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
      : telefone;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title="Copiar número"
        onClick={() => {
          copyText(digits, `Número de ${nome} copiado`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Phone className="h-3 w-3 opacity-40" />}
        {fmt}
      </button>
      <a
        href={`https://wa.me/55${digits}`}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp"
        className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-success/15 text-muted-foreground hover:text-success transition-colors"
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}


/* ────────────────────────────────── RemovedGroup component ── */

function RemovedGroup({
  group,
  onFlashTask,
}: {
  group: TaskGroup<DiffChapa>;
  onFlashTask: (id: number) => void;
}) {
  const [occurrenceType, setOccurrenceType] = useState<OccurrenceType | null>(null);
  const [created, setCreated] = useState<boolean | null>(null);

  const now = Date.now();
  const taskStarted = parseTaskDate(group.dataTarefa, group.items[0]?.cidadeUf).getTime() <= now;
  const likelyClientValidation = taskStarted && group.items.length >= 3;

  function buildMessage(): string {
    if (!occurrenceType) return "";
    const header = `Empresa: ${group.empresa}\nTarefa: ${fmtTime(group.dataTarefa)}`;
    if (group.items.length === 1) {
      const c = group.items[0];
      const tel = c.telefone
        ? c.telefone.replace(/\D/g, "")
        : "sem número";
      return `${header}\n\nNome: ${c.nome}\nTelefone: ${tel}\nOcorrência: ${occurrenceType}`;
    }
    const lines = group.items
      .map((c) => {
        const tel = c.telefone ? c.telefone.replace(/\D/g, "") : "sem número";
        return `${c.nome} — ${tel}`;
      })
      .join("\n");
    return `${header}\n\n${lines}\n\nOcorrência: ${occurrenceType}`;
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Task header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-foreground capitalize truncate block">
            {group.empresa.toLowerCase()}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {fmtTime(group.dataTarefa)}
            {taskStarted && (
              <span className="ml-1.5 text-warning font-medium">· já iniciada</span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onFlashTask(group.taskId)}
          title="Ir para a tarefa"
          className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Likely client validation banner */}
      {likelyClientValidation && (
        <div className="px-3 py-2 bg-info/8 border-b border-info/20 flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-info shrink-0" />
          <p className="text-[11px] font-medium text-info">
            {group.items.length} chapas removidos após início — provável validação do cliente
          </p>
        </div>
      )}

      {/* Chapa list */}
      <div className="px-3 py-2 space-y-2">
        {group.items.map((c, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-foreground capitalize truncate flex-1">
              {c.nome.toLowerCase()}
            </span>
            <PhoneLine telefone={c.telefone} nome={c.nome} />
          </div>
        ))}
      </div>

      {/* Occurrence section */}
      <div className="border-t border-border px-3 py-3 space-y-3 bg-muted/20">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <MessageSquareWarning className="h-3.5 w-3.5" /> Ocorrência no Meu Chapa
        </p>

        {/* Occurrence type selector */}
        <div className="flex flex-wrap gap-1.5">
          {OCCURRENCE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setOccurrenceType(type)}
              className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                occurrenceType === type
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Occurrence created toggle */}
          <button
            type="button"
            onClick={() => setCreated((v) => (v === true ? null : true))}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
              created === true
                ? "bg-success/15 border-success/40 text-success"
                : "border-border text-muted-foreground hover:border-warning/50 hover:text-warning"
            }`}
          >
            {created === true ? (
              <><Check className="h-3 w-3" /> Ocorrência criada</>
            ) : (
              <><ShieldAlert className="h-3 w-3" /> Marcar como criada</>
            )}
          </button>

          {/* Copy message */}
          <Button
            size="sm"
            variant="outline"
            disabled={!occurrenceType}
            onClick={() => copyText(buildMessage(), "Mensagem copiada")}
            className="h-7 gap-1.5 text-[11px]"
          >
            <Copy className="h-3 w-3" />
            Copiar mensagem
          </Button>
        </div>

        {/* Message preview */}
        {occurrenceType && (
          <pre className="text-[10px] font-mono text-muted-foreground bg-muted/60 rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed border border-border">
            {buildMessage()}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────── main component ── */

type Props = {
  diff: DiffResult;
  open: boolean;
  onClose: () => void;
  onFlashTask: (taskId: number) => void;
};

export function RefreshDiff({ diff, open, onClose, onFlashTask }: Props) {
  const addedGroups = groupByTask(diff.added);
  const removedGroups = groupByTask(diff.removed);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:w-[520px] sm:max-w-[95vw] p-0 flex flex-col overflow-hidden"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <SheetTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            Alterações detectadas
            <span className="text-[11px] font-normal text-muted-foreground">
              {diff.removed.length > 0 && `${diff.removed.length} removido${diff.removed.length !== 1 ? "s" : ""}`}
              {diff.removed.length > 0 && diff.added.length > 0 && " · "}
              {diff.added.length > 0 && `${diff.added.length} novo${diff.added.length !== 1 ? "s" : ""}`}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* ── Removed section ── */}
          {removedGroups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <UserMinus className="h-4 w-4 text-destructive shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">
                  Chapas removidos externamente
                </h3>
                <span className="ml-auto text-[11px] text-muted-foreground bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
                  {diff.removed.length} chapa{diff.removed.length !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Estes chapas sumiram das tarefas após a atualização — provavelmente foram removidos no Meu Chapa ou pelo cliente. Crie a ocorrência conforme necessário.
              </p>
              <div className="space-y-3">
                {removedGroups.map((g) => (
                  <RemovedGroup key={g.taskId} group={g} onFlashTask={onFlashTask} />
                ))}
              </div>
            </div>
          )}

          {/* ── Added section ── */}
          {addedGroups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-success shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">
                  Novos chapas adicionados
                </h3>
                <span className="ml-auto text-[11px] text-success bg-success/10 px-2 py-0.5 rounded-full font-medium">
                  {diff.added.length} chapa{diff.added.length !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Estes chapas apareceram nas tarefas após a atualização. Verifique a confirmação e envie o FUP se necessário.
              </p>
              <div className="space-y-2">
                {addedGroups.map((group) => {
                  return (
                  <div key={group.taskId} className="rounded-xl border overflow-hidden border-success/30">
                    {/* Task header */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b bg-success/5 border-success/20">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-foreground capitalize truncate block">
                          {group.empresa.toLowerCase()}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {fmtTime(group.dataTarefa)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onFlashTask(group.taskId)}
                        title="Ir para a tarefa"
                        className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Chapas */}
                    <div className="px-3 py-2 space-y-2">
                      {group.items.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 min-w-0">
                          <span className="text-sm text-foreground capitalize truncate flex-1">
                            {c.nome.toLowerCase()}
                          </span>
                          <PhoneLine telefone={c.telefone} nome={c.nome} />
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-3 border-t border-border bg-muted/30 flex justify-end">
          <Button size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
