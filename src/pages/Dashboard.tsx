import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toSP, todayDateISO_SP, fmtSP } from "@/lib/datetime";
import { companyMatches } from "@/lib/company";
import { TaskCard, type TaskWithChapas } from "@/components/TaskCard";
import { fetchAllRows } from "@/lib/fetchAll";
import {
  AlertTriangle,
  Inbox,
  Moon,
  Clock,
  RefreshCw,
  Search,
  ChevronsDownUp,
  ChevronsUpDown,
  ListFilter,
  Bell,
  BellOff,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/lib/useNotifications";
import { toast } from "sonner";

type AllRowKey = number;

export default function Dashboard() {
  useNotifications();
  const [tasksToday, setTasksToday] = useState<TaskWithChapas[]>([]);
  const [overnightContinuing, setOvernightContinuing] = useState<TaskWithChapas[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hourFilter, setHourFilter] = useState<string>(() => localStorage.getItem("dash_hour_filter") ?? "");
  const [search, setSearch] = useState("");
  const [forceCollapseMap, setForceCollapseMap] = useState<Record<AllRowKey, boolean | null>>({});
  const overnightNotifiedRef = useRef<Set<number>>(new Set());
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [tarefas, chapas, fup, carteira] = await Promise.all([
        fetchAllRows<Record<string, unknown>>("tarefas", "*"),
        fetchAllRows<Record<string, unknown>>("chapas", "*"),
        fetchAllRows<Record<string, unknown>>("fup_log", "*"),
        fetchAllRows<{ nome_fantasia: string }>("carteira", "nome_fantasia"),
      ]);

      const activeTarefas = (tarefas as Array<Record<string, unknown> & { ativo?: boolean }>).filter(
        (t) => t.ativo !== false,
      );
      const sortedFup = [...fup].sort(
        (a, b) =>
          new Date((b as { data_disparo: string }).data_disparo).getTime() -
          new Date((a as { data_disparo: string }).data_disparo).getTime(),
      );

      const names = (carteira ?? []).map((c) => c.nome_fantasia);
      const todayISO = todayDateISO_SP();

      // Auto-transition aguardando -> pendente for tasks whose start time has passed
      const nowMs = Date.now();
      const toTransition = activeTarefas.filter(
        (t) =>
          (((t as { validacao_status?: string }).validacao_status) ?? "aguardando") === "aguardando" &&
          new Date((t as { data_tarefa: string }).data_tarefa).getTime() <= nowMs,
      );
      if (toTransition.length) {
        await supabase
          .from("tarefas")
          .update({ validacao_status: "pendente" })
          .in(
            "id_tarefa",
            toTransition.map((t) => (t as { id_tarefa: number }).id_tarefa),
          );
        toTransition.forEach((t) => {
          (t as { validacao_status: string }).validacao_status = "pendente";
        });
      }

      const inCarteira = (empresa: string) => names.length === 0 || companyMatches(empresa, names);

      const todaysTasks = activeTarefas.filter((t) => {
        const tt = t as { data_tarefa: string; status_tarefa: string; empresa: string };
        const dISO = fmtSP(tt.data_tarefa, "yyyy-MM-dd");
        if (dISO !== todayISO) return false;
        if (tt.status_tarefa === "Finalizado") return false;
        return inCarteira(tt.empresa);
      });

      const yesterdayOvernight = activeTarefas.filter((t) => {
        const tt = t as {
          data_tarefa: string;
          empresa: string;
          is_overnight?: boolean | null;
          validacao_status?: string | null;
        };
        if (!tt.is_overnight) return false;
        const dISO = fmtSP(tt.data_tarefa, "yyyy-MM-dd");
        const y = new Date(`${todayISO}T00:00:00-03:00`);
        y.setDate(y.getDate() - 1);
        const yISO = y.toISOString().slice(0, 10);
        if (dISO !== yISO) return false;
        if ((tt.validacao_status ?? "aguardando") === "subido_meu_chapa") return false;
        return inCarteira(tt.empresa);
      });

      type T = Record<string, unknown> & {
        id_tarefa: number;
        data_tarefa: string;
        empresa: string;
        cidade_uf?: string | null;
        status_tarefa: string;
        quantidade_chapas?: number | null;
        is_overnight?: boolean | null;
        validacao_status?: string | null;
        data_validacao_recebida?: string | null;
        data_upload_meu_chapa?: string | null;
        obs_validacao?: string | null;
        observacoes?: string | null;
        observacoes_updated_at?: string | null;
      };
      const buildCard = (raw: Record<string, unknown>, continuing: boolean): TaskWithChapas => {
        const t = raw as T;
        const d = toSP(t.data_tarefa);
        return {
          id_tarefa: t.id_tarefa,
          data_tarefa: t.data_tarefa,
          empresa: t.empresa,
          cidade_uf: t.cidade_uf ?? null,
          status_tarefa: t.status_tarefa,
          quantidade_chapas: t.quantidade_chapas ?? 0,
          is_overnight: t.is_overnight,
          validacao_status: t.validacao_status,
          data_validacao_recebida: t.data_validacao_recebida,
          data_upload_meu_chapa: t.data_upload_meu_chapa,
          obs_validacao: t.obs_validacao,
          observacoes: t.observacoes ?? null,
          observacoes_updated_at: t.observacoes_updated_at ?? null,
          chapas: (chapas as Array<Record<string, unknown> & { id_tarefa: number }>).filter(
            (c) => c.id_tarefa === t.id_tarefa,
          ) as TaskWithChapas["chapas"],
          fup_log: (sortedFup as Array<Record<string, unknown> & { id_tarefa: number }>).filter(
            (f) => f.id_tarefa === t.id_tarefa,
          ) as TaskWithChapas["fup_log"],
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
      if (manual) toast.success("Atualizado");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(false), 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (hourFilter) localStorage.setItem("dash_hour_filter", hourFilter);
    else localStorage.removeItem("dash_hour_filter");
  }, [hourFilter]);

  const filteredToday = useMemo(() => {
    if (!hourFilter) return tasksToday;
    const m = hourFilter.match(/^(\d{1,2}):?(\d{2})?$/);
    if (!m) return tasksToday;
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2] ?? "0", 10);
    if (!Number.isFinite(h)) return tasksToday;
    const minMinutes = h * 60 + (Number.isFinite(mm) ? mm : 0);
    return tasksToday.filter((t) => {
      const hh = parseInt(fmtSP(t.data_tarefa, "HH"), 10);
      const mi = parseInt(fmtSP(t.data_tarefa, "mm"), 10);
      return hh * 60 + mi >= minMinutes;
    });
  }, [tasksToday, hourFilter]);

  const allCards = [...overnightContinuing, ...filteredToday];

  // Search by chapa name, task id, or chapa phone
  const searchMatchIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    const onlyDigits = q.replace(/\D/g, "");
    return new Set(
      allCards
        .filter((t) => {
          if (String(t.id_tarefa).includes(q)) return true;
          if (t.chapas.some((c) => (c.nome_chapa ?? "").toLowerCase().includes(q))) return true;
          if (
            onlyDigits.length >= 3 &&
            t.chapas.some((c) => (c.telefone_chapa ?? "").replace(/\D/g, "").includes(onlyDigits))
          )
            return true;
          return false;
        })
        .map((t) => t.id_tarefa),
    );
  }, [search, allCards]);

  const urgentCount = allCards.filter((t) => t.urgent).length;
  const totalChapas = allCards.reduce((a, t) => a + (t.quantidade_chapas || t.chapas.length), 0);
  const confirmedChapas = allCards.reduce(
    (a, t) => a + t.chapas.filter((c) => c.status_contato === "confirmado").length,
    0,
  );
  const removedChapas = allCards.reduce(
    (a, t) => a + t.chapas.filter((c) => c.status_contato === "removido").length,
    0,
  );
  const fillPct = totalChapas > 0 ? Math.round((confirmedChapas / totalChapas) * 100) : 0;

  const isFullyValidated = (t: TaskWithChapas) => {
    const real = t.chapas.filter((c) => c.nome_chapa);
    return (
      real.length > 0 &&
      real.every((c) => c.validacao_presenca === "presente" || c.validacao_presenca === "ausente")
    );
  };

  const validacaoPendente = allCards.filter((t) => {
    const started = new Date(t.data_tarefa).getTime() <= Date.now();
    const s = t.validacao_status ?? "aguardando";
    return started && s !== "subido_meu_chapa";
  }).length;
  const subidoHoje = allCards.filter((t) => {
    if (!t.data_upload_meu_chapa) return false;
    return fmtSP(t.data_upload_meu_chapa, "yyyy-MM-dd") === todayDateISO_SP();
  }).length;

  function applyToAll(value: boolean | null) {
    const next: Record<number, boolean | null> = {};
    allCards.forEach((t) => {
      next[t.id_tarefa] = value;
    });
    setForceCollapseMap(next);
  }
  function expandOnlyPending() {
    const next: Record<number, boolean | null> = {};
    allCards.forEach((t) => {
      next[t.id_tarefa] = isFullyValidated(t); // collapsed if validated, expanded if not
    });
    setForceCollapseMap(next);
  }

  async function requestNotifPerm() {
    if (typeof Notification === "undefined") {
      toast.error("Seu navegador não suporta notificações");
      return;
    }
    const p = await Notification.requestPermission();
    setNotifPerm(p);
    if (p === "granted") {
      toast.success("Notificações ativadas");
      try {
        new Notification("✅ FUP Manager", { body: "Notificações ativadas com sucesso." });
      } catch {
        /* noop */
      }
    } else {
      toast.error("Permissão de notificações negada");
    }
  }

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

      {/* Global search + actions bar */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-2 sticky top-0 z-20 shadow-card">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome do chapa, nº de tarefa ou telefone…"
            className="pl-9 h-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-2"
              aria-label="Limpar busca"
            >
              ×
            </button>
          )}
          {search && searchMatchIds && (
            <div className="absolute left-3 -bottom-5 text-[10px] text-muted-foreground">
              {searchMatchIds.size} resultado(s)
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={() => applyToAll(true)}
            title="Colapsar todas"
          >
            <ChevronsDownUp className="h-4 w-4" />
            <span className="hidden sm:inline">Colapsar</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={() => applyToAll(false)}
            title="Expandir todas"
          >
            <ChevronsUpDown className="h-4 w-4" />
            <span className="hidden sm:inline">Expandir</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={expandOnlyPending}
            title="Expandir apenas tarefas não 100% validadas"
          >
            <ListFilter className="h-4 w-4" />
            <span className="hidden md:inline">Só pendentes</span>
          </Button>
        </div>
        {notifPerm !== "granted" && notifPerm !== "unsupported" && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-warning/50 text-warning-foreground bg-warning/10"
            onClick={requestNotifPerm}
            title="Ativar notificações do navegador / Windows"
          >
            <BellOff className="h-4 w-4" />
            <span className="hidden sm:inline">Ativar notificações</span>
          </Button>
        )}
        {notifPerm === "granted" && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded bg-success/10 text-success border border-success/30"
            title="Notificações do navegador ativadas"
          >
            <Bell className="h-3 w-3" /> Notif.
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1.5"
          onClick={() => load(true)}
          disabled={refreshing}
          title="Atualizar dados"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </Button>
      </div>

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
          {overnightContinuing
            .filter((t) => !searchMatchIds || searchMatchIds.has(t.id_tarefa))
            .map((t) => (
              <TaskCard
                key={`ov-${t.id_tarefa}`}
                task={t}
                onRefresh={load}
                forceCollapse={forceCollapseMap[t.id_tarefa]}
                matchHighlight={!!(search && searchMatchIds?.has(t.id_tarefa))}
              />
            ))}
        </section>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
        <h2 className="font-display font-semibold text-lg text-foreground">📋 Tarefas do dia</h2>
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <label className="text-xs text-muted-foreground">A partir de</label>
          <Input
            type="time"
            value={hourFilter}
            onChange={(e) => setHourFilter(e.target.value)}
            className="h-7 w-[110px] text-sm"
          />
          {hourFilter && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setHourFilter("")}>
              Limpar
            </Button>
          )}
          {hourFilter && (
            <span className="text-xs text-muted-foreground">
              ({filteredToday.length}/{tasksToday.length})
            </span>
          )}
        </div>
      </div>

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
          const isTaskDone = (t: TaskWithChapas) =>
            t.chapas.length > 0 &&
            t.chapas.every((c) => c.status_contato === "confirmado") &&
            (t.validacao_status ?? "aguardando") === "subido_meu_chapa";
          const visible = filteredToday.filter(
            (t) => !searchMatchIds || searchMatchIds.has(t.id_tarefa),
          );
          const pending = visible.filter((t) => !isTaskDone(t));
          const done = visible.filter(isTaskDone);
          const allDone = visible.length > 0 && pending.length === 0;

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
                    <TaskCard
                      key={t.id_tarefa}
                      task={t}
                      onRefresh={load}
                      forceCollapse={forceCollapseMap[t.id_tarefa]}
                      matchHighlight={!!(search && searchMatchIds?.has(t.id_tarefa))}
                    />
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
                    <TaskCard
                      key={t.id_tarefa}
                      task={t}
                      onRefresh={load}
                      forceCollapse={forceCollapseMap[t.id_tarefa]}
                      matchHighlight={!!(search && searchMatchIds?.has(t.id_tarefa))}
                    />
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
