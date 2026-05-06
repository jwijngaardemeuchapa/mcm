import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  MessageSquare,
  Phone,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  Download,
  Copy,
  Plus,
  Moon,
  StickyNote,
  BadgeCheck,
  ExternalLink,
  MoreHorizontal,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "./StatusBadge";
import { FillRateBar } from "./FillRateBar";
import { OvernightBadge } from "./OvernightBadge";
import { ValidationStepper, type ValidationStep } from "./ValidationStepper";
import { ValidationPanel } from "./ValidationPanel";
import { ObservationsPanel } from "./ObservationsPanel";
import { fmtTime, fmtDateTime, fmtSP } from "@/lib/datetime";
import { useUndo } from "@/lib/undo";

export type TaskWithChapas = {
  id_tarefa: number;
  data_tarefa: string;
  empresa: string;
  cidade_uf: string | null;
  status_tarefa: string;
  quantidade_chapas: number;
  is_overnight?: boolean | null;
  validacao_status?: string | null;
  data_validacao_recebida?: string | null;
  data_upload_meu_chapa?: string | null;
  obs_validacao?: string | null;
  observacoes?: string | null;
  observacoes_updated_at?: string | null;
  chapas: Array<{
    id: string;
    nome_chapa: string | null;
    telefone_chapa: string | null;
    cpf: string | null;
    status_contato: string;
    canal_contato?: string | null;
    validacao_presenca?: string | null;
    data_validacao?: string | null;
  }>;
  fup_log: Array<{ id: string; data_disparo: string; canal: string; observacao: string | null }>;
  urgent: boolean;
  continuingFromYesterday?: boolean;
};

const canalLabel: Record<string, string> = {
  whatsapp_web: "WhatsApp",
  umbler_talk: "Umbler",
  ligacao_3c: "3C",
};
const canalLabelLong: Record<string, string> = {
  whatsapp_web: "WhatsApp Web",
  umbler_talk: "Umbler Talk",
  ligacao_3c: "Ligação 3C",
};

function companyFilenameSlug(empresa: string): string {
  const cleaned = (empresa || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const pick = words.slice(0, 2).join("");
  return (pick || "tarefa").toLowerCase();
}

function csvExportKey(id: number) {
  return `csv_exported_task_${id}`;
}

function getCsvExportedAt(id: number): string | null {
  try {
    return localStorage.getItem(csvExportKey(id));
  } catch {
    return null;
  }
}

function formatPhone(s: string | null): string {
  if (!s) return "";
  const d = s.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
}

export function TaskCard({
  task,
  onRefresh,
  forceCollapse,
  matchHighlight,
}: {
  task: TaskWithChapas;
  onRefresh: () => void;
  forceCollapse?: boolean | null;
  matchHighlight?: boolean;
}) {
  const [removalTarget, setRemovalTarget] = useState<(typeof task.chapas)[number] | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [removalMsg, setRemovalMsg] = useState<string | null>(null);
  const [editPhoneTarget, setEditPhoneTarget] = useState<(typeof task.chapas)[number] | null>(null);
  const [editPhoneValue, setEditPhoneValue] = useState("");
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [fupOpen, setFupOpen] = useState(false);
  const [newFupCanal, setNewFupCanal] = useState("whatsapp_web");
  const [newFupObs, setNewFupObs] = useState("");
  const { push } = useUndo();

  const confirmed = task.chapas.filter((c) => c.status_contato === "confirmado").length;

  type ChapaRow = (typeof task.chapas)[number] & {
    canal_contato?: string | null;
    data_contato?: string | null;
    data_remocao?: string | null;
    motivo_remocao?: string | null;
  };

  async function updateChapaWithUndo(chapa: ChapaRow, patch: Record<string, unknown>, label: string) {
    const prev: Record<string, unknown> = {};
    Object.keys(patch).forEach((k) => {
      prev[k] = (chapa as Record<string, unknown>)[k] ?? null;
    });
    const { error } = await supabase.from("chapas").update(patch as never).eq("id", chapa.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    push({
      label,
      revert: async () => {
        const { error: e } = await supabase.from("chapas").update(prev as never).eq("id", chapa.id);
        if (e) throw new Error(e.message);
      },
      onReverted: onRefresh,
    });
    onRefresh();
  }

  function markContact(chapa: ChapaRow, canal: string) {
    updateChapaWithUndo(
      chapa,
      { canal_contato: canal, data_contato: new Date().toISOString() },
      `contato ${canalLabelLong[canal]} — ${chapa.nome_chapa ?? "chapa"}`,
    );
    toast.success(`Contato registrado: ${canalLabelLong[canal]}`);
  }

  async function confirmRemoval() {
    if (!removalTarget) return;
    const target = removalTarget as ChapaRow;
    await updateChapaWithUndo(
      target,
      {
        status_contato: "removido",
        data_remocao: new Date().toISOString(),
        motivo_remocao: removalReason || null,
      },
      `remoção de ${target.nome_chapa ?? "chapa"}`,
    );
    const msg = `⚠️ Remoção sinalizada — Tarefa #${task.id_tarefa} | ${task.empresa} | ${fmtTime(task.data_tarefa)}
Chapa removido: ${target.nome_chapa ?? "(sem nome)"} | Tel: ${target.telefone_chapa ?? "-"}
Motivo: ${removalReason || "(não informado)"}
Precisamos de 1 substituto para esta tarefa.`;
    setRemovalMsg(msg);
    setRemovalTarget(null);
    setRemovalReason("");
  }

  async function savePhone() {
    if (!editPhoneTarget) return;
    await updateChapaWithUndo(
      editPhoneTarget as ChapaRow,
      { telefone_chapa: editPhoneValue || null },
      `telefone de ${editPhoneTarget.nome_chapa ?? "chapa"}`,
    );
    setEditPhoneTarget(null);
    setEditPhoneValue("");
    toast.success("Telefone atualizado");
  }

  async function confirmAll() {
    const targets = task.chapas.filter(
      (c) => c.nome_chapa && c.status_contato === "pendente",
    );
    if (targets.length === 0) {
      setConfirmAllOpen(false);
      return;
    }
    const ids = targets.map((c) => c.id);
    const prev = targets.map((c) => ({ id: c.id, status_contato: c.status_contato }));
    const { error } = await supabase
      .from("chapas")
      .update({ status_contato: "confirmado", data_contato: new Date().toISOString() } as never)
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    push({
      label: `confirmar ${ids.length} chapas — #${task.id_tarefa}`,
      revert: async () => {
        for (const p of prev) {
          await supabase.from("chapas").update({ status_contato: p.status_contato } as never).eq("id", p.id);
        }
      },
      onReverted: onRefresh,
    });
    setConfirmAllOpen(false);
    toast.success(`${ids.length} chapa(s) confirmado(s)`);
    onRefresh();
  }

  function exportCSV() {
    const rows = task.chapas
      .filter((c) => c.status_contato !== "removido" && c.nome_chapa)
      .map((c) => `${c.nome_chapa};${c.telefone_chapa ?? ""}`);
    const csv = "Nome;Telefone\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tarefa_${task.id_tarefa}_chapas.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyList() {
    const lines = task.chapas
      .filter((c) => c.status_contato !== "removido" && c.nome_chapa)
      .map((c) => `${c.nome_chapa} - ${c.cpf ?? "(sem CPF cadastrado)"}`);
    navigator.clipboard.writeText("Nome - CPF\n" + lines.join("\n"));
    toast.success("Copiado!");
  }

  async function registerFup() {
    const { data, error } = await supabase
      .from("fup_log")
      .insert({ id_tarefa: task.id_tarefa, canal: newFupCanal, observacao: newFupObs || null })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    const fupId = (data as { id: string }).id;
    push({
      label: `FUP ${canalLabelLong[newFupCanal] ?? newFupCanal}`,
      revert: async () => {
        const { error: e } = await supabase.from("fup_log").delete().eq("id", fupId);
        if (e) throw new Error(e.message);
      },
      onReverted: onRefresh,
    });
    setNewFupObs("");
    toast.success("FUP registrado");
    onRefresh();
  }

  const taskStarted = new Date(task.data_tarefa).getTime() <= Date.now();
  const vStatus = (task.validacao_status ?? "aguardando") as ValidationStep;
  const isOvernight = !!task.is_overnight;
  const continuing = !!task.continuingFromYesterday;

  const totalChapas = task.chapas.length;
  const confirmedAll = totalChapas > 0 && task.chapas.every((c) => c.status_contato === "confirmado");
  const realChapas = task.chapas.filter((c) => c.nome_chapa);
  const fullyValidated =
    realChapas.length > 0 &&
    realChapas.every(
      (c) => c.validacao_presenca === "presente" || c.validacao_presenca === "ausente",
    );
  const isDone = confirmedAll && vStatus === "subido_meu_chapa";

  // "Confirmar todos" eligibility: all real chapas pendente AND task starts within 2 hours
  const allPending =
    realChapas.length > 0 &&
    realChapas.every((c) => c.status_contato === "pendente");
  const minutesUntilStart = (new Date(task.data_tarefa).getTime() - Date.now()) / 60_000;
  const eligibleConfirmAll = allPending && minutesUntilStart <= 120;

  const initiallyDoneRef = useRef(isDone);
  const [userExpanded, setUserExpanded] = useState(false);
  const [manualCollapsed, setManualCollapsed] = useState<boolean>(() => fullyValidated && !isDone);
  const [animateCollapse, setAnimateCollapse] = useState(false);
  const prevDoneRef = useRef(isDone);
  const prevValidatedRef = useRef(fullyValidated);
  useEffect(() => {
    if (!prevDoneRef.current && isDone && !initiallyDoneRef.current) {
      setAnimateCollapse(true);
      const t = setTimeout(() => setAnimateCollapse(false), 350);
      prevDoneRef.current = isDone;
      return () => clearTimeout(t);
    }
    prevDoneRef.current = isDone;
  }, [isDone]);
  useEffect(() => {
    if (!prevValidatedRef.current && fullyValidated && !isDone) {
      setManualCollapsed(true);
    }
    prevValidatedRef.current = fullyValidated;
  }, [fullyValidated, isDone]);

  useEffect(() => {
    if (forceCollapse === undefined || forceCollapse === null) return;
    setManualCollapsed(forceCollapse);
    if (isDone) setUserExpanded(!forceCollapse);
  }, [forceCollapse, isDone]);

  const showMinimized = isDone && !userExpanded;
  const hasObs = !!(task.observacoes && task.observacoes.trim().length > 0);

  if (showMinimized) {
    return (
      <div
        data-task-card={task.id_tarefa}
        className={`bg-card rounded-xl border border-border border-l-4 border-l-success shadow-card overflow-hidden transition-all duration-200 ${
          animateCollapse ? "animate-fade-in" : ""
        }`}
      >
        <div className="min-h-[44px] px-4 py-2 flex items-center gap-3">
          {isOvernight && <Moon className="h-4 w-4 text-overnight shrink-0" aria-label="Overnight" />}
          <BadgeCheck className="h-4 w-4 text-success shrink-0" aria-label="Validada" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm text-muted-foreground truncate capitalize">
              {task.empresa.toLowerCase()} — {fmtTime(task.data_tarefa)}
            </span>
          </div>
          <span className="text-xs font-semibold text-success shrink-0">
            {totalChapas}/{totalChapas} ✅
          </span>
          <span className="text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-success/15 text-success shrink-0 inline-flex items-center gap-1">
            <BadgeCheck className="h-3 w-3" /> 100% Validada
          </span>
          {hasObs && (
            <StickyNote className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Contém observações" />
          )}
          <button
            onClick={() => setUserExpanded(true)}
            className="shrink-0 min-h-[44px] min-w-[44px] rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors"
            aria-label="Expandir tarefa"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-task-card={task.id_tarefa}
      className={`bg-card rounded-xl border shadow-card overflow-hidden transition-shadow ${
        isDone
          ? "border-success/60 border-l-4 border-l-success ring-1 ring-success/20"
          : fullyValidated
          ? "border-success/50 border-l-4 border-l-success ring-1 ring-success/15"
          : continuing
          ? "border-overnight/60 ring-2 ring-overnight/30"
          : isOvernight
          ? "border-overnight/40 ring-1 ring-overnight/20"
          : task.urgent
          ? "border-destructive/50 ring-1 ring-destructive/20"
          : "border-border"
      } ${matchHighlight ? "ring-2 ring-primary shadow-elevated" : ""} ${isDone && userExpanded ? "animate-fade-in" : ""}`}
    >
      <div
        className={`p-4 flex flex-wrap items-center gap-3 justify-between border-b border-border bg-card ${
          isOvernight
            ? "bg-gradient-to-r from-overnight-soft to-card"
            : "bg-gradient-to-r from-primary-soft/60 to-card"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`text-center rounded-lg px-3 py-2 font-display shrink-0 ${
              isOvernight ? "bg-overnight text-overnight-foreground" : "bg-primary text-primary-foreground"
            }`}
          >
            <div className="text-xl font-bold leading-none">{fmtTime(task.data_tarefa)}</div>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <a
                href={`https://app.meu-chapa.net/admin/edit-task/${task.id_tarefa}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] uppercase tracking-wider opacity-90 hover:opacity-100 hover:underline inline-flex items-center gap-0.5"
                title="Abrir tarefa no Meu Chapa"
              >
                #{task.id_tarefa}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(String(task.id_tarefa));
                  toast.success(`Código copiado: #${task.id_tarefa}`);
                }}
                className="opacity-70 hover:opacity-100 p-0.5 rounded hover:bg-white/10"
                title="Copiar código da tarefa"
                aria-label="Copiar código da tarefa"
              >
                <Copy className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground truncate capitalize">
                {task.empresa.toLowerCase()}
              </span>
              {isOvernight && <OvernightBadge />}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {task.cidade_uf ?? "—"}
              {continuing && (
                <span className="ml-2 text-overnight font-semibold">
                  · Início: ontem às {fmtTime(task.data_tarefa)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {fullyValidated && (
            <span
              className="inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-success text-success-foreground shadow-sm"
              title="Todas as presenças foram marcadas"
            >
              <BadgeCheck className="h-3.5 w-3.5" /> 100% Validada
            </span>
          )}
          {taskStarted ? (
            <ValidationStepper status={vStatus} />
          ) : (
            <StatusBadge status={task.status_tarefa} />
          )}
          <FillRateBar confirmed={confirmed} requested={task.quantidade_chapas || task.chapas.length} />
          {eligibleConfirmAll && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs border-success/50 text-success hover:bg-success/10"
              onClick={() => setConfirmAllOpen(true)}
            >
              <Check className="h-3.5 w-3.5" /> Confirmar todos
            </Button>
          )}
          {isDone && userExpanded ? (
            <button
              onClick={() => setUserExpanded(false)}
              className="min-h-[44px] min-w-[44px] rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
              aria-label="Minimizar tarefa"
              title="Minimizar"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          ) : !isDone ? (
            <button
              onClick={() => setManualCollapsed((v) => !v)}
              className="min-h-[44px] min-w-[44px] rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
              aria-label={manualCollapsed ? "Expandir tarefa" : "Colapsar tarefa"}
              title={manualCollapsed ? "Expandir" : "Colapsar"}
            >
              {manualCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          ) : null}
        </div>
      </div>

      {continuing && !manualCollapsed && (
        <div className="px-4 py-2 text-xs font-semibold text-warning bg-warning/15 border-b border-warning/30">
          ⚠️ Esta tarefa está em andamento desde ontem ({fmtSP(task.data_tarefa, "dd/MM 'às' HH:mm")})
        </div>
      )}

      {fullyValidated && !isDone && !manualCollapsed && (
        <div className="px-4 py-2 text-xs font-semibold bg-success/15 border-b border-success/40 text-success flex items-center gap-2 animate-fade-in">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          <span>
            ✅ Todas as presenças validadas
            {vStatus === "validacao_recebida"
              ? " · pronto para subir no Meu Chapa"
              : vStatus === "pendente"
              ? " · marque como recebida do cliente"
              : ""}
          </span>
        </div>
      )}

      {!manualCollapsed && (
        <>
          <div className="divide-y divide-border">
            {task.chapas.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground italic">
                Vaga em captação — nenhum chapa alocado
              </div>
            )}
            {task.chapas.map((c) => (
              <ChapaRowView
                key={c.id}
                chapa={c}
                onContact={markContact}
                onConfirm={() =>
                  updateChapaWithUndo(
                    c,
                    { status_contato: "confirmado", canal_contato: c.canal_contato ?? null, data_contato: new Date().toISOString() },
                    `confirmar ${c.nome_chapa ?? "chapa"}`,
                  )
                }
                onNoResponse={() =>
                  updateChapaWithUndo(
                    c,
                    { status_contato: "nao_respondeu" },
                    `não respondeu — ${c.nome_chapa ?? "chapa"}`,
                  )
                }
                onRemove={() => setRemovalTarget(c)}
                onEditPhone={() => {
                  setEditPhoneTarget(c);
                  setEditPhoneValue(c.telefone_chapa ?? "");
                }}
                onUndoOutcome={() =>
                  updateChapaWithUndo(
                    c,
                    { status_contato: "pendente" },
                    `reabrir ${c.nome_chapa ?? "chapa"}`,
                  )
                }
              />
            ))}
          </div>

          <ObservationsPanel
            id_tarefa={task.id_tarefa}
            empresa={task.empresa}
            data_tarefa={task.data_tarefa}
            observacoes={task.observacoes ?? null}
            observacoes_updated_at={task.observacoes_updated_at ?? null}
          />

          <Collapsible open={fupOpen} onOpenChange={setFupOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full px-4 py-2 bg-muted/50 hover:bg-muted flex items-center justify-between text-xs font-semibold text-muted-foreground border-t border-border transition-colors">
                <span>FUPs disparados ({task.fup_log.length})</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${fupOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="p-4 bg-muted/30 space-y-3">
              {task.fup_log.length === 0 && (
                <div className="text-xs text-muted-foreground italic">Nenhum FUP registrado ainda</div>
              )}
              {task.fup_log.map((f) => (
                <div key={f.id} className="text-xs flex items-center gap-3 py-1">
                  <span className="font-semibold text-foreground">{canalLabelLong[f.canal] ?? f.canal}</span>
                  <span className="text-muted-foreground">{fmtDateTime(f.data_disparo)}</span>
                  {f.observacao && <span className="text-muted-foreground italic">— {f.observacao}</span>}
                </div>
              ))}
              <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border">
                <Select value={newFupCanal} onValueChange={setNewFupCanal}>
                  <SelectTrigger className="h-9 w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp_web">WhatsApp Web</SelectItem>
                    <SelectItem value="umbler_talk">Umbler Talk</SelectItem>
                    <SelectItem value="ligacao_3c">Ligação 3C</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Observação (opcional)"
                  value={newFupObs}
                  onChange={(e) => setNewFupObs(e.target.value)}
                  className="h-9 flex-1 min-w-[180px]"
                />
                <Button size="sm" onClick={registerFup} className="h-9 gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Registrar FUP
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="px-4 py-3 flex gap-2 border-t border-border bg-card">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5" /> Exportar CSV
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={copyList}>
              <Copy className="h-3.5 w-3.5" /> Copiar Lista
            </Button>
          </div>
        </>
      )}

      {realChapas.length > 0 && (
        <ValidationPanel
          id_tarefa={task.id_tarefa}
          chapas={task.chapas}
          validacao_status={vStatus}
          data_validacao_recebida={task.data_validacao_recebida ?? null}
          data_upload_meu_chapa={task.data_upload_meu_chapa ?? null}
          obs_validacao={task.obs_validacao ?? null}
          onRefresh={onRefresh}
        />
      )}

      {/* Removal dialog */}
      <Dialog open={!!removalTarget} onOpenChange={(o) => !o && setRemovalTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sinalizar remoção</DialogTitle>
            <DialogDescription>
              Confirma sinalização de remoção de <b className="capitalize">{removalTarget?.nome_chapa?.toLowerCase()}</b>? Isso irá gerar um aviso para captação de substituto.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo da remoção"
            value={removalReason}
            onChange={(e) => setRemovalReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovalTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmRemoval} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Confirmar remoção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit phone dialog */}
      <Dialog open={!!editPhoneTarget} onOpenChange={(o) => !o && setEditPhoneTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar telefone</DialogTitle>
            <DialogDescription>
              Atualizar telefone de <b className="capitalize">{editPhoneTarget?.nome_chapa?.toLowerCase()}</b>
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="(00) 00000-0000"
            value={editPhoneValue}
            onChange={(e) => setEditPhoneValue(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPhoneTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={savePhone}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm-all dialog */}
      <Dialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar todos os chapas</DialogTitle>
            <DialogDescription>
              Confirmar todos os{" "}
              {task.chapas.filter((c) => c.nome_chapa && c.status_contato === "pendente").length} chapas
              desta tarefa como presentes?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAllOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmAll} className="bg-success hover:bg-success/90 text-success-foreground">
              Confirmar todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Removal message dialog */}
      <Dialog open={!!removalMsg} onOpenChange={(o) => !o && setRemovalMsg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mensagem de remoção</DialogTitle>
            <DialogDescription>Copie e envie para o time de captação</DialogDescription>
          </DialogHeader>
          <pre className="whitespace-pre-wrap bg-muted p-3 rounded-md text-xs font-mono">{removalMsg}</pre>
          <DialogFooter>
            <Button
              onClick={() => {
                if (removalMsg) navigator.clipboard.writeText(removalMsg);
                toast.success("Mensagem copiada");
              }}
              className="gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar mensagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chapa row — 3-zone layout                                                 */
/* -------------------------------------------------------------------------- */

type RowProps = {
  chapa: TaskWithChapas["chapas"][number];
  onContact: (c: TaskWithChapas["chapas"][number], canal: string) => void;
  onConfirm: () => void;
  onNoResponse: () => void;
  onRemove: () => void;
  onEditPhone: () => void;
  onUndoOutcome: () => void;
};

function ChapaRowView({
  chapa,
  onContact,
  onConfirm,
  onNoResponse,
  onRemove,
  onEditPhone,
  onUndoOutcome,
}: RowProps) {
  const placeholder = !chapa.nome_chapa;
  const status = chapa.status_contato;
  const isConfirmed = status === "confirmado";
  const isNoResponse = status === "nao_respondeu";
  const isRemoved = status === "removido";

  // Light tint based on outcome
  const bg = isConfirmed
    ? "bg-[color-mix(in_srgb,hsl(var(--success))_6%,transparent)]"
    : isNoResponse
    ? "bg-[color-mix(in_srgb,hsl(var(--warning))_6%,transparent)]"
    : isRemoved
    ? "bg-destructive/5"
    : "";

  const channels: Array<{ key: string; Icon: typeof MessageCircle; label: string }> = [
    { key: "whatsapp_web", Icon: MessageCircle, label: "WhatsApp" },
    { key: "umbler_talk", Icon: MessageSquare, label: "Umbler" },
    { key: "ligacao_3c", Icon: Phone, label: "3C" },
  ];

  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${bg} ${placeholder ? "opacity-60 italic" : ""}`}>
      {/* Zone 1 — identity */}
      <div className="flex-1 min-w-0">
        {chapa.nome_chapa ? (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(chapa.nome_chapa!);
              toast.success(`Nome copiado: ${chapa.nome_chapa}`);
            }}
            className="text-[13px] font-medium text-foreground hover:text-primary hover:underline cursor-pointer text-left truncate block max-w-full capitalize"
            title="Clique para copiar o nome"
          >
            {chapa.nome_chapa.toLowerCase()}
          </button>
        ) : (
          <div className="text-[13px] font-medium text-foreground">Vaga em captação</div>
        )}
        {chapa.telefone_chapa ? (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(chapa.telefone_chapa!);
              toast.success(`Telefone copiado`);
            }}
            className="text-[12px] text-muted-foreground hover:text-primary hover:underline cursor-pointer tabular-nums"
            title="Clique para copiar"
          >
            {formatPhone(chapa.telefone_chapa)}
          </button>
        ) : (
          <div className="text-[12px] text-muted-foreground">—</div>
        )}
      </div>

      {/* Post-confirmation chip */}
      {isConfirmed ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-success/15 text-success border border-success/30 min-h-[28px]">
            <Check className="h-3.5 w-3.5" /> Confirmado
            {chapa.canal_contato && (
              <span className="font-normal opacity-80">· {canalLabel[chapa.canal_contato] ?? chapa.canal_contato}</span>
            )}
          </span>
          <RowMenu chapa={chapa} onRemove={onRemove} onEditPhone={onEditPhone} onUndoOutcome={onUndoOutcome} />
        </>
      ) : isNoResponse ? (
        <>
          <div className="flex flex-col items-end gap-0.5">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-warning/15 text-warning border border-warning/30 min-h-[28px]">
              <AlertTriangle className="h-3.5 w-3.5" /> Não respondeu
            </span>
            <button
              onClick={onRemove}
              className="text-[12px] text-destructive hover:underline font-medium"
            >
              Sinalizar remoção →
            </button>
          </div>
          <RowMenu chapa={chapa} onRemove={onRemove} onEditPhone={onEditPhone} onUndoOutcome={onUndoOutcome} />
        </>
      ) : isRemoved ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-destructive/15 text-destructive border border-destructive/40 line-through min-h-[28px]">
            <Trash2 className="h-3.5 w-3.5" /> Removido
          </span>
          <RowMenu chapa={chapa} onRemove={onRemove} onEditPhone={onEditPhone} onUndoOutcome={onUndoOutcome} />
        </>
      ) : !placeholder ? (
        <>
          {/* Zone 2 — channels */}
          <div className="flex items-center gap-1">
            {channels.map(({ key, Icon, label }) => {
              const used = chapa.canal_contato === key;
              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onContact(chapa, key)}
                      className={`inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md border text-[11px] font-medium transition-colors min-h-[28px] ${
                        used
                          ? "border-info/40 bg-info/10 text-info"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                      aria-label={`Registrar contato via ${label}`}
                    >
                      {used && <Check className="h-3 w-3" />}
                      <Icon className="h-3 w-3" />
                      <span>{label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Registrar contato via {label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {/* Zone 3 — outcome */}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 gap-1 text-[13px] bg-success hover:bg-success/90 text-success-foreground min-h-[28px]"
              onClick={onConfirm}
            >
              <Check className="h-3.5 w-3.5" /> Confirmado
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-[12px] text-muted-foreground hover:text-foreground min-h-[28px]"
              onClick={onNoResponse}
            >
              Não respondeu
            </Button>
            <RowMenu chapa={chapa} onRemove={onRemove} onEditPhone={onEditPhone} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function RowMenu({
  chapa,
  onRemove,
  onEditPhone,
  onUndoOutcome,
}: {
  chapa: TaskWithChapas["chapas"][number];
  onRemove: () => void;
  onEditPhone: () => void;
  onUndoOutcome?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Mais opções para ${chapa.nome_chapa ?? "chapa"}`}
          className="inline-flex items-center justify-center min-h-[28px] min-w-[28px] rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onUndoOutcome && (
          <DropdownMenuItem onClick={onUndoOutcome}>Reabrir / desfazer</DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onEditPhone}>Editar telefone</DropdownMenuItem>
        <DropdownMenuItem
          onClick={onRemove}
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          Sinalizar remoção
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
