import { useState, useEffect } from "react";
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
import { getDb, placeholders, errMsg } from "@/lib/db";
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

  // Update otimista: o clique reflete na UI imediatamente, sem esperar o
  // reload completo do Dashboard (que faz fetch de todo o banco). Quando os
  // dados reais chegam pelas props, os overrides já refletidos são descartados.
  const [overrides, setOverrides] = useState<Record<string, "presente" | "ausente">>({});

  const realChapas = chapas.filter((c) => c.nome_chapa && c.status_contato !== "removido");

  const presencaOf = (c: Chapa): string | null => overrides[c.id] ?? c.validacao_presenca ?? null;

  // Quando a presença real (props) muda — após o reload ou undo — limpa os overrides
  const presencaSig = realChapas.map((c) => `${c.id}:${c.validacao_presenca ?? ""}`).join("|");
  useEffect(() => { setOverrides({}); }, [presencaSig]);

  const presentes = realChapas.filter((c) => presencaOf(c) === "presente").length;
  const ausentes = realChapas.filter((c) => presencaOf(c) === "ausente").length;
  const pendentes = realChapas.length - presentes - ausentes;
  const anyValidated = presentes + ausentes > 0;

  async function setPresenca(chapa: Chapa, value: "presente" | "ausente") {
    setOverrides((o) => ({ ...o, [chapa.id]: value })); // feedback imediato
    const prevPresenca = chapa.validacao_presenca ?? null;
    const prevData = chapa.data_validacao ?? null;
    const prevStatus = chapa.status_contato;
    const shouldConfirm = value === "presente" && chapa.status_contato !== "confirmado";
    const now = new Date().toISOString();
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE chapas SET validacao_presenca = ?, data_validacao = ? WHERE id = ?",
        [value, now, chapa.id],
      );
      if (shouldConfirm) {
        await db.execute(
          "UPDATE chapas SET status_contato = 'confirmado', data_contato = ? WHERE id = ?",
          [now, chapa.id],
        );
      }
    } catch (e) {
      setOverrides((o) => { const n = { ...o }; delete n[chapa.id]; return n; }); // reverte feedback
      toast.error(errMsg(e));
      return;
    }
    push({
      label: `presença de ${chapa.nome_chapa ?? "chapa"} (${value})`,
      revert: async () => {
        const db = await getDb();
        await db.execute(
          "UPDATE chapas SET validacao_presenca = ?, data_validacao = ? WHERE id = ?",
          [prevPresenca, prevData, chapa.id],
        );
        if (shouldConfirm) {
          await db.execute(
            "UPDATE chapas SET status_contato = ? WHERE id = ?",
            [prevStatus, chapa.id],
          );
        }
      },
      onReverted: onRefresh,
    });
    onRefresh();
  }

  async function setAllPresent() {
    const targets = realChapas.filter((c) => presencaOf(c) !== "presente");
    if (targets.length === 0) return;
    setOverrides((o) => { const n = { ...o }; targets.forEach((c) => { n[c.id] = "presente"; }); return n; });
    const prev = targets.map((c) => ({
      id: c.id,
      validacao_presenca: c.validacao_presenca ?? null,
      data_validacao: c.data_validacao ?? null,
      status_contato: c.status_contato,
    }));
    const ids = targets.map((c) => c.id);
    const toConfirm = targets.filter((c) => c.status_contato !== "confirmado").map((c) => c.id);
    const now = new Date().toISOString();
    try {
      const db = await getDb();
      const ph = placeholders(ids.length);
      await db.execute(
        `UPDATE chapas SET validacao_presenca = 'presente', data_validacao = ? WHERE id IN (${ph})`,
        [now, ...ids],
      );
      if (toConfirm.length > 0) {
        const ph2 = placeholders(toConfirm.length);
        await db.execute(
          `UPDATE chapas SET status_contato = 'confirmado', data_contato = ? WHERE id IN (${ph2})`,
          [now, ...toConfirm],
        );
      }
    } catch (e) {
      setOverrides((o) => { const n = { ...o }; ids.forEach((id) => { delete n[id]; }); return n; });
      toast.error(errMsg(e));
      return;
    }
    push({
      label: `validar ${ids.length} ajudante(s) como presente`,
      revert: async () => {
        const db = await getDb();
        for (const p of prev) {
          await db.execute(
            "UPDATE chapas SET validacao_presenca = ?, data_validacao = ?, status_contato = ? WHERE id = ?",
            [p.validacao_presenca, p.data_validacao, p.status_contato, p.id],
          );
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
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE tarefas SET validacao_status = 'validacao_recebida', data_validacao_recebida = ? WHERE id_tarefa = ?",
        [new Date().toISOString(), id_tarefa],
      );
    } catch (e) {
      toast.error(errMsg(e));
      return;
    }
    push({
      label: "marcar validação recebida",
      revert: async () => {
        const db = await getDb();
        await db.execute(
          "UPDATE tarefas SET validacao_status = ?, data_validacao_recebida = ? WHERE id_tarefa = ?",
          [prevStatus, prevDate, id_tarefa],
        );
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
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE tarefas SET validacao_status = 'subido_meu_chapa', data_upload_meu_chapa = ?, obs_validacao = ? WHERE id_tarefa = ?",
        [new Date().toISOString(), uploadObs || null, id_tarefa],
      );
    } catch (e) {
      toast.error(errMsg(e));
      return;
    }
    push({
      label: "subir no Meu Chapa",
      revert: async () => {
        const db = await getDb();
        await db.execute(
          "UPDATE tarefas SET validacao_status = ?, data_upload_meu_chapa = ?, obs_validacao = ? WHERE id_tarefa = ?",
          [prevStatus, prevUpload, prevObs, id_tarefa],
        );
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
          {realChapas.length > 0 && (
            <div className="space-y-1.5">
              {realChapas.some((c) => presencaOf(c) !== "presente") && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs border-success/50 text-success hover:bg-success/10"
                    onClick={setAllPresent}
                  >
                    <Check className="h-3.5 w-3.5" /> Validar todos como presentes
                  </Button>
                </div>
              )}
              {realChapas.map((c) => {
                const v = presencaOf(c);
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
