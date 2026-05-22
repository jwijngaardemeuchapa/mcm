import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, StickyNote } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getDb } from "@/lib/db";
import { fmtDateTime, fmtTime } from "@/lib/datetime";

type Props = {
  id_tarefa: number;
  empresa: string;
  data_tarefa: string;
  observacoes: string | null;
  observacoes_updated_at: string | null;
};

const PREVIEW_LIMIT = 80;

export function ObservationsPanel({
  id_tarefa,
  empresa,
  data_tarefa,
  observacoes,
  observacoes_updated_at,
}: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(observacoes ?? "");
  const [lastUpdated, setLastUpdated] = useState<string | null>(observacoes_updated_at);
  const [showSaved, setShowSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef(observacoes ?? "");

  // Keep local state in sync if the server value changes externally
  useEffect(() => {
    setValue(observacoes ?? "");
    initialRef.current = observacoes ?? "";
    setLastUpdated(observacoes_updated_at);
  }, [observacoes, observacoes_updated_at]);

  function scheduleSave(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (next === initialRef.current) return;
      const now = new Date().toISOString();
      try {
        const db = await getDb();
        await db.execute(
          "UPDATE tarefas SET observacoes = ?, observacoes_updated_at = ? WHERE id_tarefa = ?",
          [next || null, now, id_tarefa],
        );
      } catch {
        toast.error("Erro ao salvar observações");
        return;
      }
      initialRef.current = next;
      setLastUpdated(now);
      setShowSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000);
    }, 2000);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  function handleCopy() {
    const header = `Tarefa #${id_tarefa} — ${empresa} | ${fmtDateTime(data_tarefa)}`;
    const body = value.trim() || "(sem observações)";
    navigator.clipboard.writeText(`${header}\n---\n${body}`);
    toast.success("Copiado!");
  }

  const hasContent = value.trim().length > 0;
  const preview = hasContent
    ? value.length > PREVIEW_LIMIT
      ? value.slice(0, PREVIEW_LIMIT).replace(/\n/g, " ") + "…"
      : value.replace(/\n/g, " ")
    : "Nenhuma observação registrada";

  const rows = Math.min(12, Math.max(4, value.split("\n").length));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full px-4 py-2 bg-muted/50 hover:bg-muted flex items-center justify-between gap-3 text-xs border-t border-border">
          <span className="flex items-center gap-2 min-w-0 font-semibold text-muted-foreground">
            <StickyNote className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0">Observações</span>
            <span
              className={`truncate font-normal ${hasContent ? "text-foreground" : "text-muted-foreground italic"}`}
            >
              — {preview}
            </span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {hasContent && lastUpdated && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                ✏️ editado {fmtTime(lastUpdated)}
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="p-4 bg-muted/30 space-y-2 border-t border-border">
        <Textarea
          rows={rows}
          value={value}
          placeholder="Registre aqui ocorrências, problemas, observações gerais desta tarefa..."
          onChange={(e) => {
            setValue(e.target.value);
            scheduleSave(e.target.value);
          }}
          className="min-h-[96px] resize-y bg-background"
        />
        {showSaved && <span className="sr-only">Salvo</span>}
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5" /> Copiar observações
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
