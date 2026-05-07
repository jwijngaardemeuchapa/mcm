import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  ListFilter,
  Bell,
  BellOff,
  X,
  Check,
  Download,
  Building2,
  Upload,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotifications } from "@/lib/useNotifications";
import { toast } from "sonner";

type AllRowKey = number;

export default function Dashboard() {
  useNotifications();
  const navigate = useNavigate();
  const [tasksToday, setTasksToday] = useState<TaskWithChapas[]>([]);
  const [overnightContinuing, setOvernightContinuing] = useState<TaskWithChapas[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);
  const [hourFilter, setHourFilter] = useState<string>(() => localStorage.getItem("dash_hour_filter") ?? "");
  const [search, setSearch] = useState("");
  const [forceCollapseMap, setForceCollapseMap] = useState<Record<AllRowKey, boolean | null>>({});
  const [globalCollapsed, setGlobalCollapsed] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<string>("__all__");
  const [onlyNotUploaded, setOnlyNotUploaded] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
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
        if (tt.status_tarefa === "Finalizado") return false;
        // Show all dates >= today (today + future dates present in import)
        const dISO = fmtSP(tt.data_tarefa, "yyyy-MM-dd");
        if (dISO < todayISO) return false;
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
          ) as unknown as TaskWithChapas["chapas"],
          fup_log: (sortedFup as Array<Record<string, unknown> & { id_tarefa: number }>).filter(
            (f) => f.id_tarefa === t.id_tarefa,
          ) as unknown as TaskWithChapas["fup_log"],
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
      if (manual) {
        setRefreshDone(true);
        setTimeout(() => setRefreshDone(false), 2000);
      }
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(false), 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Keyboard shortcut: pressing R navigates to /importar (ignored when typing in inputs)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "r" && e.key !== "R") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      navigate("/importar");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

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

  const isFullyValidated = (t: TaskWithChapas) => {
    const real = t.chapas.filter((c) => c.nome_chapa);
    return (
      real.length > 0 &&
      real.every((c) => c.validacao_presenca === "presente" || c.validacao_presenca === "ausente")
    );
  };

  // Search by chapa name, task id, chapa phone, or company name
  const searchMatchIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    const onlyDigits = q.replace(/\D/g, "");
    return new Set(
      allCards
        .filter((t) => {
          if (String(t.id_tarefa).includes(q)) return true;
          if ((t.empresa ?? "").toLowerCase().includes(q)) return true;
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

  // Companies present in current visible (hour-filtered) cards — for dropdown
  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    allCards.forEach((t) => {
      if (t.empresa) set.add(t.empresa);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allCards]);

  const isNotUploaded = (t: TaskWithChapas) =>
    (t.validacao_status ?? "aguardando") !== "subido_meu_chapa";

  const passesExtraFilters = (t: TaskWithChapas) => {
    if (companyFilter !== "__all__" && t.empresa !== companyFilter) return false;
    if (onlyNotUploaded && !isNotUploaded(t)) return false;
    return true;
  };

  // Stats — only the 3 essentials
  const totalChapas = allCards.reduce((a, t) => a + (t.quantidade_chapas || t.chapas.length), 0);
  const confirmedChapas = allCards.reduce(
    (a, t) => a + t.chapas.filter((c) => c.status_contato === "confirmado").length,
    0,
  );
  const fillPct = totalChapas > 0 ? Math.round((confirmedChapas / totalChapas) * 100) : 0;
  const fillTone = fillPct >= 80 ? "success" : fillPct >= 50 ? "warning" : "destructive";
  const validacaoPendente = allCards.filter(
    (t) => (t.validacao_status ?? "aguardando") !== "subido_meu_chapa",
  ).length;

  // Urgent tasks — for banner action
  const urgentCount = allCards.filter((t) => t.urgent).length;
  const urgentList = allCards.filter((t) => t.urgent);

  function applyToAll(value: boolean) {
    const next: Record<number, boolean | null> = {};
    allCards.forEach((t) => {
      next[t.id_tarefa] = value;
    });
    setForceCollapseMap(next);
    setGlobalCollapsed(value);
    setOnlyPending(false);
  }
  function expandOnlyPending() {
    const next: Record<number, boolean | null> = {};
    allCards.forEach((t) => {
      next[t.id_tarefa] = isFullyValidated(t);
    });
    setForceCollapseMap(next);
    setOnlyPending(true);
  }

  function flashTask(id: number) {
    const el = document.querySelector(`[data-task-card="${id}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary", "ring-offset-2");
    setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
    }, 500);
  }

  function exportPreFup() {
    const todayISO = todayDateISO_SP();
    const tomorrow = new Date(`${todayISO}T12:00:00-03:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString().slice(0, 10);
    const tomorrowTasks = tasksToday.filter(
      (t) => fmtSP(t.data_tarefa, "yyyy-MM-dd") === tomorrowISO,
    );
    if (tomorrowTasks.length === 0) {
      toast.error("Nenhuma tarefa para amanhã foi importada ainda.");
      return;
    }
    // Group chapas by company
    type Row = { empresa: string; horario: string; id_tarefa: number; nome: string; telefone: string; cpf: string };
    const rows: Row[] = [];
    tomorrowTasks
      .slice()
      .sort((a, b) => a.empresa.localeCompare(b.empresa) || a.data_tarefa.localeCompare(b.data_tarefa))
      .forEach((t) => {
        t.chapas
          .filter((c) => c.nome_chapa && c.status_contato !== "removido")
          .forEach((c) => {
            rows.push({
              empresa: t.empresa,
              horario: fmtSP(t.data_tarefa, "dd/MM/yyyy HH:mm"),
              id_tarefa: t.id_tarefa,
              nome: c.nome_chapa ?? "",
              telefone: c.telefone_chapa ?? "",
              cpf: c.cpf ?? "",
            });
          });
      });
    if (rows.length === 0) {
      toast.error("Nenhum chapa nas tarefas de amanhã.");
      return;
    }
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const header = "Empresa;Horario;ID Tarefa;Nome do Chapa;Telefone;CPF";
    const csv =
      header + "\n" + rows.map((r) => [r.empresa, r.horario, r.id_tarefa, r.nome, r.telefone, r.cpf].map(esc).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pre_fup_${tomorrowISO}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    const empresas = new Set(rows.map((r) => r.empresa)).size;
    toast.success(`✓ Pré-FUP exportado — ${rows.length} chapas · ${empresas} empresa(s) · ${tomorrowTasks.length} tarefa(s)`);
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

  // Color tokens for fill stat
  const fillStatColor =
    fillTone === "success" ? "text-success" : fillTone === "warning" ? "text-warning" : "text-destructive";
  const fillBarColor =
    fillTone === "success" ? "bg-success" : fillTone === "warning" ? "bg-warning" : "bg-destructive";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {urgentCount > 0 && !bannerDismissed && (
        <div
          className="flex items-center gap-3 pl-3 pr-4 py-3 border-l-4 border-l-destructive text-destructive"
          style={{ background: "rgba(239,68,68,0.08)" }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="font-semibold text-sm flex-1">
            {urgentCount} tarefa(s) urgente(s) — iniciaram antes das 06:00. Confirme presença imediatamente.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => urgentList[0] && flashTask(urgentList[0].id_tarefa)}
          >
            {urgentCount > 1 ? "Ver todas →" : "Ver tarefa →"}
          </Button>
          <button
            onClick={() => setBannerDismissed(true)}
            aria-label="Dispensar alerta"
            className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-destructive/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Toolbar — left: view controls · right: system controls */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-3 sticky top-0 z-20 shadow-card">
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
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-2 min-h-[28px]"
              aria-label="Limpar busca"
            >
              ×
            </button>
          )}
          {search && searchMatchIds && (
            <div className="absolute left-3 -bottom-5 text-[12px] text-muted-foreground">
              {searchMatchIds.size} resultado(s)
            </div>
          )}
        </div>

        {/* Left zone — view controls (ghost) */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={onlyPending ? "default" : "ghost"}
            className={`h-[30px] gap-1.5 text-xs ${
              onlyPending ? "bg-info/15 text-info hover:bg-info/25 border border-info/40" : ""
            }`}
            onClick={expandOnlyPending}
            title="Expandir apenas tarefas não 100% validadas"
          >
            <ListFilter className="h-3.5 w-3.5" />
            Só pendentes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-[30px] gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => applyToAll(!globalCollapsed)}
            title={globalCollapsed ? "Expandir todas as tarefas" : "Colapsar todas as tarefas"}
          >
            <ChevronsDownUp className="h-3.5 w-3.5" />
            {globalCollapsed ? "Expandir tudo" : "Colapsar tudo"}
          </Button>
        </div>

        {/* Right zone — system */}
        <div className="flex items-center gap-1.5 ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={requestNotifPerm}
                aria-label={
                  notifPerm === "granted" ? "Notificações ativadas" : "Notificações desativadas"
                }
                className="relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-border hover:bg-muted transition-colors"
              >
                {notifPerm === "granted" ? (
                  <>
                    <Bell className="h-4 w-4 text-foreground" />
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-success border border-card" />
                  </>
                ) : (
                  <BellOff className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {notifPerm === "granted"
                ? "Notificações ativas"
                : notifPerm === "unsupported"
                ? "Não suportado neste navegador"
                : "Ativar notificações"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="h-9 gap-1.5 min-w-[120px] justify-center"
                onClick={() => load(true)}
                disabled={refreshing}
              >
                {refreshing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Atualizando...</span>
                  </>
                ) : refreshDone ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Atualizado</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    <span>Atualizar</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Importar planilha [R]</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Stats — exactly 3 in one row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 shadow-card">
          <div className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold opacity-50">
            Fill rate
          </div>
          <div className={`text-2xl font-display font-medium mt-1 ${fillStatColor}`}>{fillPct}%</div>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full ${fillBarColor} transition-[width] duration-[400ms] ease-out`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-card">
          <div className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold opacity-50">
            Confirmados
          </div>
          <div className="text-2xl font-display font-medium mt-1 text-foreground tabular-nums">
            {confirmedChapas}/{totalChapas}
          </div>
          <div className="text-xs text-muted-foreground mt-1">chapas</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 shadow-card">
          <div className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold opacity-50">
            Validações pendentes
          </div>
          <div
            className={`text-2xl font-display font-medium mt-1 tabular-nums ${
              validacaoPendente > 0 ? "text-warning" : "text-muted-foreground"
            }`}
          >
            {validacaoPendente}
          </div>
          <div className="text-xs text-muted-foreground mt-1">tarefas</div>
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
        <h2 className="font-display font-semibold text-lg text-foreground">Tarefas</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={exportPreFup}
            title="Exportar CSV de pré-FUP do dia seguinte (agrupado por empresa)"
          >
            <Download className="h-3.5 w-3.5" /> Pré-FUP amanhã
          </Button>
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
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : tasksToday.length === 0 && overnightContinuing.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-8 flex items-center justify-center gap-4 flex-wrap">
          <Inbox className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-foreground">
            Nenhuma tarefa — planilha ainda não importada.
          </span>
          <Button size="sm" onClick={() => navigate("/importar")}>
            Importar →
          </Button>
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

          if (search && searchMatchIds && searchMatchIds.size === 0) {
            return (
              <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
                Nenhum resultado para "{search}".
              </div>
            );
          }

          // Group by date (yyyy-MM-dd)
          const todayISO = todayDateISO_SP();
          const byDate = new Map<string, TaskWithChapas[]>();
          visible.forEach((t) => {
            const k = fmtSP(t.data_tarefa, "yyyy-MM-dd");
            if (!byDate.has(k)) byDate.set(k, []);
            byDate.get(k)!.push(t);
          });
          const dates = Array.from(byDate.keys()).sort();

          const renderDateGroup = (dateISO: string, group: TaskWithChapas[]) => {
            const pending = group.filter((t) => !isTaskDone(t));
            const done = group.filter(isTaskDone);
            const allDone = group.length > 0 && pending.length === 0;
            const isToday = dateISO === todayISO;
            const label = isToday
              ? "Hoje"
              : fmtSP(`${dateISO}T12:00:00-03:00`, "EEEE, dd/MM");
            return (
              <div key={dateISO} className="space-y-3">
                {!isToday && (
                  <div className="flex items-center gap-3 pt-2">
                    <span className="text-sm font-display font-semibold text-foreground capitalize">
                      {label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({group.length} tarefa{group.length > 1 ? "s" : ""})
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                {allDone && (
                  <div className="px-4 py-3 rounded-lg bg-success/10 border border-success/40 text-success font-semibold text-sm">
                    ✅ Todas as tarefas concluídas.
                  </div>
                )}
                {pending.length > 0 && (
                  <>
                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-[12px] uppercase tracking-wider font-semibold text-muted-foreground opacity-50">
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
                      <span className="text-[12px] uppercase tracking-wider font-semibold text-success flex items-center gap-2 opacity-70">
                        Concluídas
                        <span className="px-1.5 py-0.5 rounded bg-success/15 text-success text-[12px]">
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
          };

          return (
            <div className="space-y-6">
              {dates.map((d) => renderDateGroup(d, byDate.get(d)!))}
            </div>
          );
        })()
      )}
    </div>
  );
}
