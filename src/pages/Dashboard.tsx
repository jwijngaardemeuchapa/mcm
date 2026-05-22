import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getDb, placeholders } from "@/lib/db";
import { toSP, todayDateISO_SP, fmtSP, parseTaskDate } from "@/lib/datetime";
import { companyMatches } from "@/lib/company";
import { TaskCard, type TaskWithChapas } from "@/components/TaskCard";
import { TaskPanorama } from "@/components/TaskPanorama";
import { ApproachingAlert } from "@/components/ApproachingAlert";
import { AlertBanner, type AlertItem } from "@/components/AlertBanner";
import { PriorityPanel, type LembreteAlertItem } from "@/components/PriorityPanel";
import { RefreshDiff, computeRefreshDiff, chapKey, type DiffResult } from "@/components/RefreshDiff";
import { fetchAllRows } from "@/lib/fetchAll";
import {
  AlertTriangle,
  CalendarClock,
  Inbox,
  Moon,
  Clock,
  RefreshCw,
  Search,
  ChevronsDownUp,
  ListFilter,
  Bell,
  BellRing,
  BellOff,
  X,
  Check,
  Download,
  Building2,
  Upload,
  LayoutList,
  Table2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  MessageSquare,
  UserCheck,
  UserX,
  Trash2,
  Send,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { type WatcherActivity } from "@/lib/useNotificationWatcher";
import { useWatcherLog } from "@/lib/WatcherContext";
import { readSettings } from "@/lib/settings";
import { normalize } from "@/lib/normalize";
import { useSidebar } from "@/components/ui/sidebar";
import { toast } from "sonner";
import { TrocaDeTurno } from "@/components/TrocaDeTurno";

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
  const [search, setSearch] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("q") ?? ""; } catch { return ""; }
  });
  const [pendingFlashId, setPendingFlashId] = useState<number | null>(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("flash");
      return v ? Number(v) : null;
    } catch { return null; }
  });
  const [forceCollapseMap, setForceCollapseMap] = useState<Record<AllRowKey, boolean | null>>({});
  const [globalCollapsed, setGlobalCollapsed] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<string>(
    () => localStorage.getItem("dash_company_filter") ?? "__all__",
  );
  const [onlyNotUploaded, setOnlyNotUploaded] = useState(false);
  const [onlyNoUmblerFup, setOnlyNoUmblerFup] = useState(false);
  const [viewMode, setViewMode] = useState<"detailed" | "panorama">(
    () =>
      (localStorage.getItem("dash_view_mode") as "detailed" | "panorama" | null) ??
      readSettings().defaultDashboardView,
  );
  const [selectedDate, setSelectedDate] = useState(() => todayDateISO_SP());
  const [allDatesCards, setAllDatesCards] = useState<TaskWithChapas[]>([]);
  const [showCompanyBreakdown, setShowCompanyBreakdown] = useState(false);
  const overnightNotifiedRef = useRef<Set<number>>(new Set());
  const prevTasksRef = useRef<TaskWithChapas[] | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [newChapaKeys, setNewChapaKeys] = useState<Set<string>>(new Set());
  const newChapaTimestampsRef = useRef<Map<string, number>>(new Map());
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  );
  const [agendaAlerts, setAgendaAlerts] = useState<AlertItem[]>([]);
  const [trocaTurnoOpen, setTrocaTurnoOpen] = useState(false);
  const [lembreteAlerts, setLembreteAlerts] = useState<LembreteAlertItem[]>([]);
  const [hiddenCompanies, setHiddenCompanies] = useState<string[]>([]);
  const { notifLog, clearLog } = useWatcherLog();

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [tarefas, chapas, fup, carteira] = await Promise.all([
        fetchAllRows<Record<string, unknown>>("tarefas", "*"),
        fetchAllRows<Record<string, unknown>>("chapas", "*"),
        fetchAllRows<Record<string, unknown>>("fup_log", "*"),
        fetchAllRows<{ nome_fantasia: string }>("carteira", "nome_fantasia"),
      ]);

      try {
        const cfgDb = await getDb();
        const hiddenRows = await cfgDb.select<{ nome_fantasia: string }[]>(
          "SELECT nome_fantasia FROM empresa_config WHERE oculta_dashboard = 1",
        );
        setHiddenCompanies(hiddenRows.map((r) => r.nome_fantasia));
      } catch { /* tabela pode não existir antes da migração 7 */ }

      const activeTarefas = (tarefas as Array<Record<string, unknown> & { ativo?: boolean | number }>).filter(
        (t) => t.ativo !== false && t.ativo !== 0,
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
          parseTaskDate(
            (t as { data_tarefa: string }).data_tarefa,
            (t as { cidade_uf?: string | null }).cidade_uf,
          ).getTime() <= nowMs,
      );
      if (toTransition.length) {
        const db = await getDb();
        const transIds = toTransition.map((t) => (t as { id_tarefa: number }).id_tarefa);
        const ph = placeholders(transIds.length);
        await db.execute(`UPDATE tarefas SET validacao_status = 'pendente' WHERE id_tarefa IN (${ph})`, transIds);
        toTransition.forEach((t) => {
          (t as { validacao_status: string }).validacao_status = "pendente";
        });
      }

      const inCarteira = (empresa: string) => names.length === 0 || companyMatches(empresa, names);

      const todaysTasks = activeTarefas.filter((t) => {
        const tt = t as { data_tarefa: string; status_tarefa: string; empresa: string };
        if (tt.status_tarefa === "Finalizado") return false;
        if (tt.status_tarefa?.toLowerCase().startsWith("cancel")) return false;
        // Show all dates >= today (today + future dates present in import)
        const dISO = fmtSP(tt.data_tarefa, "yyyy-MM-dd");
        if (dISO < todayISO) return false;
        return inCarteira(tt.empresa);
      });

      const yesterdayOvernight = activeTarefas.filter((t) => {
        const tt = t as {
          data_tarefa: string;
          empresa: string;
          status_tarefa: string;
          is_overnight?: boolean | null;
          validacao_status?: string | null;
        };
        if (!tt.is_overnight) return false;
        if (tt.status_tarefa?.toLowerCase().startsWith("cancel")) return false;
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
        importado_em?: string | null;
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
          importado_em: t.importado_em ?? null,
          chapas: (chapas as Array<Record<string, unknown> & { id_tarefa: number }>).filter(
            (c) => c.id_tarefa === t.id_tarefa,
          ) as unknown as TaskWithChapas["chapas"],
          fup_log: (sortedFup as Array<Record<string, unknown> & { id_tarefa: number }>).filter(
            (f) => f.id_tarefa === t.id_tarefa,
          ) as unknown as TaskWithChapas["fup_log"],
          urgent: !continuing && fmtSP(t.data_tarefa, "yyyy-MM-dd") === todayISO && (d.getHours() < 6 || d.getTime() < Date.now()),
          continuingFromYesterday: continuing,
        };
      };

      const overnightCards = yesterdayOvernight
        .map((t) => buildCard(t, true))
        .sort((a, b) => new Date(a.data_tarefa).getTime() - new Date(b.data_tarefa).getTime());

      const todayCards = todaysTasks
        .map((t) => buildCard(t, false))
        .sort((a, b) => new Date(a.data_tarefa).getTime() - new Date(b.data_tarefa).getTime());

      const allNext = [...overnightCards, ...todayCards];
      if (prevTasksRef.current !== null) {
        const diff = computeRefreshDiff(prevTasksRef.current, allNext);
        const nowMs = Date.now();
        const TWENTY_MIN = 20 * 60 * 1000;
        // Stamp newly added chapas
        diff.added.forEach((c) => {
          const k = chapKey(c.taskId, c.nome);
          if (!newChapaTimestampsRef.current.has(k)) {
            newChapaTimestampsRef.current.set(k, nowMs);
          }
        });
        // Expire entries older than 20 min
        for (const [k, ts] of newChapaTimestampsRef.current) {
          if (nowMs - ts > TWENTY_MIN) newChapaTimestampsRef.current.delete(k);
        }
        setNewChapaKeys(new Set(newChapaTimestampsRef.current.keys()));
        if (diff.added.length > 0 || diff.removed.length > 0) {
          setDiffResult(diff);
          setDiffOpen(true);
        }
      }
      prevTasksRef.current = allNext;

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

      // All active tasks for any date — powers date navigation
      const allDatesTasks = activeTarefas.filter((t) => {
        const tt = t as { status_tarefa: string; empresa: string };
        if (tt.status_tarefa === "Finalizado") return false;
        if (tt.status_tarefa?.toLowerCase().startsWith("cancel")) return false;
        return inCarteira(tt.empresa);
      });
      setAllDatesCards(
        allDatesTasks
          .map((t) => buildCard(t, false))
          .sort((a, b) => new Date(a.data_tarefa).getTime() - new Date(b.data_tarefa).getTime()),
      );

      setOvernightContinuing(overnightCards);
      setTasksToday(todayCards);

      // Load agenda items due within 2h for banner alerts
      try {
        const agendaDb = await getDb();
        type AgendaRow = { id: string; titulo: string; prazo: string | null; importancia: string };
        const agendaRows = await agendaDb.select<AgendaRow[]>(
          "SELECT id, titulo, prazo, importancia FROM agenda WHERE status != 'concluido' AND (prazo IS NULL OR prazo <= datetime('now', '+2 hours'))",
        );
        const built: AlertItem[] = agendaRows
          .filter((r) => r.prazo)
          .map((r) => {
            const d = new Date(r.prazo!);
            const overdue = d.getTime() < Date.now();
            const hh = d.getHours().toString().padStart(2, "0");
            const mm = d.getMinutes().toString().padStart(2, "0");
            return {
              id: `agenda-${r.id}`,
              level: (overdue ? "critical" : "info") as "critical" | "info",
              Icon: CalendarClock,
              text: `${overdue ? "Prazo vencido" : "Prazo próximo"} · ${r.titulo} · ${hh}:${mm}`,
              actionLabel: "Agenda →",
              onAction: () => navigate("/agenda"),
            };
          });
        setAgendaAlerts(built);
      } catch {
        /* agenda table may not exist on first run before migration */
      }

      // Compute active lembrete alerts against today's task list
      try {
        const ldb = await getDb();
        type LRow = { id: string; empresa: string; mensagem: string; minutos_antes: number };
        const lRows = await ldb.select<LRow[]>(
          "SELECT id, empresa, mensagem, minutos_antes FROM lembretes WHERE ativo = 1",
        );
        const nowMs = Date.now();
        const built: LembreteAlertItem[] = [];
        for (const l of lRows) {
          for (const t of allNext) {
            if (!companyMatches(t.empresa, [l.empresa])) continue;
            if (
              t.validacao_status === "validacao_recebida" ||
              t.validacao_status === "subido_meu_chapa" ||
              t.status_tarefa === "Concluído"
            ) continue;
            const minutesUntil = (parseTaskDate(t.data_tarefa, t.cidade_uf).getTime() - nowMs) / 60_000;
            if (minutesUntil < -30 || minutesUntil > l.minutos_antes) continue;
            built.push({
              id: `lembrete_${l.id}_${t.id_tarefa}`,
              taskId: t.id_tarefa,
              empresa: t.empresa,
              horario: t.data_tarefa,
              message: l.mensagem,
              minutesUntil,
            });
          }
        }
        setLembreteAlerts(built);
      } catch {
        /* lembretes table may not exist before migration 6 */
      }

      setLoading(false);
      if (manual) {
        setRefreshDone(true);
        setTimeout(() => setRefreshDone(false), 2000);
      }
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  // Clean URL params after reading them into state
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.has("q") || p.has("flash")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(false), 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Apply pending flash from URL param once tasks finish loading
  useEffect(() => {
    if (loading || pendingFlashId === null) return;
    const id = pendingFlashId;
    setPendingFlashId(null);
    setTimeout(() => flashTask(id), 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pendingFlashId]);

  // DOM events fired by the global WatcherProvider
  const flashTaskRef = useRef<(id: number) => void>(flashTask);
  useEffect(() => { flashTaskRef.current = flashTask; });
  useEffect(() => {
    const onRefresh = () => load();
    const onFlash = (e: Event) => flashTaskRef.current((e as CustomEvent<number>).detail);
    window.addEventListener("fup:refresh", onRefresh);
    window.addEventListener("fup:flash-task", onFlash);
    return () => {
      window.removeEventListener("fup:refresh", onRefresh);
      window.removeEventListener("fup:flash-task", onFlash);
    };
  }, [load]);

  // Keyboard shortcuts (ignored when focus is inside an input/textarea)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const inInput = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      if (inInput) {
        // Esc → blur the current input
        if (e.key === "Escape") {
          (el as HTMLElement).blur();
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case "r": case "R":
          e.preventDefault();
          navigate("/importar");
          break;
        case "/":
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case "t": case "T":
          e.preventDefault();
          setSelectedDate(todayDateISO_SP());
          break;
        case "ArrowLeft":
          e.preventDefault();
          setSelectedDate((prev) => {
            const d = new Date(`${prev}T12:00:00-03:00`);
            d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
          });
          break;
        case "ArrowRight":
          e.preventDefault();
          setSelectedDate((prev) => {
            const d = new Date(`${prev}T12:00:00-03:00`);
            d.setDate(d.getDate() + 1);
            return d.toISOString().slice(0, 10);
          });
          break;
        case "1":
          e.preventDefault();
          setViewMode("detailed");
          break;
        case "2":
          e.preventDefault();
          setViewMode("panorama");
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  // Persist companyFilter to localStorage
  useEffect(() => {
    localStorage.setItem("dash_company_filter", companyFilter);
  }, [companyFilter]);

  // Persist viewMode to localStorage
  useEffect(() => {
    localStorage.setItem("dash_view_mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (hourFilter) localStorage.setItem("dash_hour_filter", hourFilter);
    else localStorage.removeItem("dash_hour_filter");
  }, [hourFilter]);

  const filteredToday = useMemo(() => {
    let base = hiddenCompanies.length > 0
      ? tasksToday.filter((t) => !companyMatches(t.empresa, hiddenCompanies))
      : tasksToday;
    if (!hourFilter) return base;
    const m = hourFilter.match(/^(\d{1,2}):?(\d{2})?$/);
    if (!m) return base;
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2] ?? "0", 10);
    if (!Number.isFinite(h)) return base;
    const minMinutes = h * 60 + (Number.isFinite(mm) ? mm : 0);
    return base.filter((t) => {
      const hh = parseInt(fmtSP(t.data_tarefa, "HH"), 10);
      const mi = parseInt(fmtSP(t.data_tarefa, "mm"), 10);
      return hh * 60 + mi >= minMinutes;
    });
  }, [tasksToday, hourFilter, hiddenCompanies]);

  // Date navigation
  const todayISO = todayDateISO_SP();
  const isOnToday = selectedDate === todayISO;

  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    setCompanyFilter("__all__");
  }, [selectedDate]);

  const displayCards = useMemo(() => {
    const base = selectedDate === todayDateISO_SP()
      ? [...overnightContinuing, ...filteredToday]
      : allDatesCards.filter((t) => fmtSP(t.data_tarefa, "yyyy-MM-dd") === selectedDate);
    if (hiddenCompanies.length === 0) return base;
    return base.filter((t) => !companyMatches(t.empresa, hiddenCompanies));
  }, [selectedDate, overnightContinuing, filteredToday, allDatesCards, hiddenCompanies]);

  const tasksForDisplay = isOnToday ? filteredToday : displayCards;
  const overnightForDisplay = isOnToday
    ? (hiddenCompanies.length > 0
        ? overnightContinuing.filter((t) => !companyMatches(t.empresa, hiddenCompanies))
        : overnightContinuing)
    : [];

  const allCards = useMemo(() => {
    const base = [...overnightContinuing, ...filteredToday];
    return hiddenCompanies.length > 0 ? base.filter((t) => !companyMatches(t.empresa, hiddenCompanies)) : base;
  }, [overnightContinuing, filteredToday, hiddenCompanies]); // kept for ApproachingAlert (always today)

  const isFullyValidated = (t: TaskWithChapas) => {
    const real = t.chapas.filter((c) => c.nome_chapa);
    return (
      real.length > 0 &&
      real.every((c) => c.validacao_presenca === "presente" || c.validacao_presenca === "ausente")
    );
  };

  // Search by chapa name, task id, chapa phone, or company name (accent-insensitive)
  const searchMatchIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = normalize(search.trim());
    const onlyDigits = q.replace(/\D/g, "");
    return new Set(
      displayCards
        .filter((t) => {
          if (String(t.id_tarefa).includes(q)) return true;
          if (normalize(t.empresa ?? "").includes(q)) return true;
          if (t.chapas.some((c) => normalize(c.nome_chapa ?? "").includes(q))) return true;
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

  // Companies present in current visible cards — for dropdown
  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    displayCards.forEach((t) => {
      if (t.empresa) set.add(t.empresa);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allCards]);

  const isNotUploaded = (t: TaskWithChapas) =>
    (t.validacao_status ?? "aguardando") !== "subido_meu_chapa";

  const hasUmblerFup = (t: TaskWithChapas) => t.fup_log.some((f) => f.canal === "umbler_talk");

  const passesExtraFilters = (t: TaskWithChapas) => {
    if (companyFilter !== "__all__" && t.empresa !== companyFilter) return false;
    if (onlyNotUploaded && !isNotUploaded(t)) return false;
    if (onlyNoUmblerFup && hasUmblerFup(t)) return false;
    return true;
  };

  // Stats
  const totalChapas = displayCards.reduce((a, t) => a + (t.quantidade_chapas || t.chapas.length), 0);
  const confirmedChapas = displayCards.reduce(
    (a, t) => a + t.chapas.filter((c) => c.status_contato === "confirmado").length,
    0,
  );
  const fillPct = totalChapas > 0 ? Math.round((confirmedChapas / totalChapas) * 100) : 0;
  const fillTone = fillPct >= 80 ? "success" : fillPct >= 50 ? "warning" : "destructive";
  const validacaoPendente = displayCards.filter(
    (t) => (t.validacao_status ?? "aguardando") !== "subido_meu_chapa",
  ).length;

  // Urgent tasks — for banner action (only meaningful when on today)

  function applyToAll(value: boolean) {
    const next: Record<number, boolean | null> = {};
    displayCards.forEach((t) => {
      next[t.id_tarefa] = value;
    });
    setForceCollapseMap(next);
    setGlobalCollapsed(value);
    setOnlyPending(false);
  }
  function expandOnlyPending() {
    const next: Record<number, boolean | null> = {};
    displayCards.forEach((t) => {
      next[t.id_tarefa] = isFullyValidated(t);
    });
    setForceCollapseMap(next);
    setOnlyPending(true);
  }

  function doFlash(id: number) {
    const el = document.querySelector(`[data-task-card="${id}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary", "ring-offset-2");
    setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 500);
  }

  function flashTask(id: number) {
    const el = document.querySelector(`[data-task-card="${id}"]`) as HTMLElement | null;
    if (el) { doFlash(id); return; }

    // Task not in DOM — check if it exists but is hidden by an active filter
    const exists = allCards.some((t) => t.id_tarefa === id);
    if (!exists) return;

    setCompanyFilter("__all__");
    setOnlyNotUploaded(false);
    setOnlyNoUmblerFup(false);
    setSearch("");
    setHourFilter("");
    toast("Filtros removidos para exibir a tarefa");
    setTimeout(() => doFlash(id), 150);
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
        new Notification("✅ MCM", { body: "Notificações ativadas com sucesso." });
      } catch {
        /* noop */
      }
    } else {
      toast.error("Permissão de notificações negada");
    }
  }

  const { state: sidebarState, isMobile } = useSidebar();
  const toolbarLeft = isMobile
    ? "1rem"
    : sidebarState === "expanded"
    ? "calc(16rem + 1rem)"
    : "calc(3rem + 1rem)";

  const toolbarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(56);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setToolbarHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Color tokens for fill stat
  const fillStatColor =
    fillTone === "success" ? "text-success" : fillTone === "warning" ? "text-warning" : "text-destructive";
  const fillBarColor =
    fillTone === "success" ? "bg-success" : fillTone === "warning" ? "bg-warning" : "bg-destructive";

  return (
    <>
      {/* ── Floating toolbar — fixed, always visible ── */}
      <div
        ref={toolbarRef}
        className="fixed z-20 bg-card/90 backdrop-blur-md border border-border/60 rounded-2xl px-3 py-2.5 flex flex-wrap items-center gap-3 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.45)]"
        style={{
          left: toolbarLeft,
          top: "4.75rem",
          right: "1rem",
          transition: "left 200ms ease-linear",
        }}
      >
        <div className="relative flex-1 min-w-[260px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por chapa, empresa, nº de tarefa ou telefone… [/]"
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
          {/* View mode toggle */}
          <div className="flex items-center rounded-md border border-border overflow-hidden mr-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setViewMode("detailed")}
                  className={`h-[30px] px-2.5 flex items-center gap-1.5 text-xs font-medium transition-colors ${
                    viewMode === "detailed"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-label="Visualização detalhada"
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Visualização detalhada (cards)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setViewMode("panorama")}
                  className={`h-[30px] px-2.5 flex items-center gap-1.5 text-xs font-medium transition-colors border-l border-border ${
                    viewMode === "panorama"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-label="Visualização panorama"
                >
                  <Table2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Panorama</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Panorama — visão compacta de todas as tarefas</TooltipContent>
            </Tooltip>
          </div>

          {viewMode === "detailed" && (
            <>
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
            </>
          )}
          <Button
            size="sm"
            variant={onlyNotUploaded ? "default" : "ghost"}
            className={`h-[30px] gap-1.5 text-xs ${
              onlyNotUploaded
                ? "bg-warning/15 text-warning hover:bg-warning/25 border border-warning/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setOnlyNotUploaded((v) => !v)}
            title="Mostrar apenas tarefas ainda não subidas para o Meu Chapa"
          >
            <Upload className="h-3.5 w-3.5" />
            Não subidas
          </Button>
          <Button
            size="sm"
            variant={onlyNoUmblerFup ? "default" : "ghost"}
            className={`h-[30px] gap-1.5 text-xs ${
              onlyNoUmblerFup
                ? "bg-info/15 text-info hover:bg-info/25 border border-info/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setOnlyNoUmblerFup((v) => !v)}
            title="Mostrar apenas tarefas sem FUP disparado via Umbler Talk"
          >
            <Send className="h-3.5 w-3.5" />
            Sem FUP Umbler
          </Button>
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="h-[30px] text-xs w-[180px]">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="__all__">Todas as empresas</SelectItem>
                {companyOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {companyFilter !== "__all__" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-[30px] px-2 text-xs"
                onClick={() => setCompanyFilter("__all__")}
                aria-label="Limpar filtro de empresa"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
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

          <div className="hidden xl:flex items-center gap-2 text-[11px] text-muted-foreground/50 select-none border-l border-border pl-3 ml-1">
            <kbd className="px-1 rounded bg-muted font-mono text-[10px]">/</kbd><span>busca</span>
            <kbd className="px-1 rounded bg-muted font-mono text-[10px]">T</kbd><span>hoje</span>
            <kbd className="px-1 rounded bg-muted font-mono text-[10px]">←→</kbd><span>data</span>
            <kbd className="px-1 rounded bg-muted font-mono text-[10px]">1/2</kbd><span>vista</span>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() => setTrocaTurnoOpen(true)}
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span className="hidden sm:inline">Troca de Turno</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Gerar mensagem de Troca de Turno para o Teams</TooltipContent>
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

      {/* ── Page content ── */}
      <div
        className="px-4 md:px-6 pb-4 md:pb-6 space-y-6 max-w-[1400px] mx-auto"
        style={{ paddingTop: toolbarHeight + 24 }}
      >
        {/* ── Central de Atenção: AlertBanner + PriorityPanel ── */}
        <div className="space-y-2">
          <AlertBanner
            tasks={allCards}
            onFlashTask={flashTask}
            extraAlerts={[
              ...agendaAlerts,
              ...lembreteAlerts.map((la) => ({
                id: la.id,
                level: "info" as const,
                Icon: BellRing,
                text: `${la.empresa.toLowerCase()} · ${la.message}`,
                taskId: la.taskId,
                actionLabel: "Ver →",
              })),
            ]}
          />
          {isOnToday && (() => {
            const s = readSettings();
            if (!s.priorityPanelEnabled) return null;
            return (
              <PriorityPanel
                tasks={allCards}
                onFlashTask={flashTask}
                fillThreshold={s.fillRateWarningThreshold}
                hideMonitorar={s.priorityPanelHideMonitorar}
                lembreteItems={lembreteAlerts}
              />
            );
          })()}
        </div>

        {/* ── Listener Log ── */}
        {notifLog.length > 0 && (
          <WatcherLogPanel
            entries={notifLog}
            onClear={clearLog}
            onFlashTask={flashTask}
          />
        )}

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

      {/* Fill rate por empresa */}
      {!loading && displayCards.length > 1 && (() => {
        const companies = [...new Set(displayCards.map((t) => t.empresa))].sort();
        if (companies.length <= 1) return null;
        const companyStats = companies.map((emp) => {
          const ts = displayCards.filter((t) => t.empresa === emp);
          const total = ts.reduce((a, t) => a + (t.quantidade_chapas || t.chapas.length), 0);
          const present = ts.reduce((a, t) => a + t.chapas.filter((c) => c.validacao_presenca === "presente").length, 0);
          const fill = total > 0 ? Math.round((present / total) * 100) : 0;
          const bar = fill >= 80 ? "bg-success" : fill >= 50 ? "bg-warning" : "bg-destructive";
          const txt = fill >= 80 ? "text-success" : fill >= 50 ? "text-warning" : "text-destructive";
          return { emp, total, present, fill, bar, txt };
        }).sort((a, b) => a.fill - b.fill);
        return (
          <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCompanyBreakdown((v) => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-foreground">Fill rate por empresa</span>
                <span className="ml-2 text-[11px] text-muted-foreground">presença validada pelo cliente</span>
              </div>
              <span className="text-xs text-muted-foreground mr-1">{companies.length} empresas</span>
              {showCompanyBreakdown
                ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>
            {showCompanyBreakdown && (
              <div className="border-t border-border px-4 py-3 space-y-2.5">
                {companyStats.map((s) => (
                  <div key={s.emp} className="flex items-center gap-3 min-w-0">
                    <span className="text-sm text-foreground truncate flex-1 capitalize">{s.emp.toLowerCase()}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{s.present}/{s.total}</span>
                    <div className="w-24 h-1.5 rounded-full bg-muted shrink-0">
                      <div className={`h-full rounded-full transition-[width] duration-300 ${s.bar}`} style={{ width: `${s.fill}%` }} />
                    </div>
                    <span className={`text-sm font-semibold tabular-nums w-10 text-right shrink-0 ${s.txt}`}>{s.fill}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {overnightForDisplay.length > 0 && viewMode === "detailed" && (
        <section className="space-y-3">
          <h2 className="font-display font-semibold text-lg text-overnight flex items-center gap-2">
            <Moon className="h-5 w-5" /> Em andamento — iniciadas ontem
          </h2>
          {overnightForDisplay
            .filter((t) => passesExtraFilters(t) && (!searchMatchIds || searchMatchIds.has(t.id_tarefa)))
            .map((t) => (
              <TaskCard
                key={`ov-${t.id_tarefa}`}
                task={t}
                onRefresh={load}
                forceCollapse={forceCollapseMap[t.id_tarefa]}
                matchHighlight={!!(search && searchMatchIds?.has(t.id_tarefa))}
                newChapaKeys={newChapaKeys}
              />
            ))}
        </section>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-display font-semibold text-lg text-foreground">Tarefas</h2>
          {/* Date navigation */}
          <div className="flex items-center rounded-lg border border-border bg-card h-8 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                const d = new Date(`${selectedDate}T12:00:00-03:00`);
                d.setDate(d.getDate() - 1);
                setSelectedDate(d.toISOString().slice(0, 10));
              }}
              className="h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors border-r border-border"
              aria-label="Dia anterior"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <span className="text-sm font-medium px-3 tabular-nums min-w-[90px] text-center">
              {isOnToday ? "Hoje" : fmtSP(`${selectedDate}T12:00:00-03:00`, "EEE dd/MM")}
            </span>
            <button
              type="button"
              onClick={() => {
                const d = new Date(`${selectedDate}T12:00:00-03:00`);
                d.setDate(d.getDate() + 1);
                setSelectedDate(d.toISOString().slice(0, 10));
              }}
              className="h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors border-l border-border"
              aria-label="Próximo dia"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          {!isOnToday && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSelectedDate(todayISO)}>
              Hoje
            </Button>
          )}
        </div>
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
          {isOnToday && (
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
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-card">
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-5 flex-1 rounded" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-6 w-6 rounded ml-auto" />
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-28 rounded" />
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="h-6 w-6 rounded ml-auto" />
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : displayCards.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-8 flex items-center justify-center gap-4 flex-wrap">
          <Inbox className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-foreground">
            {isOnToday ? "Nenhuma tarefa — planilha ainda não importada." : `Nenhuma tarefa para ${fmtSP(`${selectedDate}T12:00:00-03:00`, "dd/MM/yyyy")}.`}
          </span>
          {isOnToday && (
            <Button size="sm" onClick={() => navigate("/importar")}>
              Importar →
            </Button>
          )}
        </div>
      ) : search && searchMatchIds && searchMatchIds.size === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
          Nenhum resultado para "{search}".
        </div>
      ) : viewMode === "panorama" ? (
        <TaskPanorama
          tasks={tasksForDisplay.filter(
            (t) => passesExtraFilters(t) && (!searchMatchIds || searchMatchIds.has(t.id_tarefa)),
          )}
          overnightTasks={overnightForDisplay.filter(
            (t) => passesExtraFilters(t) && (!searchMatchIds || searchMatchIds.has(t.id_tarefa)),
          )}
          onRefresh={load}
          threshold={readSettings().fillRateWarningThreshold}
        />
      ) : (
        (() => {
          const isTaskDone = (t: TaskWithChapas) =>
            t.chapas.length > 0 &&
            t.chapas.every((c) => c.status_contato === "confirmado") &&
            (t.validacao_status ?? "aguardando") === "subido_meu_chapa";
          const visible = tasksForDisplay.filter(
            (t) => passesExtraFilters(t) && (!searchMatchIds || searchMatchIds.has(t.id_tarefa)),
          );

          // Group by date (yyyy-MM-dd)
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
                        newChapaKeys={newChapaKeys}
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
                        newChapaKeys={newChapaKeys}
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

      <ApproachingAlert tasks={allCards} onRefresh={() => load(false)} />
      {diffResult && (
        <RefreshDiff
          diff={diffResult}
          open={diffOpen}
          onClose={() => setDiffOpen(false)}
          onFlashTask={flashTask}
        />
      )}
      <TrocaDeTurno open={trocaTurnoOpen} onClose={() => setTrocaTurnoOpen(false)} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  WatcherLogPanel — respostas detectadas pelo listener de notificações       */
/* -------------------------------------------------------------------------- */

const ACTION_META = {
  confirmado: {
    label: "Confirmado",
    Icon: UserCheck,
    cls: "bg-success/15 text-success border-success/30",
    dot: "bg-success",
  },
  recusou: {
    label: "Recusou",
    Icon: UserX,
    cls: "bg-warning/15 text-warning border-warning/40",
    dot: "bg-warning",
  },
  removido: {
    label: "Removido",
    Icon: Trash2,
    cls: "bg-destructive/15 text-destructive border-destructive/40",
    dot: "bg-destructive",
  },
} as const;

function fmtRelative(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)}h`;
}

function WatcherLogPanel({
  entries,
  onClear,
  onFlashTask,
}: {
  entries: WatcherActivity[];
  onClear: () => void;
  onFlashTask: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-semibold text-foreground">Confirmações Automáticas</span>
        <div className="flex items-center gap-2 ml-1">
          {(["confirmado", "recusou", "removido"] as const).map((a) => {
            const count = entries.filter((e) => e.action === a).length;
            if (!count) return null;
            const meta = ACTION_META[a];
            return (
              <span key={a} className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: `hsl(var(--${a === "confirmado" ? "success" : a === "recusou" ? "warning" : "destructive"}))` }}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {count} {meta.label.toLowerCase()}
              </span>
            );
          })}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="ml-auto mr-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
          aria-label="Limpar lista"
        >
          Limpar
        </button>
        <span className="text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {entries.map((entry) => {
            const meta = ACTION_META[entry.action];
            const Icon = meta.Icon;
            return (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.cls}`}>
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
                <span className="text-sm font-medium text-foreground capitalize truncate flex-1">
                  {entry.chapa_nome.toLowerCase()}
                </span>
                {entry.empresa && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px] shrink-0 capitalize">
                    {entry.empresa.toLowerCase()}
                    {entry.data_tarefa && ` · ${fmtSP(entry.data_tarefa, "HH:mm")}`}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                  {fmtRelative(entry.timestamp)}
                </span>
                {entry.task_id !== null && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs shrink-0 gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => onFlashTask(entry.task_id!)}
                  >
                    Ver
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
