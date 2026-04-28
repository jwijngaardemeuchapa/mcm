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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/datetime";
import { Check, X, Upload, ClipboardCheck } from "lucide-react";
import type { ValidationStep } from "./ValidationStepper";

type Chapa = {
  id: string;
  nome_chapa: string | null;
  status_contato: string;
  validacao_presenca?: string | null;
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

  const realChapas = chapas.filter((c) => c.nome_chapa);
  const presentes = realChapas.filter((c) => c.validacao_presenca === "presente").length;
  const ausentes = realChapas.filter((c) => c.validacao_presenca === "ausente").length;
  const pendentes = realChapas.length - presentes - ausentes;
  const anyValidated = presentes + ausentes > 0;

  async function setPresenca(chapaId: string, value: "presente" | "ausente") {
    const { error } = await supabase
      .from("chapas")
      .update({ validacao_presenca: value, data_validacao: new Date().toISOString() })
      .eq("id", chapaId);
    if (error) toast.error(error.message);
    else onRefresh();
  }

  async function markReceived() {
    const { error } = await supabase
      .from("tarefas")
      .update({
        validacao_status: "validacao_recebida",
        data_validacao_recebida: new Date().toISOString(),
      })
      .eq("id_tarefa", id_tarefa);
    if (error) toast.error(error.message);
    else {
      toast.success("Validação recebida marcada");
      onRefresh();
    }
  }

  async function confirmUpload() {
    const { error } = await supabase
      .from("tarefas")
      .update({
        validacao_status: "subido_meu_chapa",
        data_upload_meu_chapa: new Date().toISOString(),
        obs_validacao: uploadObs || null,
      })
      .eq("id_tarefa", id_tarefa);
    if (error) toast.error(error.message);
    else {
      toast.success("Marcado como subido no Meu Chapa");
      setUploadOpen(false);
      onRefresh();
    }
  }

  return (
    <div className="px-4 py-3 border-t border-border bg-accent/30 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <h4 className="font-semibold text-sm text-foreground">Validações</h4>
      </div>

      {/* Step 1 — per-chapa presence */}
      {realChapas.length > 0 && (
        <div className="space-y-1.5">
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
                    onClick={() => setPresenca(c.id, "presente")}
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
                    onClick={() => setPresenca(c.id, "ausente")}
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
    </div>
  );
}
