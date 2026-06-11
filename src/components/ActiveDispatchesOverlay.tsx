import { useEffect, useState, useCallback } from "react";
import { Megaphone, MessageSquare, XCircle, X, Send, Loader2 } from "lucide-react";
import { dispatchQueue, bidDispatchQueue, type ActiveJob } from "@/lib/dispatchQueue";

// Painel flutuante global: mostra todo countdown/envio em andamento, em qualquer
// página, separado por tarefa — com cancelamento em um clique.
export function ActiveDispatchesOverlay() {
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [batches, setBatches] = useState<ReturnType<typeof bidDispatchQueue.getActiveBatches>>([]);

  const refresh = useCallback(() => {
    setJobs(dispatchQueue.getActiveJobs());
    setBatches(bidDispatchQueue.getActiveBatches());
  }, []);

  useEffect(() => {
    refresh();
    const un1 = dispatchQueue.subscribeAnyJob(refresh);
    const un2 = bidDispatchQueue.subscribeAnyBatch(refresh);
    return () => { un1(); un2(); };
  }, [refresh]);

  const total = jobs.length + batches.length;
  if (total === 0) return null;

  const kindIcon = (kind: ActiveJob["kind"]) => {
    switch (kind) {
      case "massFup": return <Megaphone className="h-3.5 w-3.5 text-primary" />;
      case "customMsg": return <MessageSquare className="h-3.5 w-3.5 text-info" />;
      case "taskCancel":
      case "chapaCancel": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return <Send className="h-3.5 w-3.5 text-primary" />;
    }
  };

  const fmtCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-h-[50vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 sticky top-0 bg-card">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="text-xs font-semibold text-foreground">
          Disparos em andamento ({total})
        </span>
      </div>
      <div className="divide-y divide-border">
        {jobs.map((j) => (
          <div key={j.id} className="px-3 py-2 flex items-center gap-2.5">
            {kindIcon(j.kind)}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{j.titulo.toLowerCase()}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {j.descricao}
                {j.remaining !== null && (
                  <span className="ml-1.5 font-mono font-semibold text-warning">{fmtCountdown(j.remaining)}</span>
                )}
                {j.progress && (
                  <span className="ml-1.5 font-mono text-info">{j.progress.sent}/{j.progress.total}</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={j.cancel}
              className="shrink-0 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 px-2 py-1 text-[11px] font-medium transition-colors flex items-center gap-1"
              title={j.remaining !== null ? "Cancelar antes do envio" : "Interromper envio"}
            >
              <X className="h-3 w-3" /> Cancelar
            </button>
          </div>
        ))}
        {batches.map((b) => (
          <div key={`bid-${b.taskId}`} className="px-3 py-2 flex items-center gap-2.5">
            <Send className="h-3.5 w-3.5 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{b.empresa.toLowerCase()}</p>
              <p className="text-[11px] text-muted-foreground">
                BID em lote
                <span className="ml-1.5 font-mono text-info">{b.progress.current}/{b.progress.total}</span>
                {b.waitSeconds !== null && (
                  <span className="ml-1.5 font-mono text-warning">próximo em {b.waitSeconds}s</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => bidDispatchQueue.abortBatch(b.taskId)}
              className="shrink-0 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 px-2 py-1 text-[11px] font-medium transition-colors flex items-center gap-1"
              title="Interromper lote"
            >
              <X className="h-3 w-3" /> Cancelar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
