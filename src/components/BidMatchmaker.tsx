import React, { useState } from "react";
import { type RankedCandidate, type OpenTask, type DispatchParams } from "@/pages/BIDDashboard";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Send, ExternalLink, X, CheckCircle2, ChevronRight, Ban } from "lucide-react";
import { fmtTaskDateParam } from "@/lib/umbler";
import { fmtTime } from "@/lib/datetime";

interface BidMatchmakerProps {
  task: OpenTask;
  candidates: RankedCandidate[];
  dispatchParams: DispatchParams;
  onDispatch: (candidate: RankedCandidate) => void;
  maxDistKm: number;
}

export function BidMatchmaker({ task, candidates, dispatchParams, onDispatch, maxDistKm }: BidMatchmakerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Filter available candidates
  const available = candidates.filter((c) => !c.is_occupied && c.telefone);
  const currentCandidate = available[currentIndex];

  const handleNext = () => setCurrentIndex((prev) => Math.min(prev + 1, available.length - 1));
  const handleDispatch = () => {
    if (currentCandidate) {
      onDispatch(currentCandidate);
      handleNext();
    }
  };

  if (available.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground bg-muted/10 rounded-xl m-4 border border-dashed border-border">
        Nenhum chapa disponível para matchmaker.
      </div>
    );
  }

  if (currentIndex >= available.length) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground bg-muted/10 rounded-xl m-4 border border-dashed border-border">
        Você chegou ao fim da lista de recomendações.
        <br />
        <Button variant="outline" className="mt-4" onClick={() => setCurrentIndex(0)}>Recomeçar</Button>
      </div>
    );
  }

  const isDistValid = currentCandidate.distance_km === null || currentCandidate.distance_km <= maxDistKm;

  return (
    <div className="flex flex-col md:flex-row h-[500px] bg-background border border-border rounded-xl overflow-hidden m-4">
      {/* Esquerda: Detalhes da Tarefa */}
      <div className="w-full md:w-1/3 bg-muted/20 border-r border-border p-6 flex flex-col">
        <div className="flex-1 space-y-6">
          <div>
            <h3 className="text-lg font-display font-bold uppercase truncate">{task.empresa}</h3>
            <div className="text-sm text-muted-foreground mt-1">{fmtTaskDateParam(task.data_tarefa)} às {fmtTime(task.data_tarefa)}</div>
            {task.cidade_uf && <div className="text-sm text-muted-foreground">{task.cidade_uf}</div>}
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-card border border-border rounded-lg shadow-sm">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Vagas Abertas</div>
              <div className="text-2xl font-bold text-foreground">{Math.max(0, task.quantidade_chapas - task.alocados)}</div>
            </div>

            <div className="p-4 bg-card border border-border rounded-lg shadow-sm space-y-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Parâmetros de Disparo</div>
              <div className="text-sm"><span className="font-medium text-foreground/70">Diária:</span> R$ {dispatchParams.diaria || "---"}</div>
              <div className="text-sm"><span className="font-medium text-foreground/70">Local:</span> {dispatchParams.local || "---"}</div>
              <div className="text-sm"><span className="font-medium text-foreground/70">Ativ.:</span> {dispatchParams.atividades || "---"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Direita: Matchmaker */}
      <div className="flex-1 flex flex-col bg-card/50 relative">
        <div className="absolute top-4 right-4 text-xs font-semibold text-muted-foreground bg-background px-2 py-1 rounded-full border border-border">
          {currentIndex + 1} de {available.length}
        </div>
        
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md bg-background border border-border rounded-2xl shadow-lg overflow-hidden transform transition-all hover:scale-[1.01]">
            <div className="p-6 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-2xl font-bold truncate capitalize">{currentCandidate.nome.toLowerCase()}</h2>
                  {currentCandidate.tarefas >= 10 && <CheckCircle2 className="h-5 w-5 text-success shrink-0" title="Engajado" />}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" /> {currentCandidate.telefone}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 p-3 rounded-lg border border-border/50">
                  <div className="text-xs text-muted-foreground mb-1 uppercase">Histórico</div>
                  <div className="font-semibold">{currentCandidate.tarefas} tarefas</div>
                </div>
                <div className={`p-3 rounded-lg border ${isDistValid ? 'bg-success/5 border-success/20' : 'bg-warning/5 border-warning/20'}`}>
                  <div className="text-xs text-muted-foreground mb-1 uppercase">Distância</div>
                  <div className={`font-semibold flex items-center gap-1 ${isDistValid ? 'text-success' : 'text-warning'}`}>
                    <MapPin className="h-3.5 w-3.5" /> 
                    {currentCandidate.distance_km !== null ? `${currentCandidate.distance_km.toFixed(1)} km` : "Desconhecida"}
                  </div>
                </div>
              </div>

              {currentCandidate.disparo && (
                <div className="bg-primary/5 border border-primary/20 text-primary p-3 rounded-lg text-sm flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Já disparado para esta tarefa ({currentCandidate.disparo.status})
                </div>
              )}
            </div>

            <div className="flex border-t border-border bg-muted/10">
              <button 
                onClick={handleNext}
                className="flex-1 flex flex-col items-center justify-center p-4 hover:bg-destructive/5 hover:text-destructive text-muted-foreground transition-colors border-r border-border"
              >
                <Ban className="h-6 w-6 mb-1" />
                <span className="text-xs font-semibold uppercase tracking-wider">Pular</span>
              </button>
              <button 
                onClick={handleDispatch}
                disabled={!!currentCandidate.disparo}
                className="flex-1 flex flex-col items-center justify-center p-4 hover:bg-success/5 text-success transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <Send className="h-6 w-6 mb-1" />
                <span className="text-xs font-semibold uppercase tracking-wider">Disparar BID</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
