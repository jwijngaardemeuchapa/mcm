import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toSP, todayDateISO_SP, fmtSP } from "@/lib/datetime";
import { companyMatches } from "@/lib/company";
import { TaskCard, type TaskWithChapas } from "@/components/TaskCard";
import { AlertTriangle, Inbox, Moon, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/lib/useNotifications";

export default function Dashboard() {
  useNotifications();
  const [tasksToday, setTasksToday] = useState<TaskWithChapas[]>([]);
  const [overnightContinuing, setOvernightContinuing] = useState<TaskWithChapas[]>([]);
  const [loading, setLoading] = useState(true);
  const [hourFilter, setHourFilter] = useState<string>(() => localStorage.getItem("dash_hour_filter") ?? "");
  const overnightNotifiedRef = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    const [{ data: tarefas }, { data: chapas }, { data: fup }, { data: carteira }] = await Promise.all([
      supabase.from("tarefas").select("*").eq("ativo", true),
      supabase.from("chapas").select("*"),
      supabase.from("fup_log").select("*").order("data_disparo", { ascending: false }),
      supabase.from("carteira").select("nome_fantasia"),
    ]);

    const names = (carteira ?? []).map((c) => c.nome_fantasia);
    const todayISO = todayDateISO_SP();

    // Auto-transition aguardando -> pendente for tasks whose start time has passed
    const nowMs = Date.now();
    const toTransition = (tarefas ?? []).filter(
      (t) =>
        (t.validacao_status ?? "aguardando") === "aguardando" &&
        new Date(t.data_tarefa).getTime() <= nowMs
    );
    if (toTransition.length) {
      await supabase
        .from("tarefas")
        .update({ validacao_status: "pendente" })
        .in(
          "id_tarefa",
          toTransition.map((t) => t.id_tarefa)
        );
      toTransition.forEach((t) => {
        t.validacao_status = "pendente";
      });
    }

    const inCarteira = (empresa: string) => names.length === 0 || companyMatches(empresa, names);

    // Tasks that started today
    const todaysTasks = (tarefas ?? []).filter((t) => {
      const dISO = fmtSP(t.data_tarefa, "yyyy-MM-dd");
      if (dISO !== todayISO) return false;
      if (t.status_tarefa === "Finalizado") return false;
      return inCarteira(t.empresa);
    });

    // Overnight tasks that started YESTERDAY and are still not fully uploaded — show at top
    const yesterdayOvernight = (tarefas ?? []).filter((t) => {
      if (!t.is_overnight) return false;
      const dISO = fmtSP(t.data_tarefa, "yyyy-MM-dd");
      // yesterday in SP
      const y = new Date(`${todayISO}T00:00:00-03:00`);
      y.setDate(y.getDate() - 1);
      const yISO = y.toISOString().slice(0, 10);
      if (dISO !== yISO) return false;
      if ((t.validacao_status ?? "aguardando") === "subido_meu_chapa") return false;
      return inCarteira(t.empresa);
    });

    const buildCard = (t: typeof todaysTasks[number], continuing: boolean): TaskWithChapas => {
      const d = toSP(t.data_tarefa);
      return {
        id_tarefa: t.id_tarefa,
        data_tarefa: t.data_tarefa,
        empresa: t.empresa,
        cidade_uf: t.cidade_uf,
        status_tarefa: t.status_tarefa,
        quantidade_chapas: t.quantidade_chapas ?? 0,
        is_overnight: t.is_overnight,
        validacao_status: t.validacao_status,
        data_validacao_recebida: t.data_validacao_recebida,
        data_upload_meu_chapa: t.data_upload_meu_chapa,
        obs_validacao: t.obs_validacao,
        observacoes: (t as { observacoes?: string | null }).observacoes ?? null,
        observacoes_updated_at:
          (t as { observacoes_updated_at?: string | null }).observacoes_updated_at ?? null,
        chapas: (chapas ?? []).filter((c) => c.id_tarefa === t.id_tarefa),
        fup_log: (fup ?? []).filter((f) => f.id_tarefa === t.id_tarefa),
        urgent: !continuing && (d.getHours() < 6 || d.getTime() < Date.now()),
        continuingFromYesterday: continuing,
      };
    };

    const overnightCards = yesterdayOvernight
      .map((t) => buildCard(t, true))
      .sort((a, b) => new Date(a.data_tarefa).getTime() - new Date(b.data_tarefa).getTime());

    const todayCards = todaysTasks
      .map((t) => buildCard(t, false))
      .sort((a, b) => new Date(a.data_tarefa).getTime() - new Date(b.data_tarefa).getTime());

    // Immediate notification for each overnight task still running (once per session)
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      overnightCards.forEach((t) => {
        if (!overnightNotifiedRef.current.has(t.id_tarefa)) {
          overnightNotifiedRef.current.add(t.id_tarefa);
          try {
            new Notification("🌙 Tarefa overnight em andamento", {
              body: `${t.empresa} — confirme presença dos chapas.`,
              tag: `overnight-${t.id_tarefa}`,
            });
          } catch {
            /* noop */
          }
        }
      });
    }

    setOvernightContinuing(overnightCards);
    setTasksToday(todayCards);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const allCards = [...overnightContinuing, ...tasksToday];
  const urgentCount = allCards.filter((t) => t.urgent).length;
  const totalChapas = allCards.reduce((a, t) => a + (t.quantidade_chapas || t.chapas.length), 0);
  const confirmedChapas = allCards.reduce(
    (a, t) => a + t.chapas.filter((c) => c.status_contato === "confirmado").length,
    0
  );
  const removedChapas = allCards.reduce(
    (a, t) => a + t.chapas.filter((c) => c.status_contato === "removido").length,
    0
  );
  const fillPct = totalChapas > 0 ? Math.round((confirmedChapas / totalChapas) * 100) : 0;

  const validacaoPendente = allCards.filter((t) => {
    const started = new Date(t.data_tarefa).getTime() <= Date.now();
    const s = t.validacao_status ?? "aguardando";
    return started && s !== "subido_meu_chapa";
  }).length;
  const subidoHoje = allCards.filter((t) => {
    if (!t.data_upload_meu_chapa) return false;
    return fmtSP(t.data_upload_meu_chapa, "yyyy-MM-dd") === todayDateISO_SP();
  }).length;

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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Tarefas hoje", value: tasksToday.length, color: "text-primary" },
          { label: "Overnight ativas", value: overnightContinuing.length, color: "text-overnight" },
          { label: "Chapas solicitados", value: totalChapas, color: "text-foreground" },
          { label: "Confirmados", value: confirmedChapas, color: "text-success" },
          { label: "Removidos", value: removedChapas, color: "text-destructive" },
          { label: "Validação pendente", value: validacaoPendente, color: "text-warning" },
          { label: "Subidos Meu Chapa", value: subidoHoje, color: "text-overnight" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 shadow-card">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</div>
            <div className={`text-2xl font-display font-bold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
        <div className="bg-card border border-border rounded-xl p-4 shadow-card">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Fill rate</div>
          <div className="text-2xl font-display font-bold mt-1 text-primary">{fillPct}%</div>
        </div>
      </div>

      {overnightContinuing.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display font-semibold text-lg text-overnight flex items-center gap-2">
            <Moon className="h-5 w-5" /> Em andamento — iniciadas ontem
          </h2>
          {overnightContinuing.map((t) => (
            <TaskCard key={`ov-${t.id_tarefa}`} task={t} onRefresh={load} />
          ))}
        </section>
      )}

      <h2 className="font-display font-semibold text-lg text-foreground pt-2">📋 Tarefas do dia</h2>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : tasksToday.length === 0 && overnightContinuing.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <div className="font-semibold text-foreground">Nenhuma tarefa para hoje</div>
          <div className="text-sm text-muted-foreground mt-1">
            Importe uma planilha ou adicione empresas à sua carteira.
          </div>
        </div>
      ) : (
        (() => {
          const isTaskDone = (t: typeof tasksToday[number]) =>
            t.chapas.length > 0 &&
            t.chapas.every((c) => c.status_contato === "confirmado") &&
            (t.validacao_status ?? "aguardando") === "subido_meu_chapa";
          const pending = tasksToday.filter((t) => !isTaskDone(t));
          const done = tasksToday.filter(isTaskDone);
          const allDone = tasksToday.length > 0 && pending.length === 0;

          return (
            <div className="space-y-3">
              {allDone && (
                <div className="px-4 py-3 rounded-lg bg-success/10 border border-success/40 text-success font-semibold text-sm">
                  ✅ Todas as tarefas do dia foram confirmadas e validadas.
                  <span className="ml-2 font-normal text-muted-foreground">
                    Ver tarefas concluídas ({done.length}) abaixo.
                  </span>
                </div>
              )}

              {pending.length > 0 && (
                <>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                      Pendentes
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  {pending.map((t) => (
                    <TaskCard key={t.id_tarefa} task={t} onRefresh={load} />
                  ))}
                </>
              )}

              {done.length > 0 && (
                <>
                  <div className="flex items-center gap-3 pt-3">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-success flex items-center gap-2">
                      Concluídas
                      <span className="px-1.5 py-0.5 rounded bg-success/15 text-success text-[10px]">
                        {done.length}
                      </span>
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  {done.map((t) => (
                    <TaskCard key={t.id_tarefa} task={t} onRefresh={load} />
                  ))}
                </>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
}
