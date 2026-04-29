import { useEffect, useRef, useState } from "react";
import { MessageCircle, MessageSquare, Phone, Check, X, Trash2, ChevronDown, ChevronUp, Download, Copy, Plus, Moon, StickyNote, BadgeCheck } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, ContactStatusBadge } from "./StatusBadge";
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
    validacao_presenca?: string | null;
    data_validacao?: string | null;
  }>;
  fup_log: Array<{ id: string; data_disparo: string; canal: string; observacao: string | null }>;
  urgent: boolean;
  /** When true, this card is rendered in the "started yesterday — still running" section */
  continuingFromYesterday?: boolean;
};

const canalLabel: Record<string, string> = {
  whatsapp_web: "WhatsApp Web",
  umbler_talk: "Umbler Talk",
  ligacao_3c: "Ligação 3C",
};

export function TaskCard({ task, onRefresh }: { task: TaskWithChapas; onRefresh: () => void }) {
  const [removalTarget, setRemovalTarget] = useState<(typeof task.chapas)[number] | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [removalMsg, setRemovalMsg] = useState<string | null>(null);
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
      `contato ${canalLabel[canal]} — ${chapa.nome_chapa ?? "chapa"}`,
    );
    toast.success(`Contato registrado: ${canalLabel[canal]}`);
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
      label: `FUP ${canalLabel[newFupCanal] ?? newFupCanal}`,
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

  // Animate collapse only when the card transitions to "done" during the session.
  const initiallyDoneRef = useRef(isDone);
  const [userExpanded, setUserExpanded] = useState(false);
  const [manualCollapsed, setManualCollapsed] = useState(false);
  const [animateCollapse, setAnimateCollapse] = useState(false);
  const prevDoneRef = useRef(isDone);
  useEffect(() => {
    if (!prevDoneRef.current && isDone && !initiallyDoneRef.current) {
      setAnimateCollapse(true);
      const t = setTimeout(() => setAnimateCollapse(false), 350);
      prevDoneRef.current = isDone;
      return () => clearTimeout(t);
    }
    prevDoneRef.current = isDone;
  }, [isDone]);

  const showMinimized = isDone && !userExpanded;
  const hasObs = !!(task.observacoes && task.observacoes.trim().length > 0);

  if (showMinimized) {
    return (
      <div
        className={`bg-card rounded-xl border border-border border-l-4 border-l-success shadow-card overflow-hidden ${
          animateCollapse ? "animate-fade-in" : ""
        }`}
      >
        <div className="h-12 px-4 flex items-center gap-3">
          {isOvernight && <Moon className="h-4 w-4 text-overnight shrink-0" aria-label="Overnight" />}
          <BadgeCheck className="h-4 w-4 text-success shrink-0" aria-label="Validada" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm text-muted-foreground truncate">
              {task.empresa} — {fmtTime(task.data_tarefa)}
            </span>
          </div>
          <span className="text-xs font-semibold text-success shrink-0">
            {totalChapas}/{totalChapas} ✅
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-success/15 text-success shrink-0 inline-flex items-center gap-1">
            <BadgeCheck className="h-3 w-3" /> 100% Validada
          </span>
          {hasObs && (
            <StickyNote className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Contém observações" />
          )}
          <button
            onClick={() => setUserExpanded(true)}
            className="shrink-0 h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
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
      className={`bg-card rounded-xl border shadow-card overflow-hidden ${
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
      } ${isDone && userExpanded ? "animate-fade-in" : ""}`}
    >

      <div
        className={`p-4 flex flex-wrap items-center gap-3 justify-between border-b border-border ${
          isOvernight
            ? "bg-gradient-to-r from-overnight-soft to-transparent"
            : "bg-gradient-to-r from-primary-soft/60 to-transparent"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`text-center rounded-lg px-3 py-2 font-display shrink-0 ${
              isOvernight ? "bg-overnight text-overnight-foreground" : "bg-primary text-primary-foreground"
            }`}
          >
            <div className="text-xl font-bold leading-none">{fmtTime(task.data_tarefa)}</div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(String(task.id_tarefa));
                toast.success(`Código copiado: #${task.id_tarefa}`);
              }}
              className="text-[10px] uppercase tracking-wider opacity-90 mt-0.5 hover:opacity-100 hover:underline cursor-pointer block w-full"
              title="Clique para copiar o código da tarefa"
            >
              #{task.id_tarefa}
            </button>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground truncate">{task.empresa}</span>
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
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-success text-success-foreground shadow-sm"
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
          {isDone && userExpanded ? (
            <button
              onClick={() => setUserExpanded(false)}
              className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
              aria-label="Minimizar tarefa"
              title="Minimizar"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          ) : !isDone ? (
            <button
              onClick={() => setManualCollapsed((v) => !v)}
              className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
              aria-label={manualCollapsed ? "Expandir tarefa" : "Colapsar tarefa"}
              title={manualCollapsed ? "Expandir" : "Colapsar"}
            >
              {manualCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          ) : null}
        </div>
      </div>

      {continuing && !manualCollapsed && (
        <div className="px-4 py-2 text-xs font-semibold text-warning-foreground bg-warning/20 border-b border-warning/30">
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

      {!manualCollapsed && (<>


      <div className="divide-y divide-border">
        {task.chapas.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground italic">
            Vaga em captação — nenhum chapa alocado
          </div>
        )}
        {task.chapas.map((c) => {
          const placeholder = !c.nome_chapa;
          const notResponded = c.status_contato === "nao_respondeu";
          return (
            <div
              key={c.id}
              className={`px-4 py-3 flex flex-wrap items-center gap-3 ${
                notResponded ? "bg-destructive/5" : ""
              } ${placeholder ? "opacity-60 italic" : ""}`}
            >
              <div className="flex-1 min-w-[180px]">
                <div className="font-medium text-sm text-foreground">
                  {c.nome_chapa ?? "Vaga em captação"}
                </div>
                {c.telefone_chapa ? (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(c.telefone_chapa!);
                      toast.success(`Telefone copiado: ${c.telefone_chapa}`);
                    }}
                    className="text-xs text-muted-foreground hover:text-primary hover:underline cursor-pointer"
                    title="Clique para copiar"
                  >
                    {c.telefone_chapa}
                  </button>
                ) : (
                  <div className="text-xs text-muted-foreground">—</div>
                )}
              </div>
              <ContactStatusBadge status={c.status_contato} />
              {!placeholder && c.status_contato !== "removido" && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => markContact(c, "whatsapp_web")}>
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => markContact(c, "umbler_talk")}>
                    <MessageSquare className="h-3.5 w-3.5" /> Umbler
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => markContact(c, "ligacao_3c")}>
                    <Phone className="h-3.5 w-3.5" /> 3C
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 bg-success hover:bg-success/90 text-success-foreground"
                    onClick={() => updateChapaWithUndo(c, { status_contato: "confirmado" }, `confirmar ${c.nome_chapa ?? "chapa"}`)}
                  >
                    <Check className="h-3.5 w-3.5" /> Confirmado
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => updateChapaWithUndo(c, { status_contato: "nao_respondeu" }, `não respondeu — ${c.nome_chapa ?? "chapa"}`)}
                  >
                    <X className="h-3.5 w-3.5" /> Não respondeu
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-destructive/60 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setRemovalTarget(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {taskStarted && (
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

      <ObservationsPanel
        id_tarefa={task.id_tarefa}
        empresa={task.empresa}
        data_tarefa={task.data_tarefa}
        observacoes={task.observacoes ?? null}
        observacoes_updated_at={task.observacoes_updated_at ?? null}
      />

      <Collapsible open={fupOpen} onOpenChange={setFupOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full px-4 py-2 bg-muted/50 hover:bg-muted flex items-center justify-between text-xs font-semibold text-muted-foreground border-t border-border">
            <span>📋 FUPs disparados ({task.fup_log.length})</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${fupOpen ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 bg-muted/30 space-y-3">
          {task.fup_log.length === 0 && (
            <div className="text-xs text-muted-foreground italic">Nenhum FUP registrado ainda</div>
          )}
          {task.fup_log.map((f) => (
            <div key={f.id} className="text-xs flex items-center gap-3 py-1">
              <span className="font-semibold text-foreground">{canalLabel[f.canal] ?? f.canal}</span>
              <span className="text-muted-foreground">{fmtDateTime(f.data_disparo)}</span>
              {f.observacao && <span className="text-muted-foreground italic">— {f.observacao}</span>}
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border">
            <Select value={newFupCanal} onValueChange={setNewFupCanal}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
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
      </>)}

      {/* Removal dialog */}
      <Dialog open={!!removalTarget} onOpenChange={(o) => !o && setRemovalTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sinalizar remoção</DialogTitle>
            <DialogDescription>
              Confirma sinalização de remoção de <b>{removalTarget?.nome_chapa}</b>? Isso irá gerar um aviso
              para captação de substituto.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo da remoção"
            value={removalReason}
            onChange={(e) => setRemovalReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovalTarget(null)}>Cancelar</Button>
            <Button onClick={confirmRemoval} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Confirmar remoção
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
