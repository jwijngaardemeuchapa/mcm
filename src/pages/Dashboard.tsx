import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toSP, todayDateISO_SP, fmtSP } from "@/lib/datetime";
import { companyMatches } from "@/lib/company";
import { TaskCard, type TaskWithChapas } from "@/components/TaskCard";
import { AlertTriangle, Inbox } from "lucide-react";
import { useNotifications } from "@/lib/useNotifications";

export default function Dashboard() {
  useNotifications();
  const [tasks, setTasks] = useState<TaskWithChapas[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: tarefas }, { data: chapas }, { data: fup }, { data: carteira }] = await Promise.all([
      supabase.from("tarefas").select("*").eq("ativo", true),
      supabase.from("chapas").select("*"),
      supabase.from("fup_log").select("*").order("data_disparo", { ascending: false }),
      supabase.from("carteira").select("nome_fantasia"),
    ]);

    const names = (carteira ?? []).map((c) => c.nome_fantasia);
    const today = todayDateISO_SP();

    const filtered = (tarefas ?? []).filter((t) => {
      const dISO = fmtSP(t.data_tarefa, "yyyy-MM-dd");
      if (dISO !== today) return false;
      if (t.status_tarefa === "Finalizado") return false;
      if (names.length > 0 && !companyMatches(t.empresa, names)) return false;
      const d = toSP(t.data_tarefa);
      const h = d.getHours();
      // show 06:00-15:00 window OR urgent (already started before 06:00)
      return (h >= 6 && h <= 15) || h < 6;
    });

    const mapped: TaskWithChapas[] = filtered
      .map((t) => {
        const d = toSP(t.data_tarefa);
        return {
          id_tarefa: t.id_tarefa,
          data_tarefa: t.data_tarefa,
          empresa: t.empresa,
          cidade_uf: t.cidade_uf,
          status_tarefa: t.status_tarefa,
          quantidade_chapas: t.quantidade_chapas ?? 0,
          chapas: (chapas ?? []).filter((c) => c.id_tarefa === t.id_tarefa),
          fup_log: (fup ?? []).filter((f) => f.id_tarefa === t.id_tarefa),
          urgent: d.getHours() < 6 || d.getTime() < Date.now(),
        };
      })
      .sort((a, b) => new Date(a.data_tarefa).getTime() - new Date(b.data_tarefa).getTime());

    setTasks(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const urgentCount = tasks.filter((t) => t.urgent).length;
  const totalChapas = tasks.reduce((a, t) => a + (t.quantidade_chapas || t.chapas.length), 0);
  const confirmedChapas = tasks.reduce(
    (a, t) => a + t.chapas.filter((c) => c.status_contato === "confirmado").length,
    0
  );
  const removedChapas = tasks.reduce(
    (a, t) => a + t.chapas.filter((c) => c.status_contato === "removido").length,
    0
  );
  const fillPct = totalChapas > 0 ? Math.round((confirmedChapas / totalChapas) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      {urgentCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/40 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="font-semibold text-sm">
            ⚠️ {urgentCount} tarefa(s) urgente(s) — iniciaram antes das 06:00. Confirme presença imediatamente.
          </span>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Tarefas hoje", value: tasks.length, color: "text-primary" },
          { label: "Chapas solicitados", value: totalChapas, color: "text-foreground" },
          { label: "Confirmados", value: confirmedChapas, color: "text-success" },
          { label: "Removidos", value: removedChapas, color: "text-destructive" },
          { label: "Fill rate", value: `${fillPct}%`, color: "text-primary" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 shadow-card">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</div>
            <div className={`text-2xl font-display font-bold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <h2 className="font-display font-semibold text-lg text-foreground pt-2">Dashboard Operacional</h2>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : tasks.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <div className="font-semibold text-foreground">Nenhuma tarefa para hoje</div>
          <div className="text-sm text-muted-foreground mt-1">
            Importe uma planilha ou adicione empresas à sua carteira.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <TaskCard key={t.id_tarefa} task={t} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
}
