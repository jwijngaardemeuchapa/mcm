import { useState, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import logo from "@/assets/logo-meuchapa.png";
import { invoke } from "@tauri-apps/api/core";
import { sincronizarMetabase, sincronizarCarteira, devesSincronizarCarteira } from "@/lib/metabaseSync";
import { readSettings } from "@/lib/settings";

type Step = { label: string; status: "pending" | "running" | "done" | "skip" };

export function AppStartup({ onDone }: { onDone: () => void }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    async function run() {
      const s = readSettings();
      const hasMetabaseCardId = !!s.metabaseTarefasCardId;
      const hasCarteiraCardId = !!s.metabaseCarteiraCardId;

      // Verifica se o backend tem conexão Metabase configurada (URL + API key)
      let metabaseConfigured = false;
      try {
        const status = await invoke<{ configured: boolean }>("metabase_status");
        metabaseConfigured = status.configured;
      } catch { /* backend indisponível — pula sync */ }

      const hasMetabase = hasMetabaseCardId && metabaseConfigured;
      const hasCarteira = hasCarteiraCardId && metabaseConfigured;
      const syncCarteira = hasCarteira && devesSincronizarCarteira();

      if (!hasMetabase && !syncCarteira) { onDone(); return; }

      const initialSteps: Step[] = [
        hasMetabase ? { label: "Sincronizando tarefas", status: "pending" } : null,
        syncCarteira ? { label: "Sincronizando carteira", status: "pending" } : null,
      ].filter(Boolean) as Step[];

      setSteps(initialSteps);
      setVisible(true);

      const update = (idx: number, status: Step["status"]) =>
        setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, status } : s));

      let idx = 0;
      if (hasMetabase) {
        update(idx, "running");
        await sincronizarMetabase(true);
        update(idx, "done");
        idx++;
      }
      if (syncCarteira) {
        update(idx, "running");
        await sincronizarCarteira(true);
        update(idx, "done");
      }

      await new Promise((r) => setTimeout(r, 600));
      onDone();
    }

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center gap-6">
      <img src={logo} alt="MCM" className="h-14 opacity-90" />
      <div className="space-y-2 min-w-[220px]">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2.5">
            {step.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
            {step.status === "done" && <Check className="h-4 w-4 text-success shrink-0" />}
            {step.status === "pending" && <span className="h-4 w-4 shrink-0" />}
            <span className={`text-sm ${step.status === "running" ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {step.label}
              {step.status === "done" && " ✓"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
