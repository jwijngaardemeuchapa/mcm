import { useEffect, useRef, useState } from "react";
import { MessageCircle, MessageSquare, Phone, Check, X, Trash2, ChevronDown, ChevronUp, Download, Copy, Plus, Moon, StickyNote } from "lucide-react";
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

  const confirmed = task.chapas.filter((c) => c.status_contato === "confirmado").length;

  async function updateChapa(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("chapas").update(patch as never).eq("id", id);
    if (error) toast.error(error.message);
    else onRefresh();
  }

  function markContact(chapa: (typeof task.chapas)[number], canal: string) {
    updateChapa(chapa.id, { canal_contato: canal, data_contato: new Date().toISOString() });
    toast.success(`Contato registrado: ${canalLabel[canal]}`);
  }

  async function confirmRemoval() {
    if (!removalTarget) return;
    await supabase
      .from("chapas")
      .update({
        status_contato: "removido",
        data_remocao: new Date().toISOString(),
        motivo_remocao: removalReason || null,
      })
      .eq("id", removalTarget.id);

    const msg = `⚠️ Remoção sinalizada — Tarefa #${task.id_tarefa} | ${task.empresa} | ${fmtTime(task.data_tarefa)}
Chapa removido: ${removalTarget.nome_chapa ?? "(sem nome)"} | Tel: ${removalTarget.telefone_chapa ?? "-"}
Motivo: ${removalReason || "(não informado)"}
Precisamos de 1 substituto para esta tarefa.`;
    setRemovalMsg(msg);
    setRemovalTarget(null);
    setRemovalReason("");
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
    await supabase.from("fup_log").insert({
      id_tarefa: task.id_tarefa,
      canal: newFupCanal,
      observacao: newFupObs || null,
    });
    setNewFupObs("");
    toast.success("FUP registrado");
    onRefresh();
  }

  const taskStarted = new Date(task.data_tarefa).getTime() <= Date.now();
  const vStatus = (task.validacao_status ?? "aguardando") as ValidationStep;
  const isOvernight = !!task.is_overnight;
  const continuing = !!task.continuingFromYesterday;

  return (
    <div
      className={`bg-card rounded-xl border shadow-card overflow-hidden ${
        continuing
          ? "border-overnight/60 ring-2 ring-overnight/30"
          : isOvernight
          ? "border-overnight/40 ring-1 ring-overnight/20"
          : task.urgent
          ? "border-destructive/50 ring-1 ring-destructive/20"
          : "border-border"
      }`}
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
            <div className="text-[10px] uppercase tracking-wider opacity-90 mt-0.5">#{task.id_tarefa}</div>
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
          {taskStarted ? (
            <ValidationStepper status={vStatus} />
          ) : (
            <StatusBadge status={task.status_tarefa} />
          )}
          <FillRateBar confirmed={confirmed} requested={task.quantidade_chapas || task.chapas.length} />
        </div>
      </div>

      {continuing && (
        <div className="px-4 py-2 text-xs font-semibold text-warning-foreground bg-warning/20 border-b border-warning/30">
          ⚠️ Esta tarefa está em andamento desde ontem ({fmtSP(task.data_tarefa, "dd/MM 'às' HH:mm")})
        </div>
      )}

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
                <div className="text-xs text-muted-foreground">{c.telefone_chapa ?? "—"}</div>
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
                    onClick={() => updateChapa(c.id, { status_contato: "confirmado" })}
                  >
                    <Check className="h-3.5 w-3.5" /> Confirmado
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => updateChapa(c.id, { status_contato: "nao_respondeu" })}
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

      {taskStarted && vStatus !== "aguardando" && (
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
