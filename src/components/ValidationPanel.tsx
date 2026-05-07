import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/datetime";
import { Check, X, Upload, ClipboardCheck, ChevronDown } from "lucide-react";
import type { ValidationStep } from "./ValidationStepper";
import { useUndo } from "@/lib/undo";

type Chapa = {
  id: string;
  nome_chapa: string | null;
  status_contato: string;
  validacao_presenca?: string | null;
  data_validacao?: string | null;
};

type Props = {
  id_tarefa: number;
  chapas: Chapa[];
  validacao_status: ValidationStep;
  data_validacao_recebida: string | null;
  data_upload_meu_chapa: string | null;
  obs_validacao: string | null;
  onRefresh: () => void;
};

export function ValidationPanel({
  id_tarefa,
  chapas,
  validacao_status,
  data_validacao_recebida,
  data_upload_meu_chapa,
  obs_validacao,
  onRefresh,
}: Props) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadObs, setUploadObs] = useState(obs_validacao ?? "");
  const [open, setOpen] = useState(false);
  const { push } = useUndo();

  const realChapas = chapas.filter((c) => c.nome_chapa && c.status_contato !== "removido");
  const presentes = realChapas.filter((c) => c.validacao_presenca === "presente").length;
  const ausentes = realChapas.filter((c) => c.validacao_presenca === "ausente").length;
  const pendentes = realChapas.length - presentes - ausentes;
  const anyValidated = presentes + ausentes > 0;

  async function setPresenca(chapa: Chapa, value: "presente" | "ausente") {
    const prevPresenca = chapa.validacao_presenca ?? null;
    const prevData = chapa.data_validacao ?? null;
    const { error } = await supabase
      .from("chapas")
      .update({ validacao_presenca: value, data_validacao: new Date().toISOString() })
      .eq("id", chapa.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    push({
      label: `presença de ${chapa.nome_chapa ?? "chapa"} (${value})`,
      revert: async () => {
        const { error: e } = await supabase
          .from("chapas")
          .update({ validacao_presenca: prevPresenca, data_validacao: prevData })
          .eq("id", chapa.id);
        if (e) throw new Error(e.message);
      },
      onReverted: onRefresh,
    });
    onRefresh();
  }

  async function setAllPresent() {
    const targets = realChapas.filter((c) => c.validacao_presenca !== "presente");
    if (targets.length === 0) return;
    const prev = targets.map((c) => ({
      id: c.id,
      validacao_presenca: c.validacao_presenca ?? null,
      data_validacao: c.data_validacao ?? null,
    }));
    const ids = targets.map((c) => c.id);
    const { error } = await supabase
      .from("chapas")
      .update({ validacao_presenca: "presente", data_validacao: new Date().toISOString() })
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    push({
      label: `validar ${ids.length} ajudante(s) como presente`,
      revert: async () => {
        for (const p of prev) {
          await supabase
            .from("chapas")
            .update({ validacao_presenca: p.validacao_presenca, data_validacao: p.data_validacao })
            .eq("id", p.id);
        }
      },
      onReverted: onRefresh,
    });
    toast.success(`${ids.length} ajudante(s) marcados como presente`);
    onRefresh();
  }

  async function markReceived() {
    const prevStatus = validacao_status;
    const prevDate = data_validacao_recebida;
    const { error } = await supabase
      .from("tarefas")
      .update({
        validacao_status: "validacao_recebida",
        data_validacao_recebida: new Date().toISOString(),
      })
      .eq("id_tarefa", id_tarefa);
    if (error) {
      toast.error(error.message);
      return;
    }
    push({
      label: "marcar validação recebida",
      revert: async () => {
        const { error: e } = await supabase
          .from("tarefas")
          .update({ validacao_status: prevStatus, data_validacao_recebida: prevDate })
          .eq("id_tarefa", id_tarefa);
        if (e) throw new Error(e.message);
      },
      onReverted: onRefresh,
    });
    toast.success("Validação recebida marcada");
    onRefresh();
  }

  async function confirmUpload() {
    const prevStatus = validacao_status;
    const prevUpload = data_upload_meu_chapa;
    const prevObs = obs_validacao;
    const { error } = await supabase
      .from("tarefas")
      .update({
        validacao_status: "subido_meu_chapa",
        data_upload_meu_chapa: new Date().toISOString(),
        obs_validacao: uploadObs || null,
      })
      .eq("id_tarefa", id_tarefa);
    if (error) {
      toast.error(error.message);
      return;
    }
    push({
      label: "subir no Meu Chapa",
      revert: async () => {
        const { error: e } = await supabase
          .from("tarefas")
          .update({
            validacao_status: prevStatus,
            data_upload_meu_chapa: prevUpload,
            obs_validacao: prevObs,
          })
          .eq("id_tarefa", id_tarefa);
        if (e) throw new Error(e.message);
      },
      onReverted: onRefresh,
    });
    toast.success("Marcado como subido no Meu Chapa");
    setUploadOpen(false);
    onRefresh();
  }

  const summaryBits: string[] = [];
  if (presentes > 0) summaryBits.push(`${presentes} presentes`);
  if (ausentes > 0) summaryBits.push(`${ausentes} ausentes`);
  if (pendentes > 0) summaryBits.push(`${pendentes} pendentes`);
  const summary = summaryBits.length > 0 ? summaryBits.join(" · ") : "nenhuma validação marcada";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full px-4 py-2 border-t border-border bg-accent/30 hover:bg-accent/50 flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-2 min-w-0 font-semibold text-foreground">
            <ClipboardCheck className="h-3.5 w-3.5 text-primary shrink-0" />
            Validações
            <span className="font-normal text-muted-foreground truncate">— {summary}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 py-3 border-t border-border bg-accent/30 space-y-3">
          {/* Step 1 — per-chapa presence */}
          {realChapas.length > 0 && (
            <div className="space-y-1.5">
              {realChapas.some((c) => c.validacao_presenca !== "presente") && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs border-success/50 text-success hover:bg-success/10"
                    onClick={setAllPresent}
                    title="Marca todos os ajudantes restantes como presentes"
                  >
                    <Check className="h-3.5 w-3.5" /> Validar todos como presentes
                  </Button>
                </div>
              )}
              {realChapas.map((c) => {
                const v = c.validacao_presenca;
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 flex-wrap bg-card rounded-md px-3 py-2 border border-border"
                  >
                    <div className="flex-1 min-w-[160px] text-sm font-medium">{c.nome_chapa}</div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant={v === "presente" ? "default" : "outline"}
                        className={`h-7 text-xs gap-1 ${
                          v === "presente" ? "bg-success hover:bg-success/90 text-success-foreground" : ""
                        }`}
                        onClick={() => setPresenca(c, "presente")}
                      >
                        <Check className="h-3 w-3" /> Presente
                      </Button>
                      <Button
                        size="sm"
                        variant={v === "ausente" ? "default" : "outline"}
                        className={`h-7 text-xs gap-1 ${
                          v === "ausente"
                            ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            : "border-destructive/40 text-destructive hover:bg-destructive/10"
                        }`}
                        onClick={() => setPresenca(c, "ausente")}
                      >
                        <X className="h-3 w-3" /> Ausente
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div className="text-xs text-muted-foreground pt-1">
                <b className="text-success">{presentes} presentes</b> ·{" "}
                <b className="text-destructive">{ausentes} ausentes</b> ·{" "}
                <b>{pendentes} pendentes</b>
              </div>
            </div>
          )}

          {/* Step 2 — received */}
          {validacao_status === "pendente" && anyValidated && (
            <Button size="sm" onClick={markReceived} className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground">
              <Check className="h-3.5 w-3.5" /> Marcar validação recebida do cliente
            </Button>
          )}
          {(validacao_status === "validacao_recebida" || validacao_status === "subido_meu_chapa") &&
            data_validacao_recebida && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-success/10 border border-success/30 text-success text-xs font-semibold">
                <Check className="h-4 w-4" /> Validação recebida — {fmtDateTime(data_validacao_recebida)}
              </div>
            )}

          {/* Step 3 — uploaded */}
          {validacao_status === "validacao_recebida" && (
            <Button
              size="sm"
              onClick={() => setUploadOpen(true)}
              className="gap-1.5 bg-overnight hover:bg-overnight/90 text-overnight-foreground"
            >
              <Upload className="h-3.5 w-3.5" /> Marcar como subido no Meu Chapa
            </Button>
          )}
          {validacao_status === "subido_meu_chapa" && data_upload_meu_chapa && (
            <div className="px-3 py-2 rounded-md bg-overnight/10 border border-overnight/30 text-overnight text-xs font-semibold space-y-0.5">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4" /> Subido no Meu Chapa — {fmtDateTime(data_upload_meu_chapa)}
              </div>
              {obs_validacao && <div className="italic font-normal pl-6 text-muted-foreground">{obs_validacao}</div>}
            </div>
          )}
        </div>
      </CollapsibleContent>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir validações no Meu Chapa</DialogTitle>
            <DialogDescription>
              Confirme que as validações foram carregadas no sistema externo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Observações (opcional) — ex: divergências encontradas"
            value={uploadObs}
            onChange={(e) => setUploadObs(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmUpload} className="bg-overnight hover:bg-overnight/90 text-overnight-foreground">
              Confirmar upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}
