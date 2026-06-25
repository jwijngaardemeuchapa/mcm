import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSearchParams, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { getDb, uuid, errMsg } from "@/lib/db";
import { readSettings } from "@/lib/settings";
import { invoke } from "@tauri-apps/api/core";
import { ingestTarefas } from "@/lib/ingestTarefas";
import { sincronizarMetabase30h } from "@/lib/metabaseSync";
import { logActivity } from "@/lib/activityLog";
import { ActivityBell } from "@/components/ActivityBell";
import { startUmblerBot, fmtTaskDateParam } from "@/lib/umbler";
import { bidDispatchQueue, type BidBatchState, type BidDispatchRecord } from "@/lib/dispatchQueue";
import { fmtSP, fmtDateTime, fmtTime, todayDateISO_SP } from "@/lib/datetime";
import { normalize } from "@/lib/normalize";
import { companyMatches } from "@/lib/company";
import { cepGeocoder } from "@/lib/geocode";
import { toast } from "sonner";
import { getLeoCache, parseRespostasBidCsv, getLeoConfig, syncLeo, normalizePhone } from "@/pages/AnaliseBase/modules/M_leo";
import type { LeoMetrics } from "@/pages/AnaliseBase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  RefreshCw,
  MapPin,
  Phone,
  Send,
  Check,
  X,
  DollarSign,
  ExternalLink,
  Loader2,
  Package,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Search,
  MessageCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Edit2,
  Upload,
  Smartphone,
  UserPlus,
  Ban,
  Database,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  BookMarked,
  Hash,
  Calendar,
  PhoneCall,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BidMatchmaker } from "@/components/BidMatchmaker";
import { BidRadar } from "@/components/BidRadar";
import { StatusBadge } from "@/components/StatusBadge";
import { AsoBadge } from "@/components/AsoBadge";

/* ── Types ─────────────────────────────────────────────────────── */

export type BidChapa = {
  _key: string;        // cpf for registry entries; bid_chapas.id for extras
  cpf: string | null;  // null for extras
  nome: string;
  telefone: string | null;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  rua: string | null;
  cep: string | null;
  numero: string | null;
  tarefas: number;
  data_primeira_tarefa: string | null;
  data_ultima_tarefa: string | null;
  situacao: string | null;
  bloqueio: string | null;
  motivo_bloqueio: string | null;
  aso: string | null;
  importado_em: string;
  lat: number | null;
  lng: number | null;
};

export type BidDisparo = {
  id: string;
  chapa_nome: string;
  motivo_nao?: string | null;
  chapa_telefone: string;
  id_tarefa: number | null;
  empresa: string | null;
  data_tarefa: string | null;
  params_json: string | null;
  data_disparo: string;
  status: string;
  data_resposta1: string | null;
  data_resposta2: string | null;
};

export type OpenTask = {
  id_tarefa: number;
  empresa: string;
  data_tarefa: string;
  cidade_uf: string | null;
  quantidade_chapas: number;
  alocados: number;
  status_tarefa: string;
};

export type ClienteAddress = {
  id: string;
  label: string;
  endereco: string;
  maps_link: string | null;
  lat: number | null;
  lng: number | null;
  cep: string | null;
};

export type DispatchParams = {
  local: string;
  mapsLink: string;
  sendMapsAsLocal: boolean;
  localLat: number | null;
  localLng: number | null;
  atividades: string;
  diaria: string;
  localCep: string;
  dataParam: string;
};

type RegistryRow = {
  cpf: string;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  tarefas: number;
  data_ultima_tarefa: string | null;
  situacao: string | null;
  bloqueio: string | null;
  motivo_bloqueio: string | null;
  aso: string | null;
};

export type RankedCandidate = BidChapa & {
  distance_km: number | null;
  score: number;
  is_occupied: boolean;
  disparo: BidDisparo | undefined;
};

function parseCidadeUf(s: string | null): { cidade: string; estado: string } | null {
  if (!s) return null;
  const i = s.lastIndexOf("/");
  if (i < 0) return { cidade: s.trim(), estado: "" };
  return { cidade: s.slice(0, i).trim(), estado: s.slice(i + 1).trim() };
}

function sitLabel(sit: string | null): { text: string; cls: string } {
  if (!sit) return { text: "—", cls: "text-muted-foreground/30" };
  const s = sit.toLowerCase();
  if (s === "ativo" || (s.includes("ativo") && !s.includes("não") && !s.includes("nao") && !s.includes("ainda")))
    return { text: "Ativo", cls: "text-success font-semibold" };
  if (s.includes("ainda não") || s.includes("ainda nao"))
    return { text: "Ainda não ativo", cls: "text-muted-foreground/50" };
  return { text: sit.slice(0, 14), cls: "text-muted-foreground/50" };
}

/* ── Helpers ────────────────────────────────────────────────────── */

// Parâmetros salvos antes da v0.9.81 guardavam a atividade completa ("Carga e Descarga");
// o template do bot já contém o prefixo — remove para não duplicar na mensagem.
function stripAtividadePrefix(s: string): string {
  return (s ?? "").replace(/^\s*carga e descarga( de)?\s*:?\s*/i, "");
}

function isParcialTipo(tipo: string): boolean {
  return tipo !== "__all__" && normalize(tipo).includes("parcial");
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseLatLngFromUrl(url: string): { lat: number; lng: number } | null {
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  const llMatch = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (llMatch) return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) };
  return null;
}

function computeScore(c: BidChapa, distKm: number | null, cepPrefix?: string | null, maxDist?: number, leoCache?: Map<string, LeoMetrics>, disparoStatus?: string): number {
  let score = 0;
  score += c.tarefas === 0 ? 10 : Math.min(c.tarefas, 100) * 1.0;
  const scale = maxDist ?? 30;
  if (distKm !== null) score += Math.max(0, scale - distKm) * (60 / scale);
  if (c.data_ultima_tarefa) {
    const days = (Date.now() - new Date(c.data_ultima_tarefa).getTime()) / 86400000;
    if (days < 30) score += 40; else if (days < 90) score += 20; else if (days < 180) score += 5;
  }
  const sit = (c.situacao ?? "").toLowerCase();
  if (sit.includes("ativo") && !sit.includes("não") && !sit.includes("nao") && !sit.includes("ainda")) score += 20;
  else if (sit.includes("ainda") || sit.includes("não ativo") || sit.includes("nao ativo")) score += 5;
  if (c.aso) score += 10;
  if (cepPrefix && distKm === null && c.cep && c.cep.replace(/\D/g, "").startsWith(cepPrefix)) score += 20;
  // Chapa tem interesse mas não tem app ou precisa de ajuda — ainda é candidato positivo
  if (disparoStatus && (STATUS_MANUAL as readonly string[]).includes(disparoStatus)) score += 30;
  if (leoCache && c.telefone) {
    const leo = leoCache.get(normalizePhone(c.telefone));
    if (leo) {
      if (leo.passa_75pct) score += 50;
      if (leo.repete) score += 20;
      if (leo.pct_sim < 0.2 && leo.total_ofertas >= 3) score -= 40;
    }
  }
  return score;
}

function extractCepFromText(text: string): string {
  const m = text.match(/\b(\d{5})-?(\d{3})\b/);
  return m ? `${m[1]}${m[2]}` : "";
}

function formatCep(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

async function clipCopy(text: string, msg: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  toast.success(msg);
}

/* ── Constants ──────────────────────────────────────────────────── */


const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  aguardando:     { label: "Aguardando",          cls: "bg-muted/40 text-muted-foreground border-border" },
  interesse_sim:  { label: "Interesse ✓",         cls: "bg-success/10 text-success border-success/30" },
  interesse_nao:  { label: "Sem Interesse",        cls: "bg-destructive/10 text-destructive border-destructive/30" },
  aceita_app:     { label: "Aceita App ✓",         cls: "bg-success/15 text-success border-success/40" },
  nao_aceita_app: { label: "Interesse — Sem App",  cls: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
  precisa_ajuda:  { label: "Interesse — Precisa Ajuda", cls: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
};

// Chapas com interesse real mas que precisam de ação manual (sem app ou precisam de ajuda)
const STATUS_MANUAL = ["nao_aceita_app", "precisa_ajuda"] as const;
const STATUS_POSITIVO = ["interesse_sim", "aceita_app"] as const;

// Prioridade de exibição na lista de respostas: o que exige ação fica no topo.
// 0 = interesse/aceite · 1 = manual · 2 = negativo · 3 = aguardando
function statusPriority(status: string): number {
  if ((STATUS_POSITIVO as readonly string[]).includes(status)) return 0;
  if ((STATUS_MANUAL as readonly string[]).includes(status)) return 1;
  if (status === "interesse_nao") return 2;
  return 3; // aguardando / desconhecido
}

// Momento da resposta (ou do disparo, se ainda não respondeu) para ordenação cronológica
function disparoRespTime(d: BidDisparo): number {
  const t = d.data_resposta1 || d.data_disparo;
  const ms = new Date(t).getTime();
  return isNaN(ms) ? 0 : ms;
}

const EMPTY_PARAMS: DispatchParams = {
  local: "",
  mapsLink: "",
  sendMapsAsLocal: false,
  localLat: null,
  localLng: null,
  atividades: "",
  diaria: "",
  localCep: "",
  dataParam: "",
};

/* ── BidTaskCard ────────────────────────────────────────────────── */

function BidTaskCard({
  task,
  disparos,
  onDisparoStatusUpdate,
  initialExpanded,
  leoCache,
  focusExtras,
  forceExpand,
  onDidExpand,
}: {
  task: OpenTask;
  disparos: BidDisparo[];
  onDisparoStatusUpdate: (id: string, status: string, step: 1 | 2) => Promise<void>;
  initialExpanded: boolean;
  leoCache?: Map<string, LeoMetrics>;
  focusExtras?: boolean;
  forceExpand?: boolean;
  onDidExpand?: () => void;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [dispatchParams, setDispatchParams] = useState<DispatchParams>(() => {
    try {
      const saved = localStorage.getItem(`bid_params_${task.id_tarefa}`);
      if (saved) {
        const parsed = { ...EMPTY_PARAMS, ...JSON.parse(saved) };
        parsed.atividades = stripAtividadePrefix(parsed.atividades);
        return parsed;
      }
    } catch { /* noop */ }
    return EMPTY_PARAMS;
  });
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [taskAddresses, setTaskAddresses] = useState<ClienteAddress[]>([]);
  const [matchedEmpresaNome, setMatchedEmpresaNome] = useState<string | null>(null);
  const [addrPickerOpen, setAddrPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchState, setBatchState] = useState<BidBatchState>(() => bidDispatchQueue.getBatchState(task.id_tarefa));
  const [dispatchingIds, setDispatchingIds] = useState<Set<string>>(new Set());
  const [showOccupied, setShowOccupied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [maxDistKm, setMaxDistKm] = useState(30);
  const [candidateView, setCandidateView] = useState<"disponiveis" | "bloqueados">("disponiveis");
  const [rawBlocked, setRawBlocked] = useState<BidChapa[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedLoaded, setBlockedLoaded] = useState(false);
  const [negOpen, setNegOpen] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [editingDisparoId, setEditingDisparoId] = useState<string | null>(null);
  const [rawCandidates, setRawCandidates] = useState<BidChapa[]>([]);
  const [occupiedCpfSet, setOccupiedCpfSet] = useState<Set<string>>(new Set());
  const [occupiedNameSet, setOccupiedNameSet] = useState<Set<string>>(new Set());
  const [allOccupiedChapas, setAllOccupiedChapas] = useState<{ nome_norm: string; empresa: string }[]>([]);
  const [blockedTipoFilter, setBlockedTipoFilter] = useState("__all__");
  const [blockedTipos, setBlockedTipos] = useState<string[]>([]);
  const [blockedMotivoFilter, setBlockedMotivoFilter] = useState("__all__");
  const [filterPositiveOnly, setFilterPositiveOnly] = useState(false);
  const [leoTierFilter, setLeoTierFilter] = useState<"alta" | "media" | "baixa" | null>(null);
  const [onlyExtras, setOnlyExtras] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, dir: "asc" | "desc" } | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [candReloadKey, setCandReloadKey] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusExtras) { setOnlyExtras(true); setExpanded(true); }
  }, [focusExtras]);

  // Recarrega candidatos quando extras são importados para esta tarefa — cobre o
  // caso do card já estar expandido (em que o efeito de load não re-executa).
  useEffect(() => {
    const onExtrasImported = (e: Event) => {
      const { taskId } = (e as CustomEvent<{ taskId: number }>).detail;
      if (taskId !== task.id_tarefa) return;
      setExpanded(true);
      setOnlyExtras(true);
      setCandReloadKey((k) => k + 1);
    };
    window.addEventListener("bid:extras-imported", onExtrasImported);
    return () => window.removeEventListener("bid:extras-imported", onExtrasImported);
  }, [task.id_tarefa]);

  useEffect(() => {
    if (forceExpand) {
      setExpanded(true);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      onDidExpand?.();
    }
  }, [forceExpand, onDidExpand]);

  const taskDisparos = useMemo(
    () => disparos.filter((d) => d.id_tarefa === task.id_tarefa),
    [disparos, task.id_tarefa],
  );
  // Respostas ordenadas por prioridade de ação (interesse/aceite no topo → aguardando no fim),
  // e dentro de cada grupo pela resposta mais recente primeiro.
  const sortedTaskDisparos = useMemo(
    () => [...taskDisparos].sort((a, b) => {
      const pa = statusPriority(a.status), pb = statusPriority(b.status);
      if (pa !== pb) return pa - pb;
      return disparoRespTime(b) - disparoRespTime(a);
    }),
    [taskDisparos],
  );

  useEffect(() => {
    try { localStorage.setItem(`bid_params_${task.id_tarefa}`, JSON.stringify(dispatchParams)); }
    catch { /* noop */ }
  }, [dispatchParams, task.id_tarefa]);

  useEffect(() => bidDispatchQueue.subscribeBatch(task.id_tarefa, setBatchState), [task.id_tarefa]);

  const vagas = Math.max(0, task.quantidade_chapas - task.alocados);
  const isBatchDispatching = !!batchState;
  const batchProgress = batchState?.progress ?? null;
  const waitSeconds = batchState?.waitSeconds ?? null;
  const configReady = !!(
    (dispatchParams.sendMapsAsLocal ? dispatchParams.mapsLink : dispatchParams.local) &&
    dispatchParams.atividades &&
    dispatchParams.diaria &&
    dispatchParams.localCep.replace(/\D/g, "").length >= 5
  );

  // Load addresses when first expanded — uses JS fuzzy match to handle LTDA/SA/accent differences
  useEffect(() => {
    if (!expanded) return;
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.select<{ nome: string; enderecos: string | null }[]>(
          "SELECT nome, enderecos FROM cliente_book WHERE enderecos IS NOT NULL AND enderecos != '[]' AND enderecos != ''",
        );
        const match = rows.find((r) => companyMatches(task.empresa, [r.nome]));
        if (match) setMatchedEmpresaNome(match.nome);
        const addrs: ClienteAddress[] = match?.enderecos ? JSON.parse(match.enderecos) : [];
        setTaskAddresses(addrs);
        if (addrs.length > 0 && !dispatchParams.local && !dispatchParams.mapsLink) {
          const first = addrs[0];
          setSelectedAddressId(first.id);
          const cepFromAddr = first.cep ?? extractCepFromText(first.endereco);
          setDispatchParams((p) => ({
            ...p,
            local: first.endereco,
            mapsLink: first.maps_link ?? "",
            localLat: first.lat,
            localLng: first.lng,
            localCep: p.localCep || formatCep(cepFromAddr),
          }));
        }
      } catch {
        setTaskAddresses([]);
      }
    })();
  }, [expanded, task.empresa]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load candidates from chapa_registry when card is expanded
  useEffect(() => {
    if (!expanded) { setRawCandidates([]); setOccupiedCpfSet(new Set()); setOccupiedNameSet(new Set()); setAllOccupiedChapas([]); setCandidatesLoading(false); return; }
    const cityUf = parseCidadeUf(task.cidade_uf);
    setCandidatesLoading(true);
    (async () => {
      try {
        const db = await getDb();
        const taskDate = fmtSP(task.data_tarefa, "yyyy-MM-dd");

        // data_tarefa é gravada com offset -03:00; DATE() converteria p/ UTC e
        // erraria o dia em tarefas após 21h (noturnas). substr(...,1,10) pega a
        // data local (SP) literal, batendo com fmtSP(task.data_tarefa).
        // byCpf/byName INCLUEM a própria tarefa: chapa já alocado nela não deve
        // ser oferecido em novo BID. allOccupied exclui (é a lista "outras tarefas").
        const [byCpf, byName, allOccupied] = await Promise.all([
          db.select<{ cpf: string }[]>(`
            SELECT DISTINCT c.cpf FROM chapas c
            JOIN tarefas t ON c.id_tarefa = t.id_tarefa
            WHERE substr(t.data_tarefa, 1, 10) = ? AND c.status_contato != 'removido'
            AND c.cpf IS NOT NULL
          `, [taskDate]),
          db.select<{ nome_norm: string }[]>(`
            SELECT DISTINCT LOWER(TRIM(c.nome_chapa)) as nome_norm FROM chapas c
            JOIN tarefas t ON c.id_tarefa = t.id_tarefa
            WHERE substr(t.data_tarefa, 1, 10) = ? AND c.status_contato != 'removido'
            AND c.nome_chapa IS NOT NULL
          `, [taskDate]),
          db.select<{ nome_norm: string; empresa: string }[]>(`
            SELECT LOWER(TRIM(c.nome_chapa)) as nome_norm, t.empresa
            FROM chapas c
            JOIN tarefas t ON c.id_tarefa = t.id_tarefa
            WHERE substr(t.data_tarefa, 1, 10) = ? AND c.status_contato != 'removido'
            AND c.nome_chapa IS NOT NULL AND t.id_tarefa != ?
            ORDER BY c.nome_chapa ASC
          `, [taskDate, task.id_tarefa]),
        ]);
        setOccupiedCpfSet(new Set(byCpf.map((r) => r.cpf.replace(/\D/g, ""))));
        setOccupiedNameSet(new Set(byName.map((r) => normalize(r.nome_norm))));
        setAllOccupiedChapas(allOccupied);

        if (!cityUf) { setRawCandidates([]); return; }

        // Cadastro geral (limitado) e extras (sem limite) são consultados
        // separadamente: extras são poucos e SEMPRE devem aparecer. No UNION
        // único com LIMIT, extras de baixa contagem de tarefas eram truncados
        // pelo ORDER BY tarefas DESC quando a cidade tinha muitos cadastrados.
        const [registry, extras] = await Promise.all([
          db.select<BidChapa[]>(`
            SELECT COALESCE(r.cpf, 'anon_' || r.rowid) as _key, r.cpf, r.nome, r.telefone, r.cidade, r.bairro, r.estado, r.rua,
                   REPLACE(REPLACE(r.cep,' ',''),'-','') as cep, r.numero, r.tarefas,
                   r.data_primeira_tarefa, r.data_ultima_tarefa, r.situacao, r.bloqueio,
                   r.motivo_bloqueio, r.aso, r.importado_em, r.fonte, cc.lat, cc.lng
            FROM chapa_registry r
            LEFT JOIN cep_cache cc ON REPLACE(REPLACE(r.cep,' ',''),'-','') = cc.cep
            WHERE (r.bloqueio IS NULL OR UPPER(r.bloqueio) LIKE '%DESBLOQUEADO%')
            AND UPPER(r.cidade) = UPPER(?) AND UPPER(r.estado) = UPPER(?)
            AND UPPER(COALESCE(r.situacao,'') || ' ' || COALESCE(r.nome,'')) NOT LIKE '%EXCLU%'
            ORDER BY r.tarefas DESC
            LIMIT 600
          `, [cityUf.cidade, cityUf.estado]),
          db.select<BidChapa[]>(`
            SELECT b.id as _key, NULL as cpf, b.nome, b.telefone, b.cidade, NULL as bairro, b.estado, NULL as rua,
                   NULL as cep, NULL as numero, b.tarefas_finalizadas as tarefas,
                   NULL as data_primeira_tarefa, NULL as data_ultima_tarefa, NULL as situacao,
                   NULL as bloqueio, NULL as motivo_bloqueio, NULL as aso,
                   b.importado_em, NULL as fonte, b.lat, b.lng
            FROM bid_chapas b
            WHERE b.id_tarefa = ?
            ORDER BY b.tarefas_finalizadas DESC
          `, [task.id_tarefa]),
        ]);
        const chapas = [...extras, ...registry];

        setRawCandidates(chapas);

        // Background geocode uncached CEPs
        const uncached = chapas.filter((c) => c.cep && c.lat === null);
        for (const c of uncached) {
          const cep = c.cep!;
          cepGeocoder.enqueue(cep, (_cep, coords) => {
            if (!coords) return;
            setRawCandidates((prev) => prev.map((p) => p.cep === cep ? { ...p, lat: coords.lat, lng: coords.lng } : p));
          });
        }
      } catch { /* silencioso */ }
      finally { setCandidatesLoading(false); }
    })();
  }, [expanded, task.id_tarefa, task.cidade_uf, task.data_tarefa, candReloadKey]); // eslint-disable-line

  // Load blocked chapas lazily when the "Bloqueados" tab is first opened
  useEffect(() => {
    if (candidateView !== "bloqueados" || blockedLoaded || !expanded) return;
    const cityUf = parseCidadeUf(task.cidade_uf);
    if (!cityUf) { setBlockedLoaded(true); return; }
    setBlockedLoading(true);
    (async () => {
      try {
        const db = await getDb();
        const [chapas, tiposRes] = await Promise.all([
          db.select<BidChapa[]>(`
            SELECT COALESCE(r.cpf, 'anon_' || r.rowid) as _key, r.cpf, r.nome, r.telefone, r.cidade, r.bairro, r.estado, r.rua,
                   REPLACE(REPLACE(r.cep,' ',''),'-','') as cep, r.numero, r.tarefas,
                   r.data_primeira_tarefa, r.data_ultima_tarefa, r.situacao, r.bloqueio,
                   r.motivo_bloqueio, r.aso, r.importado_em, r.fonte, cc.lat, cc.lng
            FROM chapa_registry r
            LEFT JOIN cep_cache cc ON REPLACE(REPLACE(r.cep,' ',''),'-','') = cc.cep
            WHERE r.bloqueio IS NOT NULL AND UPPER(r.bloqueio) NOT LIKE '%DESBLOQUEADO%'
            AND UPPER(r.cidade) = UPPER(?) AND UPPER(r.estado) = UPPER(?)
            AND UPPER(COALESCE(r.situacao,'') || ' ' || COALESCE(r.nome,'')) NOT LIKE '%EXCLU%'
            ORDER BY tarefas DESC LIMIT 400
          `, [cityUf.cidade, cityUf.estado]),
          db.select<{ bloqueio: string }[]>(`
            SELECT DISTINCT bloqueio FROM chapa_registry
            WHERE bloqueio IS NOT NULL AND UPPER(bloqueio) NOT LIKE '%DESBLOQUEADO%'
            AND UPPER(cidade) = UPPER(?) AND UPPER(estado) = UPPER(?)
            ORDER BY bloqueio
          `, [cityUf.cidade, cityUf.estado]),
        ]);
        setRawBlocked(chapas);
        setBlockedTipos(tiposRes.map((t) => t.bloqueio));
        setBlockedTipoFilter("__all__");
        const uncached = chapas.filter((c) => c.cep && c.lat === null);
        for (const c of uncached) {
          const cep = c.cep!;
          cepGeocoder.enqueue(cep, (_cep, coords) => {
            if (!coords) return;
            setRawBlocked((prev) => prev.map((p) => p.cep === cep ? { ...p, lat: coords.lat, lng: coords.lng } : p));
          });
        }
        setBlockedLoaded(true);
      } catch { /* silencioso */ }
      finally { setBlockedLoading(false); }
    })();
  }, [candidateView, blockedLoaded, expanded, task.cidade_uf]); // eslint-disable-line

  // Derive ranked candidates whenever raw data, coords, occupied sets, or disparos change
  const candidates = useMemo<RankedCandidate[]>(() => {
    const cepPrefix = dispatchParams.localCep
      ? dispatchParams.localCep.replace(/\D/g, "").slice(0, 5)
      : null;
    return rawCandidates.map((c) => {
      const isOccupied =
        (c.cpf != null && occupiedCpfSet.has(c.cpf.replace(/\D/g, ""))) ||
        occupiedNameSet.has(normalize(c.nome));
      let distKm: number | null = null;
      if (dispatchParams.localLat !== null && dispatchParams.localLng !== null && c.lat !== null && c.lng !== null)
        distKm = haversine(dispatchParams.localLat, dispatchParams.localLng, c.lat, c.lng);
      const disparo = taskDisparos.find((d) => normalize(d.chapa_nome) === normalize(c.nome));
      return {
        ...c,
        distance_km: distKm,
        score: isOccupied ? -9999 : computeScore(c, distKm, cepPrefix, maxDistKm, leoCache, disparo?.status),
        is_occupied: isOccupied,
        disparo,
      };
    }).sort((a, b) => {
      if (!sortConfig) return b.score - a.score;
      const dir = sortConfig.dir === "asc" ? 1 : -1;
      if (sortConfig.key === "nome") return dir * a.nome.localeCompare(b.nome);
      if (sortConfig.key === "dist") return dir * ((a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      if (sortConfig.key === "tarefas") return dir * (a.tarefas - b.tarefas);
      if (sortConfig.key === "situacao") return dir * (a.situacao || "").localeCompare(b.situacao || "");
      return b.score - a.score;
    });
  }, [rawCandidates, occupiedCpfSet, occupiedNameSet, dispatchParams.localLat, dispatchParams.localLng, dispatchParams.localCep, taskDisparos, maxDistKm, leoCache, sortConfig]);

  const leoTierFilteredCandidates = useMemo(() => {
    if (!leoTierFilter || !leoCache || leoCache.size === 0) return candidates;
    return candidates.filter((c) => {
      const leo = c.telefone ? leoCache.get(normalizePhone(c.telefone)) : undefined;
      if (leoTierFilter === "alta") return !!leo && leo.passa_75pct;
      if (leoTierFilter === "media") return !!leo && !leo.passa_75pct && leo.pct_sim >= 0.4;
      if (leoTierFilter === "baixa") return !!leo && leo.pct_sim < 0.3 && leo.total_ofertas >= 3;
      return true;
    });
  }, [candidates, leoTierFilter, leoCache]);

  const blockedCandidates = useMemo<RankedCandidate[]>(() => {
    const cepPrefix = dispatchParams.localCep
      ? dispatchParams.localCep.replace(/\D/g, "").slice(0, 5)
      : null;
    let pool = blockedTipoFilter === "__all__" ? rawBlocked : rawBlocked.filter((c) => c.bloqueio === blockedTipoFilter);
    if (isParcialTipo(blockedTipoFilter) && blockedMotivoFilter !== "__all__")
      pool = pool.filter((c) => (c.motivo_bloqueio ?? "").trim() === blockedMotivoFilter);
    return pool.map((c) => {
      let distKm: number | null = null;
      if (dispatchParams.localLat !== null && dispatchParams.localLng !== null && c.lat !== null && c.lng !== null)
        distKm = haversine(dispatchParams.localLat, dispatchParams.localLng, c.lat, c.lng);
      const disparo = taskDisparos.find((d) => normalize(d.chapa_nome) === normalize(c.nome));
      return {
        ...c,
        distance_km: distKm,
        score: computeScore(c, distKm, cepPrefix, maxDistKm, leoCache),
        is_occupied: false,
        disparo,
      };
    }).sort((a, b) => b.score - a.score);
  }, [rawBlocked, blockedTipoFilter, blockedMotivoFilter, dispatchParams.localLat, dispatchParams.localLng, dispatchParams.localCep, taskDisparos, maxDistKm, leoCache]);

  const blockedMotivos = useMemo<string[]>(() => {
    if (!isParcialTipo(blockedTipoFilter)) return [];
    const set = new Set<string>();
    rawBlocked
      .filter((c) => c.bloqueio === blockedTipoFilter)
      .forEach((c) => { const m = (c.motivo_bloqueio ?? "").trim(); if (m) set.add(m); });
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rawBlocked, blockedTipoFilter]);

  function handleAddressSelect(val: string) {
    setAddrPickerOpen(false);
    if (val === "__manual__") {
      setSelectedAddressId(null);
      setDispatchParams((p) => ({ ...p, localLat: null, localLng: null, localCep: "" }));
      return;
    }
    const addr = taskAddresses.find((a) => a.id === val);
    if (!addr) return;
    setSelectedAddressId(val);
    const cepFromAddr = addr.cep ?? extractCepFromText(addr.endereco);
    setDispatchParams((p) => ({
      ...p,
      local: addr.endereco,
      mapsLink: addr.maps_link ?? "",
      localLat: addr.lat,
      localLng: addr.lng,
      localCep: formatCep(cepFromAddr) || p.localCep,
    }));
  }

  async function saveCepToAddress() {
    if (!selectedAddressId || !matchedEmpresaNome || !dispatchParams.localCep) return;
    const cepClean = dispatchParams.localCep.replace(/\D/g, "");
    if (cepClean.length < 5) return;
    const formatted = cepClean.length === 8 ? `${cepClean.slice(0, 5)}-${cepClean.slice(5)}` : cepClean;
    const updated = taskAddresses.map((a) =>
      a.id === selectedAddressId ? { ...a, cep: formatted } : a,
    );
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE cliente_book SET enderecos = ? WHERE nome = ?",
        [JSON.stringify(updated), matchedEmpresaNome],
      );
      setTaskAddresses(updated);
      toast.success("CEP salvo no caderno de clientes.");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  function handleMapsLinkChange(url: string) {
    const coords = parseLatLngFromUrl(url);
    setDispatchParams((p) => ({
      ...p,
      mapsLink: url,
      localLat: coords?.lat ?? p.localLat,
      localLng: coords?.lng ?? p.localLng,
    }));
  }

  async function dispatchOne(candidate: RankedCandidate) {
    if (!candidate.telefone) { toast.error("Chapa sem telefone cadastrado."); return; }
    const localParam = dispatchParams.sendMapsAsLocal && dispatchParams.mapsLink
      ? dispatchParams.mapsLink
      : dispatchParams.local;
    if (!localParam || !dispatchParams.atividades || !dispatchParams.diaria) {
      toast.error("Preencha Local, Atividades e Diária antes de disparar.");
      return;
    }
    const settings = readSettings();
    const us = settings.umblerSettings;
    if (!us.bearerToken) { toast.error("Umbler não configurado. Acesse Integrações."); return; }
    if (!us.bidBotId || !us.bidBotTriggerName) {
      toast.error("Configure o Bot ID e o Trigger Name do BID em Integrações.");
      return;
    }
    const isBidD1 = fmtSP(task.data_tarefa, "yyyy-MM-dd") > todayDateISO_SP() && !!(us.bidBotD1Id && us.bidBotD1TriggerName);
    const bidBotIdToUse = isBidD1 ? us.bidBotD1Id : us.bidBotId;
    const bidTriggerToUse = isBidD1 ? us.bidBotD1TriggerName : us.bidBotTriggerName;

    setDispatchingIds((prev) => new Set(prev).add(candidate._key));
    try {
      await startUmblerBot({
        chapaTelefone: candidate.telefone,
        settings: us,
        initialData: {
          Data: dispatchParams.dataParam || fmtTaskDateParam(task.data_tarefa),
          Local: localParam,
          Atividades: dispatchParams.atividades,
          "Diária": `R$ ${dispatchParams.diaria}`,
        },
        botIdOverride: bidBotIdToUse,
        triggerNameOverride: bidTriggerToUse,
      });
      const dispId = uuid();
      const now = new Date().toISOString();
      const paramsJson = JSON.stringify({
        data: dispatchParams.dataParam || fmtTaskDateParam(task.data_tarefa),
        local: localParam,
        atividades: dispatchParams.atividades,
        diaria: dispatchParams.diaria,
      });
      const db = await getDb();
      await db.execute(
        "INSERT INTO bid_disparos (id,chapa_nome,chapa_telefone,id_tarefa,empresa,data_tarefa,params_json,data_disparo,status) VALUES (?,?,?,?,?,?,?,?,?)",
        [dispId, candidate.nome, candidate.telefone, task.id_tarefa, task.empresa, task.data_tarefa, paramsJson, now, "aguardando"],
      );
      const record: BidDispatchRecord = {
        id: dispId, id_tarefa: task.id_tarefa, chapa_nome: candidate.nome, chapa_telefone: candidate.telefone,
        empresa: task.empresa, data_tarefa: task.data_tarefa, params_json: paramsJson,
        data_disparo: now, status: "aguardando",
      };
      bidDispatchQueue.notifyDispatched(record);
      toast.success(`BID disparado para ${candidate.nome}`);
    } catch (e) {
      toast.error(`Falha ao disparar para ${candidate.nome}: ${errMsg(e)}`);
    } finally {
      setDispatchingIds((prev) => { const s = new Set(prev); s.delete(candidate._key); return s; });
    }
  }

  function handleDispatchSelected() {
    const pool = candidateView === "bloqueados" ? blockedCandidates : candidates;
    const toDispatch = pool.filter((c) => selectedIds.has(c._key) && c.telefone);
    if (toDispatch.length === 0) return;
    const us = readSettings().umblerSettings;
    if (!us.bidBotId || !us.bidBotTriggerName) {
      toast.error("Configure o Bot ID e o Trigger Name do BID (D0) em Integrações.");
      return;
    }
    const started = bidDispatchQueue.startBatch({
      taskId: task.id_tarefa,
      empresa: task.empresa,
      dataTarefa: task.data_tarefa,
      candidates: toDispatch.map((c) => ({ id: c._key, nome: c.nome, telefone: c.telefone! })),
      params: {
        local: dispatchParams.local,
        mapsLink: dispatchParams.mapsLink,
        sendMapsAsLocal: dispatchParams.sendMapsAsLocal,
        atividades: dispatchParams.atividades,
        diaria: dispatchParams.diaria,
        dataParam: dispatchParams.dataParam,
      },
    });
    if (started) setSelectedIds(new Set());
  }

  function toggleSelect(key: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasCoords = dispatchParams.localLat !== null;
  const cepPrefixFilter = dispatchParams.localCep
    ? dispatchParams.localCep.replace(/\D/g, "").slice(0, 5)
    : null;
  const hasCepFilter = !!cepPrefixFilter && cepPrefixFilter.length >= 5;
  const extrasCount = rawCandidates.filter((c) => c.cpf === null).length;
  const available = leoTierFilteredCandidates.filter((c) => {
    if (c.is_occupied) return false;
    if (c.disparo?.status === "aguardando") return false;
    if (onlyExtras && c.cpf !== null) return false;
    if (filterPositiveOnly && leoCache && leoCache.size > 0 && c.telefone) {
      const leo = leoCache.get(normalizePhone(c.telefone));
      if (leo && leo.pct_sim < 0.3 && leo.total_ofertas >= 3) return false;
    }
    return true;
  });
  const withinDist = hasCoords
    ? available.filter((c) => c.distance_km === null || c.distance_km <= maxDistKm)
    : hasCepFilter
      ? available.filter((c) => !c.cep || c.cep.replace(/\D/g, "").startsWith(cepPrefixFilter!))
      : available;
  const beyondDist = hasCoords
    ? available.filter((c) => c.distance_km !== null && c.distance_km > maxDistKm)
    : hasCepFilter
      ? available.filter((c) => !!c.cep && !c.cep.replace(/\D/g, "").startsWith(cepPrefixFilter!))
      : [];
  const useProximityFilter = hasCoords || hasCepFilter;
  const visibleCandidates = showAll
    ? (useProximityFilter ? [...withinDist, ...beyondDist] : available)
    : (useProximityFilter ? withinDist.slice(0, 40) : available.slice(0, 40));

  // Blocked visible — must be after hasCoords/hasCepFilter/cepPrefixFilter are defined
  const blockedWithinDist = hasCoords
    ? blockedCandidates.filter((c) => c.distance_km === null || c.distance_km <= maxDistKm)
    : hasCepFilter
      ? blockedCandidates.filter((c) => !c.cep || c.cep.replace(/\D/g, "").startsWith(cepPrefixFilter!))
      : blockedCandidates;
  const blockedVisible = blockedWithinDist;

  function toggleSelectAll() {
    const pool = candidateView === "bloqueados"
      ? blockedVisible.filter((c) => c.telefone)
      : available.filter((c) => c.telefone);
    const allSel = pool.length > 0 && pool.every((c) => selectedIds.has(c._key));
    setSelectedIds(allSel ? new Set() : new Set(pool.map((c) => c._key)));
  }

  return (
    <div ref={cardRef} className="rounded-xl border border-border bg-card overflow-hidden scroll-mt-4">
      {/* Card header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex flex-col gap-0.5 px-4 py-2.5 text-left transition-colors ${
          expanded ? "bg-primary/5 border-b border-border" : "hover:bg-muted/30"
        }`}
      >
        {/* Row 1: empresa + disparo badges + chevron */}
        <div className="flex items-center gap-2 w-full">
          <span className="font-semibold text-sm capitalize flex-1 truncate">{task.empresa.toLowerCase()}</span>
          {taskDisparos.length > 0 && (() => {
            const aguardando = taskDisparos.filter((d) => d.status === "aguardando").length;
            const positivo = taskDisparos.filter((d) => ["interesse_sim", "aceita_app"].includes(d.status)).length;
            const manual = taskDisparos.filter((d) => (STATUS_MANUAL as readonly string[]).includes(d.status)).length;
            const negativo = taskDisparos.filter((d) => d.status === "interesse_nao").length;
            return (
              <div className="flex items-center gap-1 shrink-0">
                {aguardando > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-warning px-1.5 py-0.5 rounded-full bg-warning/10 border border-warning/20 tabular-nums">
                    {aguardando}<Clock className="h-2.5 w-2.5" />
                  </span>
                )}
                {positivo > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-success px-1.5 py-0.5 rounded-full bg-success/10 border border-success/20 tabular-nums">
                    {positivo}<CheckCircle2 className="h-2.5 w-2.5" />
                  </span>
                )}
                {manual > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-500 px-1.5 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 tabular-nums">
                    {manual}<PhoneCall className="h-2.5 w-2.5" />
                  </span>
                )}
                {negativo > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-destructive px-1.5 py-0.5 rounded-full bg-destructive/10 border border-destructive/20 tabular-nums">
                    {negativo}<XCircle className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
            );
          })()}
          {task.status_tarefa === "Em Análise" && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border shrink-0">
              Em Análise
            </span>
          )}
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground/60 shrink-0" />}
        </div>
        {/* Row 2: time · city · alocados/total · vagas badge · task ID link */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{fmtTime(task.data_tarefa)}</span>
          {task.cidade_uf && <span>· {task.cidade_uf}</span>}
          <span className="tabular-nums">· {task.alocados}/{task.quantidade_chapas || "?"}</span>
          <Badge variant="outline" className="text-warning border-warning/40 bg-warning/5 text-[10px] px-1.5 py-0 h-4">
            {vagas} vaga{vagas !== 1 ? "s" : ""}
          </Badge>
          <a
            href={`https://app.meu-chapa.net/admin/edit-task/${task.id_tarefa}`}
            target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto font-mono text-[10px] text-muted-foreground/50 hover:text-primary flex items-center gap-0.5"
            title="Abrir tarefa no Meu Chapa"
          >
            #{task.id_tarefa}<ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </button>

      {expanded && (
        <>
          {/* ── Status Em Análise warning ── */}
          {task.status_tarefa === "Em Análise" && (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning leading-relaxed">
                <strong>Tarefa Em Análise</strong> — ainda não aprovada no sistema. Pode haver vagas em aberto, mas o BID não é recomendado até aprovação. FUP pode ser aplicado se necessário.
              </p>
            </div>
          )}
          {/* ── Configure ── */}
          <div className="p-4 border-b border-border bg-muted/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Configurar Disparo</span>
                {configReady && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-success">
                    <Check className="h-3 w-3" /> Configurado
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setNegOpen(true)} className="gap-1 h-7 text-xs text-muted-foreground hover:text-foreground">
                <DollarSign className="h-3.5 w-3.5" /> Calculadora
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Data / Horário do disparo
                </label>
                <div className="flex gap-2 items-center">
                  <Input
                    placeholder={fmtTaskDateParam(task.data_tarefa)}
                    value={dispatchParams.dataParam}
                    onChange={(e) => setDispatchParams((p) => ({ ...p, dataParam: e.target.value }))}
                    className="h-8 text-sm flex-1"
                  />
                  {dispatchParams.dataParam && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-muted-foreground"
                      onClick={() => setDispatchParams((p) => ({ ...p, dataParam: "" }))}
                    >
                      ↺ auto
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Local
                </label>
                <div className="flex gap-2">
                  {taskAddresses.length > 0 && (
                    <Popover open={addrPickerOpen} onOpenChange={setAddrPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="h-8 text-sm w-48 shrink-0 justify-between font-normal"
                        >
                          <span className="truncate">
                            {selectedAddressId
                              ? (taskAddresses.find((a) => a.id === selectedAddressId)?.label ?? "Selecionar…")
                              : "Manual"}
                          </span>
                          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Pesquisar endereço…" className="h-8 text-sm" />
                          <CommandList>
                            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                              Nenhum endereço encontrado.
                            </CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="manual"
                                onSelect={() => handleAddressSelect("__manual__")}
                                className="text-sm"
                              >
                                <span className="text-muted-foreground italic">Digitar manualmente</span>
                              </CommandItem>
                              {taskAddresses.map((a) => (
                                <CommandItem
                                  key={a.id}
                                  value={a.label}
                                  onSelect={() => handleAddressSelect(a.id)}
                                  className="text-sm"
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="truncate">{a.label}</span>
                                    {a.cep && (
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                        <Hash className="h-2.5 w-2.5" />{a.cep}
                                      </span>
                                    )}
                                  </div>
                                  {selectedAddressId === a.id && (
                                    <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                  <Input
                    placeholder="Endereço completo…"
                    value={dispatchParams.local}
                    onChange={(e) => setDispatchParams((p) => ({ ...p, local: e.target.value, localLat: null, localLng: null }))}
                    className="h-8 text-sm flex-1"
                  />
                </div>
              </div>

              {/* CEP do local — obrigatório para filtro de candidatos */}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Hash className="h-3 w-3" /> CEP do local
                  <span className="text-destructive ml-0.5">*</span>
                  <span className="font-normal text-muted-foreground/50">(obrigatório — filtra chapas próximos)</span>
                </label>
                <div className="flex gap-2 items-start">
                  <div className="flex flex-col gap-1">
                    <Input
                      placeholder="00000-000"
                      value={dispatchParams.localCep}
                      onChange={(e) => setDispatchParams((p) => ({ ...p, localCep: formatCep(e.target.value) }))}
                      className={`h-8 text-sm w-32 font-mono ${!dispatchParams.localCep ? "border-destructive/50 focus-visible:ring-destructive/30" : ""}`}
                      maxLength={9}
                    />
                    {!dispatchParams.localCep && (
                      <p className="text-[10px] text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" /> Informe o CEP para habilitar disparo
                      </p>
                    )}
                  </div>
                  {(() => {
                    const selectedAddr = taskAddresses.find((a) => a.id === selectedAddressId);
                    const savedCep = selectedAddr?.cep?.replace(/\D/g, "") ?? extractCepFromText(selectedAddr?.endereco ?? "");
                    const typedCep = dispatchParams.localCep.replace(/\D/g, "");
                    const canSave = !!selectedAddr && !!matchedEmpresaNome && typedCep.length === 8 && typedCep !== savedCep;
                    return canSave ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/5"
                        onClick={saveCepToAddress}
                      >
                        <BookMarked className="h-3 w-3" /> Salvar no cadastro
                      </Button>
                    ) : null;
                  })()}
                  {!matchedEmpresaNome && taskAddresses.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/50 self-center">
                      Cadastre o cliente em <b>Caderno de Clientes</b> para preencher automaticamente.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Link Maps
                  <span className="font-normal text-muted-foreground/50">(ativa ranking por distância)</span>
                </label>
                <Input
                  placeholder="https://maps.google.com/…"
                  value={dispatchParams.mapsLink}
                  onChange={(e) => handleMapsLinkChange(e.target.value)}
                  className="h-8 text-sm"
                />
                {hasCoords && (
                  <p className="text-[10px] text-success flex items-center gap-1">
                    <Check className="h-3 w-3" /> Coordenadas detectadas — ranking por proximidade ativo
                  </p>
                )}
                {dispatchParams.mapsLink && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-muted-foreground">Enviar no disparo:</span>
                    <div className="flex rounded-md border border-border overflow-hidden text-[11px]">
                      <button
                        type="button"
                        onClick={() => setDispatchParams((p) => ({ ...p, sendMapsAsLocal: false }))}
                        className={`px-2.5 py-1 transition-colors ${!dispatchParams.sendMapsAsLocal ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                      >
                        Texto
                      </button>
                      <button
                        type="button"
                        onClick={() => setDispatchParams((p) => ({ ...p, sendMapsAsLocal: true }))}
                        className={`px-2.5 py-1 transition-colors ${dispatchParams.sendMapsAsLocal ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                      >
                        Link Maps
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Atividade</label>
                <div className="flex items-center rounded-md border border-input bg-background h-8 overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                  <span className="pl-2.5 pr-1 text-xs text-muted-foreground whitespace-nowrap pointer-events-none select-none">
                    🛠️ Carga e descarga de
                  </span>
                  <Input
                    placeholder="Cimento, Materiais de Construção…"
                    value={dispatchParams.atividades}
                    onChange={(e) => setDispatchParams((p) => ({ ...p, atividades: e.target.value }))}
                    className="h-8 text-sm border-0 focus-visible:ring-0 px-1 flex-1"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  O template já contém "Carga e descarga de" — digite apenas o complemento.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Diária</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none select-none">R$</span>
                  <Input
                    type="number" min="0" placeholder="150"
                    value={dispatchParams.diaria}
                    onChange={(e) => setDispatchParams((p) => ({ ...p, diaria: e.target.value }))}
                    className="h-8 text-sm pl-8"
                  />
                </div>
              </div>

              <div className="sm:col-span-2 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/70 uppercase tracking-wider text-[10px]">Preview do template</span>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span><span className="text-foreground/60">Data:</span> {dispatchParams.dataParam || fmtTaskDateParam(task.data_tarefa)}</span>
                  <span><span className="text-foreground/60">Local:</span> {
                    dispatchParams.sendMapsAsLocal && dispatchParams.mapsLink
                      ? <span className="text-info/80 italic text-[10px]">link maps</span>
                      : dispatchParams.local || <em>—</em>
                  }</span>
                  <span><span className="text-foreground/60">Ativ.:</span> {dispatchParams.atividades ? `Carga e descarga de ${dispatchParams.atividades}` : <em>—</em>}</span>
                  <span><span className="text-foreground/60">Diária:</span> {dispatchParams.diaria ? `R$ ${dispatchParams.diaria}` : <em>—</em>}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Análise BID ── */}
          {leoCache && leoCache.size > 0 && (() => {
            const avail = candidates.filter((c) => !c.is_occupied);
            let alta = 0, media = 0, baixa = 0, semDados = 0;
            for (const c of avail) {
              const leo = c.telefone ? leoCache.get(normalizePhone(c.telefone)) : undefined;
              if (!leo) { semDados++; continue; }
              if (leo.passa_75pct) alta++;
              else if (leo.pct_sim >= 0.4) media++;
              else if (leo.pct_sim < 0.3 && leo.total_ofertas >= 3) baixa++;
              else semDados++;
            }
            const comHistorico = avail.filter((c) => {
              const leo = c.telefone ? leoCache.get(normalizePhone(c.telefone)) : undefined;
              return leo && leo.total_ofertas > 0;
            });
            const avgPct = comHistorico.length > 0
              ? comHistorico.reduce((s, c) => s + (leoCache.get(normalizePhone(c.telefone!))?.pct_sim ?? 0), 0) / comHistorico.length
              : null;
            const disparosEst = avgPct && avgPct > 0 && vagas > 0 ? Math.ceil(vagas / avgPct) : null;
            if (alta + media + baixa === 0) return null;
            return (
              <div className="px-4 py-2.5 border-b border-border bg-muted/20 space-y-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Análise BID</p>
                  {leoTierFilter && (
                    <button
                      type="button"
                      onClick={() => setLeoTierFilter(null)}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                    >
                      ✕ limpar filtro
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  {alta > 0 && (
                    <button
                      type="button"
                      onClick={() => setLeoTierFilter((f) => f === "alta" ? null : "alta")}
                      className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                        leoTierFilter === "alta"
                          ? "bg-success/15 border-success/40 ring-1 ring-success/30"
                          : "border-transparent hover:bg-success/10 hover:border-success/20"
                      }`}
                    >
                      <span className="font-bold text-success">{alta}</span>
                      <span className="text-muted-foreground">aprovados (&gt;75%)</span>
                    </button>
                  )}
                  {media > 0 && (
                    <button
                      type="button"
                      onClick={() => setLeoTierFilter((f) => f === "media" ? null : "media")}
                      className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                        leoTierFilter === "media"
                          ? "bg-warning/15 border-warning/40 ring-1 ring-warning/30"
                          : "border-transparent hover:bg-warning/10 hover:border-warning/20"
                      }`}
                    >
                      <span className="font-bold text-warning">{media}</span>
                      <span className="text-muted-foreground">médios (40–75%)</span>
                    </button>
                  )}
                  {baixa > 0 && (
                    <button
                      type="button"
                      onClick={() => setLeoTierFilter((f) => f === "baixa" ? null : "baixa")}
                      className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                        leoTierFilter === "baixa"
                          ? "bg-destructive/15 border-destructive/40 ring-1 ring-destructive/30"
                          : "border-transparent hover:bg-destructive/10 hover:border-destructive/20"
                      }`}
                    >
                      <span className="font-bold text-destructive">{baixa}</span>
                      <span className="text-muted-foreground">baixo (&lt;30%)</span>
                    </button>
                  )}
                  {semDados > 0 && (
                    <span className="flex items-center gap-1 px-2 py-1">
                      <span className="font-bold text-muted-foreground/60">{semDados}</span>
                      <span className="text-muted-foreground/50">sem dados</span>
                    </span>
                  )}
                  {disparosEst && vagas > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground/60 italic">
                      Para {vagas} vaga{vagas !== 1 ? "s" : ""}: ~{disparosEst} disparos estimados
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Candidatos ── */}
          <Tabs defaultValue="lista" className="w-full">
            <div className="px-4 py-2 flex items-center gap-2 border-b border-border bg-muted/10">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-4">Visualização</span>
              <TabsList className="h-8">
                <TabsTrigger value="lista" className="text-xs">Lista Clássica</TabsTrigger>
                <TabsTrigger value="matchmaker" className="text-xs">Matchmaker</TabsTrigger>
                <TabsTrigger value="radar" className="text-xs">Radar / Heatmap</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="lista" className="m-0 border-none p-0 outline-none">
          <div>
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2.5 flex-wrap">
              {/* Tab: Disponíveis / Bloqueados */}
              <div className="flex rounded-md border border-border overflow-hidden text-[11px] shrink-0">
                <button type="button"
                  onClick={() => { setCandidateView("disponiveis"); setShowAll(false); }}
                  className={`px-2.5 py-1 transition-colors ${candidateView === "disponiveis" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
                  Disponíveis
                </button>
                <button type="button"
                  onClick={() => { setCandidateView("bloqueados"); setShowAll(false); }}
                  className={`px-2.5 py-1 transition-colors ${candidateView === "bloqueados" ? "bg-destructive text-destructive-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
                  Bloqueados{blockedLoaded && rawBlocked.length > 0 ? ` (${rawBlocked.length})` : ""}
                </button>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1 flex items-center flex-wrap gap-1.5">
                {candidateView === "disponiveis" ? (
                  <>
                    {available.length > 0 && (
                      <span className="font-normal normal-case">
                        {available.length} disponíveis
                        {hasCoords ? ` · ${withinDist.length} em até ${maxDistKm} km` : hasCepFilter ? ` · ${withinDist.length} no CEP raiz` : ""}
                        {hasCoords && beyondDist.length > 0 && !showAll && (
                          <span className="text-muted-foreground/50"> · {beyondDist.length} além</span>
                        )}
                      </span>
                    )}
                    {(useProximityFilter ? withinDist : available).length > 40 && (
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); setShowAll((v) => !v); }}
                        className="font-normal normal-case text-primary hover:underline">
                        {showAll ? "mostrar menos" : `ver todos (${(useProximityFilter ? withinDist : available).length})`}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {blockedLoaded && (
                      <span className="font-normal normal-case text-destructive/70">
                        {blockedCandidates.length} bloqueados
                        {rawBlocked.length !== blockedCandidates.length ? ` de ${rawBlocked.length}` : " na cidade"}
                        {hasCoords ? ` · ${blockedWithinDist.length} em até ${maxDistKm} km` : ""}
                      </span>
                    )}
                    {blockedWithinDist.length > 40 && (
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); setShowAll((v) => !v); }}
                        className="font-normal normal-case text-primary hover:underline">
                        {showAll ? "mostrar menos" : `ver todos (${blockedWithinDist.length})`}
                      </button>
                    )}
                  </>
                )}
              </span>
              {hasCoords && (
                <Select value={String(maxDistKm)} onValueChange={(v) => { setMaxDistKm(Number(v)); setShowAll(false); }}>
                  <SelectTrigger className="h-6 w-[80px] text-[10px] border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 km</SelectItem>
                    <SelectItem value="20">20 km</SelectItem>
                    <SelectItem value="30">30 km</SelectItem>
                    <SelectItem value="50">50 km</SelectItem>
                    <SelectItem value="100">100 km</SelectItem>
                    <SelectItem value="999">Sem limite</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {candidateView === "bloqueados" && blockedTipos.length > 1 && (
                <Select value={blockedTipoFilter} onValueChange={(v) => { setBlockedTipoFilter(v); setBlockedMotivoFilter("__all__"); setShowAll(false); }}>
                  <SelectTrigger className="h-6 w-[160px] text-[10px] border-border/50">
                    <SelectValue placeholder="Tipo de bloqueio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os bloqueios</SelectItem>
                    {blockedTipos.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {candidateView === "bloqueados" && isParcialTipo(blockedTipoFilter) && blockedMotivos.length > 0 && (
                <Select value={blockedMotivoFilter} onValueChange={(v) => { setBlockedMotivoFilter(v); setShowAll(false); }}>
                  <SelectTrigger className="h-6 w-[180px] text-[10px] border-border/50">
                    <SelectValue placeholder="Motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os motivos</SelectItem>
                    {blockedMotivos.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {candidateView === "disponiveis" && (
                <button
                  type="button"
                  onClick={() => setShowOccupied((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showOccupied ? "Ocultar" : "Ver"} ocupados ({allOccupiedChapas.length})
                </button>
              )}
              {candidateView === "disponiveis" && extrasCount > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyExtras((v) => !v)}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                    onlyExtras
                      ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {onlyExtras ? `Extras (${extrasCount})` : `Só extras (${extrasCount})`}
                </button>
              )}
              {candidateView === "disponiveis" && leoCache && leoCache.size > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterPositiveOnly((v) => !v)}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                    filterPositiveOnly
                      ? "bg-success/10 border-success/30 text-success font-semibold"
                      : "border-border text-muted-foreground hover:border-success/20"
                  }`}
                >
                  Apenas BID positivo
                </button>
              )}
              {selectedIds.size > 0 && !isBatchDispatching && (
                <span className="text-xs text-muted-foreground">{selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}</span>
              )}
              {isBatchDispatching && (
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => bidDispatchQueue.abortBatch(task.id_tarefa)}
                >
                  <X className="h-3.5 w-3.5" /> Cancelar
                </Button>
              )}
              <Button
                size="sm" className="h-7 text-xs gap-1"
                disabled={
                  !selectedIds.size ||
                  !(dispatchParams.sendMapsAsLocal ? dispatchParams.mapsLink : dispatchParams.local) ||
                  !dispatchParams.atividades ||
                  !dispatchParams.diaria ||
                  !dispatchParams.localCep ||
                  isBatchDispatching
                }
                onClick={handleDispatchSelected}
              >
                {isBatchDispatching ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {waitSeconds !== null
                      ? `próximo em ${waitSeconds}s`
                      : batchProgress ? `${batchProgress.current}/${batchProgress.total}` : "…"}
                  </>
                ) : (
                  <><Send className="h-3.5 w-3.5" />Disparar{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}</>
                )}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <div
                className="hidden md:grid px-4 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 border-b border-border/50"
                style={{ gridTemplateColumns: "28px 24px 1fr 80px 60px 100px 100px 100px" }}
              >
                <span>
                  <input
                    type="checkbox" className="h-3.5 w-3.5 rounded"
                    checked={(() => {
                      const pool = candidateView === "bloqueados"
                        ? blockedVisible.filter((c) => c.telefone)
                        : available.filter((c) => c.telefone);
                      return pool.length > 0 && pool.every((c) => selectedIds.has(c._key));
                    })()}
                    onChange={toggleSelectAll}
                  />
                </span>
                                <span>#</span>
                <span className="cursor-pointer hover:underline flex items-center gap-1" onClick={() => toggleSort("nome")}>Nome {sortConfig?.key === "nome" && (sortConfig.dir === "asc" ? "↑" : "↓")}</span>
                <span className="cursor-pointer hover:underline flex items-center gap-1" onClick={() => toggleSort("dist")}>Distância {sortConfig?.key === "dist" && (sortConfig.dir === "asc" ? "↑" : "↓")}</span>
                <Tooltip>
                  <TooltipTrigger asChild><span className="cursor-pointer hover:underline decoration-dotted flex items-center gap-1" onClick={() => toggleSort("tarefas")}>Tarefas {sortConfig?.key === "tarefas" && (sortConfig.dir === "asc" ? "↑" : "↓")}</span></TooltipTrigger>
                  <TooltipContent>Total de tarefas realizadas</TooltipContent>
                </Tooltip>
                <span className="cursor-pointer hover:underline flex items-center gap-1" onClick={() => toggleSort("situacao")}>Situação {sortConfig?.key === "situacao" && (sortConfig.dir === "asc" ? "↑" : "↓")}</span>
                <span>Status</span><span />
              </div>

              <div ref={parentRef} className="max-h-[600px] overflow-auto divide-y divide-border/50">
                {/* Loading states */}
                {candidateView === "disponiveis" && candidatesLoading && rawCandidates.length === 0 && (
                  <div className="px-4 py-3 space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
                    ))}
                  </div>
                )}
                {candidateView === "bloqueados" && blockedLoading && (
                  <div className="px-4 py-3 space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-10 rounded-lg bg-destructive/10 animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
                    ))}
                  </div>
                )}
                {/* Empty states */}
                {candidateView === "disponiveis" && !candidatesLoading && rawCandidates.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground space-y-2">
                    <p>Sem chapas cadastrados para <b>{task.cidade_uf || "esta cidade"}</b>.</p>
                    <p className="text-muted-foreground/60">Verifique se o cadastro geral foi importado em <b>Importar &rsaquo; Cadastro Geral de Chapas</b>.</p>
                  </div>
                )}
                {candidateView === "bloqueados" && blockedLoaded && rawBlocked.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                    Nenhum chapa bloqueado cadastrado para {task.cidade_uf || "esta cidade"}.
                  </div>
                )}
                {/* Warning banner for blocked tab */}
                {candidateView === "bloqueados" && blockedLoaded && rawBlocked.length > 0 && (
                  <div className="px-4 py-2 bg-destructive/5 border-b border-destructive/20 flex items-center gap-2 text-xs text-destructive/80">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Estes chapas estão bloqueados. O disparo será feito mesmo assim — use com critério.
                  </div>
                )}
                <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const c = activeList[virtualItem.index];
                    const idx = virtualItem.index;
                  const sc = STATUS_CFG[c.disparo?.status ?? ""] ?? null;
                  const isDispatching = dispatchingIds.has(c._key);
                  const sit = sitLabel(c.situacao);
                  return (
                    <div
                      key={c._key}
                      className={`grid items-center px-4 py-2 gap-2 transition-colors hover:bg-muted/20 ${c.is_occupied ? "opacity-35" : ""}`}
                      style={{ 
    gridTemplateColumns: "28px 24px 1fr 80px 60px 100px 100px 100px",
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: `${virtualItem.size}px`,
    transform: `translateY(${virtualItem.start}px)`,
  }}
                    >
                      <div>
                        {!c.is_occupied && (
                          <input type="checkbox" className="h-3.5 w-3.5 rounded" checked={selectedIds.has(c._key)} onChange={() => toggleSelect(c._key)} />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground/50 tabular-nums font-mono">{idx + 1}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => clipCopy(c.nome, "Nome copiado")}
                            className="text-sm font-medium hover:text-primary hover:underline truncate text-left max-w-[180px]">
                            {c.nome}
                          </button>
                          {c.cpf === null && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-primary/10 text-primary border border-primary/25 leading-none">
                              EXTRA
                            </span>
                          )}
                          <AsoBadge aso={c.aso} />
                          {leoCache && leoCache.size > 0 && c.telefone && (() => {
                            const leo = leoCache.get(normalizePhone(c.telefone));
                            if (!leo) return null;
                            const cls = leo.passa_75pct
                              ? "text-success border-success/30 bg-success/10"
                              : leo.pct_sim >= 0.4
                                ? "text-warning border-warning/30 bg-warning/10"
                                : (leo.pct_sim < 0.3 && leo.total_ofertas >= 3)
                                  ? "text-destructive border-destructive/30 bg-destructive/10"
                                  : "text-muted-foreground border-border bg-muted/30";
                            const label = leo.passa_75pct ? "✓ Apr." : leo.pct_sim >= 0.4 ? "~ Med." : (leo.pct_sim < 0.3 && leo.total_ofertas >= 3) ? "✗ Baixo" : `${Math.round(leo.pct_sim * 100)}%`;
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={`text-[10px] font-bold px-1 py-0.5 rounded border cursor-help shrink-0 ${cls}`}>{label}</span>
                                </TooltipTrigger>
                                <TooltipContent>{Math.round(leo.pct_sim * 100)}% · {leo.total_sim}/{leo.total_ofertas} ofertas</TooltipContent>
                              </Tooltip>
                            );
                          })()}
                        </div>
                        {c.telefone && (
                          <button type="button" onClick={() => clipCopy(c.telefone!.replace(/\D/g, ""), "Telefone copiado")}
                            className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5">
                            <Phone className="h-2.5 w-2.5" />{c.telefone}
                          </button>
                        )}
                        {c.bairro && <div className="text-[10px] text-muted-foreground/40 mt-0.5 truncate">{c.bairro}</div>}
                      </div>
                      <div className="text-xs tabular-nums">
                        {c.distance_km !== null
                          ? <span className={c.distance_km > 30 ? "text-destructive/60" : ""}>{c.distance_km.toFixed(1)} km</span>
                          : c.cep
                            ? <span className="text-muted-foreground/30 text-[10px]">geocod…</span>
                            : <span className="text-muted-foreground/30">—</span>}
                      </div>
                      <div className="text-xs tabular-nums text-center">{c.tarefas}</div>
                      <div className={`text-[10px] truncate ${sit.cls}`}>{sit.text}</div>
                      <div>
                        {sc
                          ? <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span>
                          : <span className="text-[10px] text-muted-foreground/30">—</span>}
                      </div>
                      <div className="flex gap-0.5 justify-end">
                        {c.telefone && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a href={`https://api.whatsapp.com/send?phone=${(() => { const d = c.telefone.replace(/\D/g, ""); return d.startsWith("55") ? d : `55${d}`; })()}`}
                                target="_blank" rel="noopener noreferrer"
                                className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/40 hover:text-success hover:bg-success/10 transition-colors">
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>Abrir WhatsApp do chapa</TooltipContent>
                          </Tooltip>
                        )}
                        {c.telefone && dispatchParams.mapsLink && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a href={`https://api.whatsapp.com/send?phone=${(() => { const d = c.telefone.replace(/\D/g, ""); return d.startsWith("55") ? d : `55${d}`; })()}&text=${encodeURIComponent(dispatchParams.mapsLink)}`}
                                target="_blank" rel="noopener noreferrer"
                                className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/40 hover:text-info hover:bg-info/10 transition-colors">
                                <MapPin className="h-3.5 w-3.5" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>Enviar localização via WhatsApp</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" onClick={() => dispatchOne(c)}
                              disabled={isDispatching || c.is_occupied || !c.telefone}
                              className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 disabled:opacity-30 transition-colors">
                              {isDispatching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{c.disparo ? "Reenviar BID" : "Disparar BID"}</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
                  </div>

                {showOccupied && allOccupiedChapas.length > 0 && (
                  <div className="border-t border-border/40 bg-muted/5 px-4 py-2">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1.5">
                      Alocados em outras tarefas ({allOccupiedChapas.length})
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      {allOccupiedChapas.map((c, i) => (
                        <span key={i} className="text-xs text-muted-foreground opacity-60 capitalize">
                          {c.nome_norm} <span className="text-[10px] opacity-70">· {c.empresa}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!hasCoords && !hasCepFilter && candidates.length > 0 && (
              <div className="px-4 py-2 border-t border-border/50 bg-warning/5 flex items-center gap-2 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Informe o CEP do local para filtrar chapas próximos. Adicione um link Maps para ranking por distância exata.
              </div>
            )}
          </div>
            </TabsContent>

            <TabsContent value="matchmaker" className="m-0 border-none p-0 outline-none">
              <BidMatchmaker
                task={task}
                candidates={leoTierFilteredCandidates}
                dispatchParams={dispatchParams}
                onDispatch={(c) => {
                  if (c.disparo) return;
                  dispatchOne(c);
                }}
                maxDistKm={maxDistKm}
              />
            </TabsContent>

            <TabsContent value="radar" className="m-0 border-none p-0 outline-none">
              <BidRadar task={task} candidates={leoTierFilteredCandidates} dispatchParams={dispatchParams} />
            </TabsContent>
          </Tabs>

          {/* ── Respostas desta tarefa ── */}
          {taskDisparos.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap bg-muted/10">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">
                  Respostas · {taskDisparos.length} disparado{taskDisparos.length !== 1 ? "s" : ""}
                </span>
                <div className="flex gap-2.5 text-[10px] font-bold">
                  {(() => {
                    const a = taskDisparos.filter((d) => d.status === "aguardando").length;
                    const p = taskDisparos.filter((d) => ["interesse_sim", "aceita_app"].includes(d.status)).length;
                    const m = taskDisparos.filter((d) => (STATUS_MANUAL as readonly string[]).includes(d.status)).length;
                    const n = taskDisparos.filter((d) => d.status === "interesse_nao").length;
                    return <>
                      {a > 0 && <span className="flex items-center gap-0.5 text-warning tabular-nums">{a} aguard. <Clock className="h-3 w-3" /></span>}
                      {p > 0 && <span className="flex items-center gap-0.5 text-success tabular-nums">{p} interesse <CheckCircle2 className="h-3 w-3" /></span>}
                      {m > 0 && <span className="flex items-center gap-0.5 text-orange-500 tabular-nums">{m} manual <PhoneCall className="h-3 w-3" /></span>}
                      {n > 0 && <span className="flex items-center gap-0.5 text-destructive tabular-nums">{n} negativo <XCircle className="h-3 w-3" /></span>}
                    </>;
                  })()}
                </div>
              </div>
              <div className="divide-y divide-border/50">
                {sortedTaskDisparos.map((d) => {
                  const sc = STATUS_CFG[d.status] ?? STATUS_CFG.aguardando;
                  return (
                    <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 flex-wrap hover:bg-muted/10 transition-colors">
                      <div className="flex-1 min-w-[140px]">
                        <button type="button" onClick={() => clipCopy(d.chapa_nome, "Nome copiado")}
                          className="font-medium text-sm hover:text-primary hover:underline">
                          {d.chapa_nome}
                        </button>
                        <button type="button" onClick={() => clipCopy(d.chapa_telefone.replace(/\D/g, ""), "Telefone copiado")}
                          className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5">
                          <Phone className="h-2.5 w-2.5" /> {d.chapa_telefone}
                        </button>
                      </div>
                      <div className="text-[11px] text-muted-foreground space-y-0.5 shrink-0">
                        <div>Disparo: {fmtDateTime(d.data_disparo)}</div>
                        {d.data_resposta1 && <div>Resp.: {fmtDateTime(d.data_resposta1)}</div>}
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span>
                        {d.motivo_nao && (
                          <span className="text-[10px] text-orange-500 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                            {d.motivo_nao}
                          </span>
                        )}
                      </div>
                      {editingDisparoId === d.id ? (
                        <Select
                          value={d.status}
                          onValueChange={async (val) => {
                            await onDisparoStatusUpdate(d.id, val, 1);
                            setEditingDisparoId(null);
                          }}
                        >
                          <SelectTrigger className="h-6 w-[130px] text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                              <SelectItem key={key} value={key} className="text-xs">{cfg.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingDisparoId(d.id)}
                          className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/30 transition-colors"
                          title="Editar status"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      )}
                      {d.status === "interesse_sim" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 border-success/40 text-success hover:bg-success/10"
                            onClick={() => onDisparoStatusUpdate(d.id, "aceita_app", 2)}>
                            <Smartphone className="h-3 w-3 mr-1" /> Aceita App
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 border-warning/40 text-warning hover:bg-warning/10"
                            onClick={() => onDisparoStatusUpdate(d.id, "nao_aceita_app", 2)}>Não Aceita</Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 border-warning/40 text-warning hover:bg-warning/10"
                            onClick={() => onDisparoStatusUpdate(d.id, "precisa_ajuda", 2)}>Ajuda</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <NegociacaoDialog
        open={negOpen}
        onClose={() => setNegOpen(false)}
        diaria={dispatchParams.diaria}
        quantidadeChapas={task.quantidade_chapas}
      />
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */

export default function BIDDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"tarefas" | "bloqueados" | "cadastro">("tarefas");
  const [registryCount, setRegistryCount] = useState(0);
  const [extrasCount, setExtrasCount] = useState(0);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [extrasActivatedForTask, setExtrasActivatedForTask] = useState<number | null>(null);
  const [expandTaskId, setExpandTaskId] = useState<number | null>(null);
  const [respostasClearedAt, setRespostasClearedAt] = useState<number>(() => {
    const v = localStorage.getItem("bid_respostas_cleared_at");
    return v ? Number(v) : 0;
  });
  const [openTasks, setOpenTasks] = useState<OpenTask[]>([]);
  const [carteiraFilterInfo, setCarteiraFilterInfo] = useState<{ gruposAtivos: string[]; activeCount: number; totalCount: number; fallback: boolean } | null>(null);
  const [disparos, setDisparos] = useState<BidDisparo[]>([]);
  const prevDisparosRef = useRef<Map<string, string>>(new Map());
  const [selectedDay, setSelectedDay] = useState<"today" | "tomorrow">("today");
  const [search, setSearch] = useState("");
  const [cidadeFilter, setCidadeFilter] = useState("__all__");
  const [searchParams] = useSearchParams();
  const autoExpandId = searchParams.get("taskId") ? parseInt(searchParams.get("taskId")!) : null;
  const registryImportedAt = localStorage.getItem("chapa_registry_imported_at");
  const [leoCache, setLeoCache] = useState<Map<string, LeoMetrics>>(new Map());
  const [leoLastSync, setLeoLastSync] = useState<string | null>(null);
  const [leoSyncing, setLeoSyncing] = useState(false);
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [syncing30h, setSyncing30h] = useState(false);
  const bidCsvRef = useRef<HTMLInputElement>(null);

  async function handleSync30h() {
    setSyncing30h(true);
    const ok = await sincronizarMetabase30h(false);
    if (ok) loadAll();
    setSyncing30h(false);
  }

  async function handleSyncMetabase() {
    const s = readSettings();
    const cardId = s.metabaseTarefasCardId;
    if (!cardId) { toast.error("Configure o ID da pergunta do Metabase em Integrações"); return; }
    setMetaSyncing(true);
    try {
      const status = await invoke<{ configured: boolean }>("metabase_status");
      if (!status.configured) { toast.error("Metabase não configurado em Integrações"); return; }
      const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
      const result = await ingestTarefas(rows);
      localStorage.setItem("metabase_last_sync", new Date().toISOString());
      toast.success(`Sync concluído — ${result.tarefas} tarefas, ${result.chapas} chapas`);
      loadAll();
    } catch (e) {
      toast.error("Erro ao sincronizar com Metabase");
    } finally {
      setMetaSyncing(false);
    }
  }

  const [activeBatches, setActiveBatches] = useState<Map<number, NonNullable<BidBatchState>>>(() => bidDispatchQueue.getActiveBatches());
  useEffect(() => bidDispatchQueue.subscribeAnyBatch(() => setActiveBatches(bidDispatchQueue.getActiveBatches())), []);

  const refreshLeoCache = useCallback(async () => {
    try {
      const cache = await getLeoCache();
      setLeoCache(cache);
      const cfg = await getLeoConfig();
      setLeoLastSync(cfg.lastSync);
    } catch { /* silencioso */ }
  }, []);

  const loadAll = useCallback(async () => {
    refreshLeoCache();
    try {
      const db = await getDb();
      await db.execute(`CREATE TABLE IF NOT EXISTS bid_disparos (
        id TEXT PRIMARY KEY, chapa_nome TEXT NOT NULL,
        chapa_telefone TEXT NOT NULL, id_tarefa INTEGER,
        empresa TEXT, data_tarefa TEXT, params_json TEXT,
        data_disparo TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aguardando',
        data_resposta1 TEXT, data_resposta2 TEXT
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS bid_chapas (
        id TEXT PRIMARY KEY, nome TEXT NOT NULL, telefone TEXT,
        cidade TEXT, estado TEXT, lat REAL, lng REAL,
        tarefas_finalizadas INTEGER DEFAULT 0, usuario_app INTEGER DEFAULT 0,
        importado_em TEXT NOT NULL, id_tarefa INTEGER
      )`);
      try { await db.execute("ALTER TABLE bid_chapas ADD COLUMN id_tarefa INTEGER"); } catch { /* exists */ }
      try { await db.execute("ALTER TABLE bid_disparos ADD COLUMN motivo_nao TEXT"); } catch { /* exists */ }
      try { await db.execute("ALTER TABLE cliente_book ADD COLUMN enderecos TEXT"); } catch { /* exists */ }

      const [cntRows, extrasRows, tasks, disp, carteira] = await Promise.all([
        db.select<{ cnt: number }[]>("SELECT COUNT(*) as cnt FROM chapa_registry").catch(() => [{ cnt: 0 }]),
        db.select<{ cnt: number }[]>("SELECT COUNT(*) as cnt FROM bid_chapas").catch(() => [{ cnt: 0 }]),
        db.select<OpenTask[]>(`
          SELECT t.id_tarefa, t.empresa, t.data_tarefa, t.cidade_uf, t.quantidade_chapas, t.status_tarefa,
            (SELECT COUNT(*) FROM chapas c WHERE c.id_tarefa = t.id_tarefa
             AND c.nome_chapa IS NOT NULL AND c.status_contato != 'removido') as alocados
          FROM tarefas t
          WHERE t.ativo = 1
          AND t.status_tarefa NOT IN ('Em Andamento', 'Concluído', 'Finalizado')
          AND LOWER(t.status_tarefa) NOT LIKE 'cancel%'
          AND t.validacao_status != 'subido_meu_chapa'
          AND strftime('%s', t.data_tarefa) >= strftime('%s', datetime('now', '-2 hours'))
          AND DATE(t.data_tarefa) <= date('now', '+7 days')
          ORDER BY t.data_tarefa ASC
        `),
        db.select<BidDisparo[]>("SELECT * FROM bid_disparos WHERE DATE(data_disparo) >= date('now', '-1 day') ORDER BY data_disparo DESC"),
        db.select<{ nome_fantasia: string; grupo: string | null }[]>(
          "SELECT nome_fantasia, grupo FROM carteira"
        ).catch(() => [] as { nome_fantasia: string; grupo: string | null }[]),
      ]);

      const fixarSet = await db.select<{ nome_fantasia: string }[]>(
        "SELECT nome_fantasia FROM empresa_config WHERE fixar_visivel = 1"
      ).then((r) => new Set(r.map((x) => x.nome_fantasia))).catch(() => new Set<string>());

      const { carteiraGruposAtivos: gruposAtivos = [] } = readSettings();
      const carteiraRows = carteira ?? [];
      const allCarteiraNames = carteiraRows.map((r) => r.nome_fantasia);
      let carteiraNames: string[];
      let carteiraFilterActive = false;
      let namesByFilter: string[] = [];
      if (gruposAtivos.length > 0) {
        namesByFilter = carteiraRows
          .filter((r) => fixarSet.has(r.nome_fantasia) || (r.grupo !== null && gruposAtivos.includes(r.grupo)))
          .map((r) => r.nome_fantasia);
        carteiraNames = namesByFilter.length > 0 ? namesByFilter : allCarteiraNames;
        carteiraFilterActive = true;
      } else {
        carteiraNames = allCarteiraNames;
      }
      setCarteiraFilterInfo(carteiraFilterActive
        ? { gruposAtivos, activeCount: namesByFilter.length, totalCount: allCarteiraNames.length, fallback: namesByFilter.length === 0 }
        : null);
      const withVagas = tasks.filter((t) => {
        if (carteiraNames.length > 0 && !companyMatches(t.empresa, carteiraNames)) return false;
        return t.quantidade_chapas > t.alocados || t.quantidade_chapas === 0;
      });
      setRegistryCount(cntRows[0]?.cnt ?? 0);
      setExtrasCount(extrasRows[0]?.cnt ?? 0);
      setOpenTasks(withVagas);
      setDisparos(disp);

      // Detecta mudanças positivas de status no BID e persiste no ActivityBell
      if (prevDisparosRef.current.size > 0) {
        const nowMs = Date.now();
        const events: Promise<void>[] = [];
        for (const d of disp) {
          const prev = prevDisparosRef.current.get(d.id);
          if (!prev || prev === d.status) continue;
          if (d.status === "aceita_app" && prev !== "aceita_app") {
            events.push(logActivity({
              tipo: "bid_aceite",
              descricao: "Aceitou via app",
              chapa_nome: d.chapa_nome,
              empresa: d.empresa,
              id_tarefa: d.id_tarefa,
              timestamp: nowMs,
            }));
          } else if (d.status === "interesse_sim" && prev === "aguardando") {
            events.push(logActivity({
              tipo: "bid_interesse",
              descricao: "Confirmou interesse",
              chapa_nome: d.chapa_nome,
              empresa: d.empresa,
              id_tarefa: d.id_tarefa,
              timestamp: nowMs,
            }));
          }
        }
        if (events.length > 0) {
          await Promise.all(events);
          window.dispatchEvent(new CustomEvent("activity:new-diff"));
        }
      }
      prevDisparosRef.current = new Map(disp.map((d) => [d.id, d.status]));
    } catch (e) { toast.error(errMsg(e)); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const handle = () => { loadAll(); };
    window.addEventListener("fup:refresh", handle);
    return () => window.removeEventListener("fup:refresh", handle);
  }, [loadAll]);

  useEffect(() => {
    return bidDispatchQueue.subscribeDispatched((record) => {
      setDisparos((prev) => [{
        id: record.id,
        chapa_nome: record.chapa_nome,
        chapa_telefone: record.chapa_telefone,
        id_tarefa: record.id_tarefa,
        empresa: record.empresa,
        data_tarefa: record.data_tarefa,
        params_json: record.params_json,
        data_disparo: record.data_disparo,
        status: record.status,
        data_resposta1: null,
        data_resposta2: null,
      }, ...prev]);
    });
  }, []);

  async function handleBidCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const count = await parseRespostasBidCsv(String(ev.target?.result ?? ""));
        await refreshLeoCache();
        toast.success(`${count.toLocaleString("pt-BR")} números BID importados`);
      } catch (err) {
        toast.error(`Erro ao importar CSV: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(f, "utf-8");
  }

  async function handleSyncPlanilha() {
    try {
      const cfg = await getLeoConfig();
      if (!cfg.spreadsheetId || !cfg.serviceAccountJson) {
        toast.warning("Configure a planilha Leo em Configurações antes de sincronizar.");
        return;
      }
      setLeoSyncing(true);
      const count = await syncLeo(cfg.spreadsheetId, cfg.serviceAccountJson);
      await refreshLeoCache();
      toast.success(`${count.toLocaleString("pt-BR")} registros sincronizados da planilha`);
    } catch (err) {
      toast.error(`Erro ao sincronizar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLeoSyncing(false);
    }
  }

  async function updateDisparoStatus(id: string, status: string, step: 1 | 2) {
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      if (step === 1) await db.execute("UPDATE bid_disparos SET status=?, data_resposta1=? WHERE id=?", [status, now, id]);
      else await db.execute("UPDATE bid_disparos SET status=?, data_resposta2=? WHERE id=?", [status, now, id]);
      const d = disparos.find((x) => x.id === id);
      if (d) {
        await db.execute(
          `INSERT INTO resposta_log (id,tipo,chapa_nome,chapa_telefone,resposta,id_tarefa,empresa,data_tarefa,disparo_id,fonte,received_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [uuid(), "bid", d.chapa_nome, d.chapa_telefone, status, d.id_tarefa, d.empresa, d.data_tarefa, d.id, "manual", now],
        );
      }
      setDisparos((prev) => prev.map((d) =>
        d.id === id ? { ...d, status, [step === 1 ? "data_resposta1" : "data_resposta2"]: now } : d,
      ));
    } catch (e) { toast.error(errMsg(e)); }
  }

  const todayStr = todayDateISO_SP();
  const tomorrowStr = (() => {
    const d = new Date(`${todayStr}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const todayCount = openTasks.filter((t) => fmtSP(t.data_tarefa, "yyyy-MM-dd") === todayStr).length;
  const tomorrowCount = openTasks.filter((t) => fmtSP(t.data_tarefa, "yyyy-MM-dd") === tomorrowStr).length;
  const filteredTasks = openTasks.filter((t) => {
    const d = fmtSP(t.data_tarefa, "yyyy-MM-dd");
    return selectedDay === "today" ? d === todayStr : d === tomorrowStr;
  });
  const cidades = useMemo(
    () => ["__all__", ...Array.from(new Set(filteredTasks.map((t) => t.cidade_uf).filter(Boolean) as string[])).sort()],
    [filteredTasks],
  );
  const displayedTasks = useMemo(() => filteredTasks.filter((t) => {
    if (search && !normalize(t.empresa).includes(normalize(search))) return false;
    if (cidadeFilter !== "__all__" && t.cidade_uf !== cidadeFilter) return false;
    return true;
  }), [filteredTasks, search, cidadeFilter]);

  // Digest de respostas do BID: disparos que já responderam (não-aguardando), desde a última limpeza.
  const bidRespostas = useMemo(
    () => disparos
      .filter((d) => d.id_tarefa != null && d.status !== "aguardando" && disparoRespTime(d) > respostasClearedAt)
      .sort((a, b) => disparoRespTime(b) - disparoRespTime(a)),
    [disparos, respostasClearedAt],
  );

  function clearRespostas() {
    const now = Date.now();
    localStorage.setItem("bid_respostas_cleared_at", String(now));
    setRespostasClearedAt(now);
  }

  function handleVerResposta(d: BidDisparo) {
    if (d.id_tarefa == null) return;
    const dStr = d.data_tarefa ? fmtSP(d.data_tarefa, "yyyy-MM-dd") : null;
    if (dStr === tomorrowStr) setSelectedDay("tomorrow");
    else setSelectedDay("today");
    setSearch("");
    setCidadeFilter("__all__");
    setActiveTab("tarefas");
    setExpandTaskId(d.id_tarefa);
  }
  const taskGroups = displayedTasks.reduce<Record<string, OpenTask[]>>((acc, t) => {
    const key = fmtSP(t.data_tarefa, "yyyy-MM-dd");
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});
  function taskDateLabel(iso: string): string {
    if (iso === todayStr) return "Hoje";
    if (iso === tomorrowStr) return "Amanhã";
    return fmtSP(`${iso}T12:00:00-03:00`, "EEEE dd/MM");
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 pb-16">
      <input ref={bidCsvRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleBidCsvImport} />
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-xl">BID Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {registryCount > 0
              ? `${registryCount.toLocaleString("pt-BR")} chapas no cadastro${registryImportedAt ? ` · atualizado ${fmtDateTime(registryImportedAt)}` : ""}`
              : "Importe o cadastro geral de chapas para começar"}
          </p>
          {leoCache.size > 0 && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              BID: {leoCache.size.toLocaleString("pt-BR")} números
              {leoLastSync ? ` · atualizado ${fmtDateTime(leoLastSync)}` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <ActivityBell />
          <Button variant="outline" size="sm" onClick={handleSyncMetabase} disabled={metaSyncing} className="gap-1.5 h-8">
            <RefreshCw className={`h-3.5 w-3.5 ${metaSyncing ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleSync30h} disabled={syncing30h} className="gap-1.5 h-8">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing30h ? "animate-spin" : ""}`} /> Sync amanhã
          </Button>
          <Button variant="outline" size="sm" onClick={() => bidCsvRef.current?.click()} className="gap-1.5 h-8">
            <Upload className="h-3.5 w-3.5" /> Importar CSV BID
          </Button>
          <Button variant="outline" size="sm" onClick={handleSyncPlanilha} disabled={leoSyncing} className="gap-1.5 h-8">
            {leoSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Planilha BID
          </Button>
          <Button size="sm" variant="outline" onClick={() => setExtrasOpen(true)} className="gap-1.5 h-8">
            <UserPlus className="h-3.5 w-3.5" /> Extras{extrasCount > 0 ? ` (${extrasCount.toLocaleString("pt-BR")})` : ""}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/importar")} className="gap-1.5 h-8">
            <Upload className="h-3.5 w-3.5" /> Cadastro de Chapas
          </Button>
        </div>
      </div>

      {/* Tab navigation — sempre visível */}
      <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg w-fit">
        {(["tarefas", "bloqueados", "cadastro"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "tarefas" && <Send className="h-3 w-3" />}
            {tab === "bloqueados" && <Ban className="h-3 w-3" />}
            {tab === "cadastro" && <Database className="h-3 w-3" />}
            {tab === "tarefas" ? "Tarefas" : tab === "bloqueados" ? "Bloqueados" : "Cadastro"}
          </button>
        ))}
      </div>

      {/* ── Indicador de filtro de carteira ── */}
      {carteiraFilterInfo && (
        <div className={`flex items-center gap-2 flex-wrap px-3 py-2 rounded-lg border text-xs ${carteiraFilterInfo.fallback ? "bg-warning/10 border-warning/30 text-warning" : "bg-primary/5 border-primary/20 text-muted-foreground"}`}>
          <span className="font-semibold text-foreground">Filtro de carteira:</span>
          {carteiraFilterInfo.gruposAtivos.map((g) => (
            <span key={g} className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">{g}</span>
          ))}
          {carteiraFilterInfo.fallback
            ? <span className="text-warning font-medium">· Nenhuma empresa com esses grupos — mostrando todas</span>
            : <span>· {carteiraFilterInfo.activeCount} de {carteiraFilterInfo.totalCount} empresas ativas</span>
          }
        </div>
      )}

      {/* ── Digest de respostas do BID ── */}
      {activeTab === "tarefas" && bidRespostas.length > 0 && (
        <BidRespostasDigest
          respostas={bidRespostas}
          onClear={clearRespostas}
          onVer={handleVerResposta}
        />
      )}

      {/* Day selector + search + filters */}
      {registryCount > 0 && activeTab === "tarefas" && (
        <div className="space-y-2">
          {/* Day toggle */}
          <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg w-fit">
            <button
              type="button"
              onClick={() => { setSelectedDay("today"); setSearch(""); setCidadeFilter("__all__"); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                selectedDay === "today"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Hoje
              {todayCount > 0 && (
                <span className={`ml-1.5 tabular-nums ${selectedDay === "today" ? "text-primary" : "text-muted-foreground/60"}`}>
                  {todayCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setSelectedDay("tomorrow"); setSearch(""); setCidadeFilter("__all__"); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                selectedDay === "tomorrow"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Amanhã
              {tomorrowCount > 0 && (
                <span className={`ml-1.5 tabular-nums ${selectedDay === "tomorrow" ? "text-primary" : "text-muted-foreground/60"}`}>
                  {tomorrowCount}
                </span>
              )}
            </button>
          </div>

          {/* Search + city filter */}
          {filteredTasks.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar empresa…"
                  className="pl-9 h-9 text-sm"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {cidades.length > 2 && (
                <Select value={cidadeFilter} onValueChange={setCidadeFilter}>
                  <SelectTrigger className="h-9 w-[160px] text-xs">
                    <SelectValue placeholder="Cidade/UF" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas as cidades</SelectItem>
                    {cidades.slice(1).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(search || cidadeFilter !== "__all__") && (
                <>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {displayedTasks.length} de {filteredTasks.length} tarefa{filteredTasks.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setSearch(""); setCidadeFilter("__all__"); }}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> Limpar
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state — registry not imported */}
      {registryCount === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border p-14 text-center space-y-3">
          <Package className="h-10 w-10 mx-auto text-muted-foreground/20" />
          <p className="font-semibold">Cadastro geral não importado</p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Importe o arquivo semanal de chapas na página Importar para ativar as recomendações do BID.
          </p>
          <Button onClick={() => navigate("/importar")} className="gap-1.5">
            <Upload className="h-4 w-4" /> Ir para Importar
          </Button>
        </div>
      )}

      {registryCount > 0 && activeTab === "tarefas" && (
        <>
          {/* Task cards grouped by date */}
          {activeBatches.size > 0 && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5 flex items-center gap-3 flex-wrap">
              <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
              <span className="text-sm font-medium text-primary flex-1">Disparando BID em lote</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {Array.from(activeBatches.entries()).map(([taskId, state]) => {
                  const t = openTasks.find((o) => o.id_tarefa === taskId);
                  return (
                    <span key={taskId} className="tabular-nums">
                      {t ? t.empresa.substring(0, 22) : `#${taskId}`}
                      {" "}· {state.progress.current}/{state.progress.total}
                      {state.waitSeconds !== null ? ` (${state.waitSeconds}s)` : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {filteredTasks.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Nenhuma tarefa com vagas em aberto {selectedDay === "today" ? "para hoje" : "para amanhã"}.
            </div>
          ) : displayedTasks.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada para os filtros aplicados.</p>
              <button
                type="button"
                onClick={() => { setSearch(""); setCidadeFilter("__all__"); }}
                className="text-xs text-primary hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(taskGroups).map(([dateIso, tasks]) => (
                <div key={dateIso} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60 capitalize">
                      {taskDateLabel(dateIso)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">· {tasks.length} tarefa{tasks.length !== 1 ? "s" : ""}</span>
                  </div>
                  {tasks.map((t) => (
                    <BidTaskCard
                      key={t.id_tarefa}
                      task={t}
                      disparos={disparos}
                      onDisparoStatusUpdate={updateDisparoStatus}
                      initialExpanded={t.id_tarefa === autoExpandId}
                      leoCache={leoCache.size > 0 ? leoCache : undefined}
                      focusExtras={extrasActivatedForTask === t.id_tarefa}
                      forceExpand={expandTaskId === t.id_tarefa}
                      onDidExpand={() => setExpandTaskId(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

        </>
      )}

      {activeTab === "bloqueados" && (
        registryCount > 0
          ? <BloqueadosTab />
          : <SemCadastroAviso />
      )}
      {activeTab === "cadastro" && (
        registryCount > 0
          ? <CadastroTab />
          : <SemCadastroAviso />
      )}

      <ImportExtrasDialog
        open={extrasOpen}
        onClose={() => setExtrasOpen(false)}
        onDone={(taskId?: number) => {
          loadAll();
          if (taskId != null) {
            setExtrasActivatedForTask(taskId);
            window.dispatchEvent(new CustomEvent("bid:extras-imported", { detail: { taskId } }));
          }
        }}
        openTasks={openTasks}
      />
    </div>
  );
}

/* ── BID Respostas Digest ───────────────────────────────────────── */

function BidRespostasDigest({ respostas, onClear, onVer }: {
  respostas: BidDisparo[];
  onClear: () => void;
  onVer: (d: BidDisparo) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const positivo = respostas.filter((d) => (STATUS_POSITIVO as readonly string[]).includes(d.status)).length;
  const manual = respostas.filter((d) => (STATUS_MANUAL as readonly string[]).includes(d.status)).length;
  const negativo = respostas.filter((d) => d.status === "interesse_nao").length;

  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <MessageCircle className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-semibold text-foreground">Respostas do BID</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{respostas.length}</span>
        <div className="flex items-center gap-2.5 ml-1 text-[11px] font-bold">
          {positivo > 0 && <span className="flex items-center gap-1 text-success tabular-nums">{positivo} interesse <CheckCircle2 className="h-3 w-3" /></span>}
          {manual > 0 && <span className="flex items-center gap-1 text-orange-500 tabular-nums">{manual} manual <PhoneCall className="h-3 w-3" /></span>}
          {negativo > 0 && <span className="flex items-center gap-1 text-destructive tabular-nums">{negativo} negativo <XCircle className="h-3 w-3" /></span>}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="ml-auto mr-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
          aria-label="Limpar respostas"
        >
          Limpar
        </button>
        <span className="text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border max-h-[320px] overflow-y-auto">
          {respostas.map((d) => {
            const sc = STATUS_CFG[d.status] ?? STATUS_CFG.aguardando;
            return (
              <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sc.cls}`}>{sc.label}</span>
                <span className="text-sm font-medium text-foreground capitalize truncate flex-1 min-w-[120px]">
                  {d.chapa_nome.toLowerCase()}
                </span>
                {d.empresa && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px] shrink-0 capitalize">
                    {d.empresa.toLowerCase()}
                    {d.data_tarefa && ` · ${fmtSP(d.data_tarefa, "HH:mm")}`}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 hidden sm:block">
                  {fmtDateTime(d.data_resposta1 || d.data_disparo)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs shrink-0 gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => onVer(d)}
                >
                  Ver
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Negotiation Dialog ─────────────────────────────────────────── */

function NegociacaoDialog({ open, onClose, diaria, quantidadeChapas }: {
  open: boolean; onClose: () => void; diaria: string; quantidadeChapas: number;
}) {
  const [valorTotal, setValorTotal] = useState("");
  const [qtd, setQtd] = useState(quantidadeChapas > 0 ? String(quantidadeChapas) : "");

  const total = parseFloat(valorTotal) || 0;
  const quantidade = parseInt(qtd) || 0;
  const diariaPorChapa = parseFloat(diaria) || 0;
  const custoChapas = diariaPorChapa * quantidade;
  const lucro = total - custoChapas;
  const margemPct = total > 0 ? (lucro / total) * 100 : 0;
  const maxSustentavel = quantidade > 0 ? (total * 0.7) / quantidade : 0;
  const fmtR = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const margemColor = margemPct >= 35 ? "text-success" : margemPct >= 15 ? "text-warning" : "text-destructive";
  const margemBorder = margemPct >= 35 ? "border-success/20 bg-success/5" : margemPct >= 15 ? "border-warning/20 bg-warning/5" : "border-destructive/20 bg-destructive/5";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Calculadora de Negociação
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Receita da tarefa (R$)</label>
              <Input type="number" min="0" placeholder="Ex: 2500" value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Qtd. chapas</label>
              <Input type="number" min="1" placeholder="Ex: 5" value={qtd} onChange={(e) => setQtd(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm">
            <span className="text-xs text-muted-foreground">Diária ofertada / chapa</span>
            <span className="font-semibold">{diariaPorChapa > 0 ? fmtR(diariaPorChapa) : "—"}</span>
          </div>
          {total > 0 && quantidade > 0 && (
            <div className={`rounded-lg border p-3.5 space-y-2 ${margemBorder}`}>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Receita</span><span className="font-medium text-foreground">{fmtR(total)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Custo chapas ({quantidade} × {fmtR(diariaPorChapa)})</span>
                  <span className="font-medium">− {fmtR(custoChapas)}</span>
                </div>
                <Separator />
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-foreground">Lucro da empresa</span>
                  <div className="text-right">
                    <span className={`font-bold text-base ${margemColor}`}>{fmtR(lucro)}</span>
                    <span className={`text-xs ml-1.5 font-semibold ${margemColor}`}>({margemPct.toFixed(0)}%)</span>
                  </div>
                </div>
              </div>
              {maxSustentavel > 0 && (
                <div className="pt-1.5 border-t border-border/40 flex justify-between text-xs text-muted-foreground">
                  <span>Máx. sustentável/chapa <span className="opacity-60">(margem 30%)</span></span>
                  <span className="font-medium">{fmtR(maxSustentavel)}</span>
                </div>
              )}
              {lucro < 0 && (
                <p className="text-xs text-destructive flex items-center gap-1 pt-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Custo de chapas supera a receita — operação no prejuízo
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter><Button onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Import Extras Dialog ───────────────────────────────────────── */

type ExtrasRow = {
  nome: string;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  lat: number | null;
  lng: number | null;
  tarefas: number;
};

function ImportExtrasDialog({ open, onClose, onDone, openTasks }: {
  open: boolean;
  onClose: () => void;
  onDone: (taskId?: number) => void;
  openTasks: OpenTask[];
}) {
  const [extRows, setExtRows] = useState<ExtrasRow[]>([]);
  const [preview, setPreview] = useState<{ count: number; format: "csv" | "xlsx" } | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() { setExtRows([]); setPreview(null); setProgress(0); setSelectedTaskId(null); }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  function handleFile(f: File) {
    reset();
    if (f.name.toLowerCase().endsWith(".csv")) parseCsvFile(f);
    else parseXlsxFile(f);
  }

  function parseCsvFile(f: File) {
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.toLowerCase().trim(),
      complete: (result) => {
        const fields = result.meta.fields ?? [];
        if (!fields.includes("nome") || !fields.includes("telefone")) {
          toast.error("CSV precisa ter colunas 'nome' e 'telefone'.");
          return;
        }
        const parsed = result.data.map((row) => ({
          nome: (row.nome ?? "").trim(),
          telefone: (row.telefone ?? "").replace(/\D/g, "") || null,
          cidade: (row.cidade ?? "").trim() || null,
          estado: (row.estado ?? "").trim() || null,
          lat: isNaN(parseFloat(row.lat)) ? null : parseFloat(row.lat),
          lng: isNaN(parseFloat(row.lng)) ? null : parseFloat(row.lng),
          tarefas: parseInt(row.tarefas) || 0,
        })).filter((r) => r.nome);
        setExtRows(parsed);
        setPreview({ count: parsed.length, format: "csv" });
      },
      error: () => toast.error("Erro ao processar CSV."),
    });
  }

  function parseXlsxFile(f: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
        const parsed: ExtrasRow[] = [];
        let excluidos = 0;
        for (let i = 1; i < data.length; i++) {
          const r = data[i] as unknown[];
          const nome = [String(r[12] ?? "").trim(), String(r[10] ?? "").trim()].filter(Boolean).join(" ");
          if (!nome) continue;
          // Contas deletadas no Busca Chapa vêm com nome "Usuário Excluído" —
          // sem conta válida não há como contatar; ignora.
          if (normalize(nome).includes("usuario excluido")) { excluidos++; continue; }
          const rawTel = r[5] ? String(r[5]).replace(/\D/g, "") : null;
          const lat = typeof r[0] === "number" ? r[0] : parseFloat(String(r[0] ?? ""));
          const lng = typeof r[1] === "number" ? r[1] : parseFloat(String(r[1] ?? ""));
          parsed.push({
            nome,
            telefone: rawTel || null,
            cidade: r[2] ? String(r[2]).trim() : null,
            estado: r[3] ? String(r[3]).trim() : null,
            lat: isNaN(lat) ? null : lat,
            lng: isNaN(lng) ? null : lng,
            tarefas: typeof r[17] === "number" ? r[17] : (parseInt(String(r[17] ?? "")) || 0),
          });
        }
        setExtRows(parsed);
        setPreview({ count: parsed.length, format: "xlsx" });
        if (excluidos > 0) toast.info(`${excluidos} conta(s) excluída(s) ignorada(s).`);
      } catch {
        toast.error("Erro ao ler arquivo xlsx.");
      }
    };
    reader.readAsArrayBuffer(f);
  }

  async function doImport() {
    if (extRows.length === 0 || selectedTaskId === null) return;
    setImporting(true);
    setProgress(0);
    try {
      const db = await getDb();
      await db.execute("DELETE FROM bid_chapas WHERE id_tarefa = ?", [selectedTaskId]);
      const now = new Date().toISOString();
      const CHUNK = 100;
      for (let i = 0; i < extRows.length; i += CHUNK) {
        const chunk = extRows.slice(i, i + CHUNK);
        const ph = chunk.map(() => "(?,?,?,?,?,?,?,?,?,?)").join(",");
        const vals: unknown[] = [];
        for (const r of chunk) {
          vals.push(uuid(), r.nome, r.telefone, r.cidade, r.estado, r.lat ?? null, r.lng ?? null, r.tarefas, now, selectedTaskId);
        }
        await db.execute(
          `INSERT INTO bid_chapas (id,nome,telefone,cidade,estado,lat,lng,tarefas_finalizadas,importado_em,id_tarefa) VALUES ${ph}`,
          vals,
        );
        setProgress(Math.round(((i + chunk.length) / extRows.length) * 100));
        await new Promise<void>((r) => setTimeout(r, 0));
      }
      toast.success(`${extRows.length.toLocaleString("pt-BR")} chapas extras vinculados à tarefa #${selectedTaskId}.`);
      onDone(selectedTaskId ?? undefined);
      onClose();
      reset();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setImporting(false);
    }
  }

  const selectedTask = openTasks.find((t) => t.id_tarefa === selectedTaskId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !importing) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> Importar Chapas Extras
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {/* Task selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Tarefa de destino *</label>
            <Select
              value={selectedTaskId !== null ? String(selectedTaskId) : "__none__"}
              onValueChange={(v) => setSelectedTaskId(v === "__none__" ? null : parseInt(v))}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecionar tarefa…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Selecionar tarefa…</SelectItem>
                {openTasks.map((t) => (
                  <SelectItem key={t.id_tarefa} value={String(t.id_tarefa)}>
                    {t.empresa.substring(0, 30)} · {fmtSP(t.data_tarefa, "dd/MM HH:mm")} · #{t.id_tarefa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTaskId === null && (
              <p className="text-[10px] text-warning flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Selecione uma tarefa antes de importar
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Lista complementar vinculada à tarefa selecionada. Aceita dois formatos:
            <br />
            <span className="font-medium text-foreground">CSV</span> — colunas{" "}
            <code className="text-[10px] bg-muted px-1 rounded">nome</code> e{" "}
            <code className="text-[10px] bg-muted px-1 rounded">telefone</code> obrigatórias
            (opcionais: cidade, estado, lat, lng, tarefas)
            <br />
            <span className="font-medium text-foreground">XLSX</span> — formato original Busca Chapa
          </p>

          <div className="flex items-center gap-3">
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
            >
              <Upload className="h-3.5 w-3.5" /> Selecionar arquivo
            </Button>
            {preview && (
              <span className="text-xs text-muted-foreground">
                {preview.count.toLocaleString("pt-BR")} chapas · {preview.format.toUpperCase()}
              </span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={onFileChange}
          />

          {importing && (
            <div className="space-y-1.5">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all duration-150" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground text-center">{progress}% importado…</p>
            </div>
          )}

          {preview && !importing && selectedTask && (
            <div className="rounded-lg bg-muted/30 border border-border px-3 py-2.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total de chapas</span>
                <span className="font-semibold tabular-nums">{preview.count.toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground/60">
                <span>Formato detectado</span>
                <span>{preview.format === "csv" ? "CSV" : "XLSX Busca Chapa"}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground/60">
                <span>Tarefa destino</span>
                <span className="font-medium text-foreground truncate max-w-[180px]">
                  {selectedTask.empresa.substring(0, 25)} #{selectedTask.id_tarefa}
                </span>
              </div>
              <p className="text-[10px] text-warning/80 border-t border-border/40 pt-1.5">
                Substituirá os extras já importados para esta tarefa.
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={() => { onClose(); reset(); }} disabled={importing}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={extRows.length === 0 || importing || selectedTaskId === null}
            onClick={doImport}
            className="gap-1.5"
          >
            {importing
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importando…</>
              : <><Upload className="h-3.5 w-3.5" /> Importar {preview ? preview.count.toLocaleString("pt-BR") : ""}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── SemCadastroAviso ───────────────────────────────────────────── */

function SemCadastroAviso() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="rounded-full bg-muted/30 p-4">
        <Database className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <div>
        <p className="font-semibold text-sm">Cadastro não importado</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
          Acesse <strong>Importar → Cadastro Geral de Chapas</strong> para carregar a base de dados.
        </p>
      </div>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/importar")}>
        <Upload className="h-3.5 w-3.5" /> Ir para Importar
      </Button>
    </div>
  );
}

/* ── BloqueadosTab ──────────────────────────────────────────────── */

type AdHocBidTarget = { nome: string; telefone: string };

type BlockedRow = RegistryRow & {
  cep: string | null;
  lat: number | null;
  lng: number | null;
  distance_km: number | null;
};

function BloqueadosTab() {
  const PAGE_SIZE = 50;
  const [allRows, setAllRows] = useState<Omit<BlockedRow, "distance_km">[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [totalBloq, setTotalBloq] = useState(0);
  const [totalReg, setTotalReg] = useState(0);

  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("__all__");
  const [tipoFilter, setTipoFilter] = useState("__all__");
  const [estados, setEstados] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);

  const [localMapsUrl, setLocalMapsUrl] = useState("");
  const [localLat, setLocalLat] = useState<number | null>(null);
  const [localLng, setLocalLng] = useState<number | null>(null);
  const [localCep, setLocalCep] = useState("");
  const [maxDistKm, setMaxDistKm] = useState(30);

  const [bidTarget, setBidTarget] = useState<AdHocBidTarget | null>(null);
  const [bidParams, setBidParams] = useState<AdHocBidParams>({
    dataTarefa: `${todayDateISO_SP()}T08:00`, local: "", atividades: "", diaria: "", taskId: null,
  });
  const [bidSending, setBidSending] = useState(false);
  const [openTasks, setOpenTasks] = useState<OpenTask[]>([]);

  useEffect(() => {
    initMeta();
    queryRows("", "__all__", "__all__");
  }, []); // eslint-disable-line

  async function initMeta() {
    try {
      const db = await getDb();
      const [totals, estList, tipoList, taskList] = await Promise.all([
        db.select<{ bloq: number; total: number }[]>(`
          SELECT
            SUM(CASE WHEN bloqueio IS NOT NULL AND UPPER(bloqueio) NOT LIKE '%DESBLOQUEADO%' THEN 1 ELSE 0 END) as bloq,
            COUNT(*) as total
          FROM chapa_registry
        `),
        db.select<{ estado: string }[]>(
          "SELECT DISTINCT estado FROM chapa_registry WHERE estado IS NOT NULL AND estado != '' ORDER BY estado"
        ),
        db.select<{ bloqueio: string }[]>(`
          SELECT DISTINCT bloqueio FROM chapa_registry
          WHERE bloqueio IS NOT NULL AND UPPER(bloqueio) NOT LIKE '%DESBLOQUEADO%'
          ORDER BY bloqueio
        `),
        db.select<OpenTask[]>(`
          SELECT t.id_tarefa, t.empresa, t.data_tarefa, t.cidade_uf, t.quantidade_chapas, t.status_tarefa,
            (SELECT COUNT(*) FROM chapas c WHERE c.id_tarefa = t.id_tarefa
             AND c.nome_chapa IS NOT NULL AND c.status_contato != 'removido') as alocados
          FROM tarefas t
          WHERE t.ativo = 1 AND t.status_tarefa NOT IN ('Em Andamento', 'Concluído', 'Finalizado')
          AND LOWER(t.status_tarefa) NOT LIKE 'cancel%' AND t.validacao_status != 'subido_meu_chapa'
          AND strftime('%s', t.data_tarefa) >= strftime('%s', datetime('now', '-2 hours'))
          AND DATE(t.data_tarefa) <= date('now', '+7 days')
          ORDER BY t.data_tarefa ASC
        `).catch(() => [] as OpenTask[]),
      ]);
      setTotalBloq(totals[0]?.bloq ?? 0);
      setTotalReg(totals[0]?.total ?? 0);
      setEstados(estList.map((e) => e.estado));
      setTipos(tipoList.map((t) => t.bloqueio));
      setOpenTasks(taskList);
    } catch (e) { toast.error(errMsg(e)); }
  }

  async function queryRows(s: string, est: string, tipo: string) {
    setLoading(true);
    try {
      const db = await getDb();
      const conds = ["r.bloqueio IS NOT NULL", "UPPER(r.bloqueio) NOT LIKE '%DESBLOQUEADO%'"];
      const params: unknown[] = [];

      if (s.trim()) {
        const q = `%${s.toLowerCase().trim()}%`;
        conds.push("(LOWER(r.nome) LIKE ? OR REPLACE(REPLACE(r.cpf,'.',''),'-','') LIKE ? OR REPLACE(r.telefone,' ','') LIKE ?)");
        params.push(q, q, q);
      }
      if (est !== "__all__") { conds.push("UPPER(r.estado) = UPPER(?)"); params.push(est); }
      if (tipo !== "__all__") { conds.push("r.bloqueio = ?"); params.push(tipo); }

      const rows = await db.select<Omit<BlockedRow, "distance_km">[]>(`
        SELECT r.cpf, r.nome, r.telefone, r.cidade, r.estado, r.tarefas, r.data_ultima_tarefa,
               r.situacao, r.bloqueio, r.motivo_bloqueio, r.aso,
               REPLACE(REPLACE(r.cep,' ',''),'-','') as cep, cc.lat, cc.lng
        FROM chapa_registry r
        LEFT JOIN cep_cache cc ON REPLACE(REPLACE(r.cep,' ',''),'-','') = cc.cep
        WHERE ${conds.join(" AND ")}
        ORDER BY r.tarefas DESC LIMIT 500
      `, params);
      setAllRows(rows);
      setPage(0);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  }

  function handleMapsUrlChange(url: string) {
    setLocalMapsUrl(url);
    const coords = parseLatLngFromUrl(url);
    setLocalLat(coords?.lat ?? null);
    setLocalLng(coords?.lng ?? null);
  }

  const hasCoords = localLat !== null && localLng !== null;
  const cepPrefix = localCep.replace(/\D/g, "").slice(0, 5);
  const hasCepFilter = cepPrefix.length >= 5;

  const filteredRows = useMemo<BlockedRow[]>(() => {
    return allRows.map((r) => {
      let distance_km: number | null = null;
      if (hasCoords && r.lat !== null && r.lng !== null)
        distance_km = haversine(localLat!, localLng!, r.lat, r.lng);
      return { ...r, distance_km };
    }).filter((r) => {
      if (hasCoords) return r.distance_km === null || r.distance_km <= maxDistKm;
      if (hasCepFilter) return !r.cep || r.cep.startsWith(cepPrefix);
      return true;
    });
  }, [allRows, localLat, localLng, localCep, maxDistKm, hasCoords, hasCepFilter, cepPrefix]);

  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  const pageRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const bloqPct = totalReg > 0 ? ((totalBloq / totalReg) * 100).toFixed(1) : "—";

  function openBidDialog(r: RegistryRow) {
    if (!r.telefone) { toast.error("Chapa sem telefone cadastrado."); return; }
    setBidTarget({ nome: r.nome, telefone: r.telefone });
    setBidParams({ dataTarefa: `${todayDateISO_SP()}T08:00`, local: "", atividades: "", diaria: "", taskId: null });
  }

  function handleTaskSelect(val: string) {
    const taskId = val === "__none__" ? null : parseInt(val);
    setBidParams((p) => {
      const next = { ...p, taskId };
      if (taskId !== null) {
        try {
          const saved = localStorage.getItem(`bid_params_${taskId}`);
          if (saved) {
            const parsed = JSON.parse(saved);
            return { ...next, local: parsed.local || next.local, atividades: stripAtividadePrefix(parsed.atividades) || next.atividades, diaria: parsed.diaria || next.diaria };
          }
        } catch { /* noop */ }
      }
      return next;
    });
  }

  async function sendAdHocBid() {
    if (!bidTarget) return;
    const { local, atividades, diaria, dataTarefa, taskId } = bidParams;
    if (!local || !atividades || !diaria) { toast.error("Preencha Local, Atividades e Diária."); return; }
    setBidSending(true);
    try {
      const settings = readSettings();
      const us = settings.umblerSettings;
      if (!us.bearerToken) { toast.error("Configure a integração Umbler em Configurações."); return; }
      if (!us.bidBotId || !us.bidBotTriggerName) {
        toast.error("Configure o Bot ID e o Trigger Name do BID (D0) em Integrações.");
        return;
      }
      const selectedTask = openTasks.find((t) => t.id_tarefa === taskId);
      const isoDate = selectedTask ? selectedTask.data_tarefa : `${dataTarefa}:00-03:00`;
      const isBidD1 = fmtSP(isoDate, "yyyy-MM-dd") > todayDateISO_SP() && !!(us.bidBotD1Id && us.bidBotD1TriggerName);
      await startUmblerBot({
        chapaTelefone: bidTarget.telefone,
        settings: us,
        initialData: {
          Data: fmtTaskDateParam(isoDate),
          Local: local,
          Atividades: atividades,
          "Diária": `R$ ${diaria}`,
        },
        botIdOverride: isBidD1 ? us.bidBotD1Id : us.bidBotId,
        triggerNameOverride: isBidD1 ? us.bidBotD1TriggerName : us.bidBotTriggerName,
      });
      if (selectedTask) {
        const dispId = uuid();
        const now = new Date().toISOString();
        const paramsJson = JSON.stringify({ data: fmtTaskDateParam(isoDate), local, atividades, diaria });
        const db = await getDb();
        await db.execute(
          "INSERT INTO bid_disparos (id,chapa_nome,chapa_telefone,id_tarefa,empresa,data_tarefa,params_json,data_disparo,status) VALUES (?,?,?,?,?,?,?,?,?)",
          [dispId, bidTarget.nome, bidTarget.telefone, taskId, selectedTask.empresa, selectedTask.data_tarefa, paramsJson, now, "aguardando"],
        );
        bidDispatchQueue.notifyDispatched({
          id: dispId, id_tarefa: taskId, chapa_nome: bidTarget.nome, chapa_telefone: bidTarget.telefone,
          empresa: selectedTask.empresa, data_tarefa: selectedTask.data_tarefa, params_json: paramsJson,
          data_disparo: now, status: "aguardando",
        });
      }
      toast.success(`BID enviado para ${bidTarget.nome}`);
      setBidTarget(null);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBidSending(false); }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
          <div className="text-2xl font-bold text-destructive tabular-nums">{totalBloq.toLocaleString("pt-BR")}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Bloqueados</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
          <div className="text-2xl font-bold text-success tabular-nums">{(totalReg - totalBloq).toLocaleString("pt-BR")}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Desbloqueados</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
          <div className="text-2xl font-bold tabular-nums">{bloqPct}%</div>
          <div className="text-xs text-muted-foreground mt-0.5">Taxa de bloqueio</div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && queryRows(search, estado, tipoFilter)}
              placeholder="Nome, CPF, telefone…"
              className="pl-8 h-9 text-sm"
            />
            {search && (
              <button type="button"
                onClick={() => { setSearch(""); queryRows("", estado, tipoFilter); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {estados.length > 0 && (
            <Select value={estado} onValueChange={(v) => { setEstado(v); queryRows(search, v, tipoFilter); }}>
              <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os estados</SelectItem>
                {estados.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {tipos.length > 0 && (
            <Select value={tipoFilter} onValueChange={(v) => { setTipoFilter(v); queryRows(search, estado, v); }}>
              <SelectTrigger className="h-9 w-[200px] text-xs"><SelectValue placeholder="Tipo de bloqueio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os bloqueios</SelectItem>
                {tipos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" className="h-9 gap-1.5" onClick={() => queryRows(search, estado, tipoFilter)} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Buscar
          </Button>
        </div>

        {/* Distance filter */}
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/30">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1 shrink-0">
            <MapPin className="h-3 w-3" /> Distância
          </span>
          <Input
            placeholder="Link Maps (ativa filtro por distância)"
            value={localMapsUrl}
            onChange={(e) => handleMapsUrlChange(e.target.value)}
            className="h-8 text-xs flex-1 min-w-[220px]"
          />
          {!hasCoords && (
            <Input
              placeholder="CEP (prefixo)"
              value={localCep}
              onChange={(e) => setLocalCep(formatCep(e.target.value))}
              className="h-8 text-xs w-32 font-mono"
              maxLength={9}
            />
          )}
          {hasCoords && (
            <>
              <Select value={String(maxDistKm)} onValueChange={(v) => setMaxDistKm(Number(v))}>
                <SelectTrigger className="h-8 w-[80px] text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 km</SelectItem>
                  <SelectItem value="20">20 km</SelectItem>
                  <SelectItem value="30">30 km</SelectItem>
                  <SelectItem value="50">50 km</SelectItem>
                  <SelectItem value="100">100 km</SelectItem>
                  <SelectItem value="999">Sem limite</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[10px] text-success flex items-center gap-1">
                <Check className="h-3 w-3" /> {filteredRows.length} em até {maxDistKm} km
              </span>
            </>
          )}
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/10 flex items-center gap-3">
          <Ban className="h-3.5 w-3.5 text-destructive/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">
            {loading
              ? "Carregando…"
              : `${filteredRows.length.toLocaleString("pt-BR")} bloqueado${filteredRows.length !== 1 ? "s" : ""}${allRows.length > filteredRows.length ? ` de ${allRows.length}` : ""}`}
          </span>
        </div>

        <div
          className="hidden md:grid px-4 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 border-b border-border/50"
          style={{ gridTemplateColumns: "24px 1fr 110px 110px 40px 160px 1fr 32px" }}
        >
          <span>#</span>
          <span>Nome / CPF</span>
          <span>Telefone</span>
          <span>Cidade/UF</span>
          <Tooltip>
            <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted">Tar.</span></TooltipTrigger>
            <TooltipContent>Total de tarefas realizadas</TooltipContent>
          </Tooltip>
          <span>Tipo de bloqueio</span>
          <span>Motivo</span>
          <span />
        </div>

        <div className="divide-y divide-border/50">
          {loading && allRows.length === 0 ? (
            <div className="px-4 py-4 space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-9 rounded bg-muted/30 animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
              ))}
            </div>
          ) : pageRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum chapa bloqueado encontrado com os filtros aplicados.
            </div>
          ) : pageRows.map((r, idx) => {
            const isBloqTudo = !!(r.bloqueio && r.bloqueio.toUpperCase().includes("BLOQUEADO EM TUDO"));
            return (
              <div
                key={r.cpf ?? r.nome}
                className="grid items-center px-4 py-2 gap-2 hover:bg-muted/20 transition-colors"
                style={{ gridTemplateColumns: "24px 1fr 110px 110px 40px 160px 1fr 32px" }}
              >
                <div className="text-xs text-muted-foreground/50 tabular-nums font-mono">
                  {page * PAGE_SIZE + idx + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => clipCopy(r.nome, "Nome copiado")}
                      className="font-medium text-sm hover:text-primary hover:underline truncate block text-left max-w-[200px]">
                      {r.nome}
                    </button>
                    <AsoBadge aso={r.aso} />
                  </div>
                  {r.cpf && (
                    <button type="button" onClick={() => clipCopy(r.cpf.replace(/\D/g, ""), "CPF copiado")}
                      className="text-[10px] text-muted-foreground/40 hover:text-primary font-mono">
                      {r.cpf}
                    </button>
                  )}
                  {r.distance_km !== null && (
                    <div className={`text-[10px] mt-0.5 ${r.distance_km > maxDistKm ? "text-destructive/60" : "text-muted-foreground/60"}`}>
                      {r.distance_km.toFixed(1)} km
                    </div>
                  )}
                </div>
                <div>
                  {r.telefone && (
                    <button type="button" onClick={() => clipCopy(r.telefone!.replace(/\D/g, ""), "Telefone copiado")}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                      <Phone className="h-2.5 w-2.5" />{r.telefone}
                    </button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground/60 truncate">
                  {[r.cidade, r.estado].filter(Boolean).join("/")}
                </div>
                <div className="text-xs tabular-nums text-center">{r.tarefas}</div>
                <div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border inline-block truncate max-w-[150px] ${
                    isBloqTudo
                      ? "text-destructive border-destructive/30 bg-destructive/5"
                      : "text-warning border-warning/30 bg-warning/5"
                  }`}>
                    {r.bloqueio}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground/60 truncate">{r.motivo_bloqueio ?? ""}</div>
                <div className="flex justify-end">
                  {r.telefone && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" onClick={() => openBidDialog(r)}
                          className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-info hover:bg-info/10 transition-colors">
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Enviar BID</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-2.5 border-t border-border flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              Pág. {page + 1}/{totalPages} · {filteredRows.length.toLocaleString("pt-BR")} total
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 text-xs px-2" disabled={page === 0}
                onClick={() => setPage(0)}>«</Button>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs tabular-nums px-1">{page + 1}</span>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs px-2" disabled={page >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}>»</Button>
            </div>
          </div>
        )}
      </div>

      {/* BID dispatch dialog */}
      <Dialog open={!!bidTarget} onOpenChange={(o) => { if (!o) setBidTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-info" />
              Enviar BID — {bidTarget?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tarefa vinculada</label>
              <Select
                value={bidParams.taskId !== null ? String(bidParams.taskId) : "__none__"}
                onValueChange={handleTaskSelect}
              >
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar tarefa…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem tarefa vinculada</SelectItem>
                  {openTasks.map((t) => (
                    <SelectItem key={t.id_tarefa} value={String(t.id_tarefa)}>
                      {t.empresa.substring(0, 28)} · {fmtSP(t.data_tarefa, "dd/MM HH:mm")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bidParams.taskId === null && (
                <p className="text-[10px] text-muted-foreground/60">
                  Sem tarefa: o disparo não será registrado no histórico.
                </p>
              )}
            </div>

            {bidParams.taskId === null && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Data e horário</label>
                <Input
                  type="datetime-local"
                  value={bidParams.dataTarefa}
                  onChange={(e) => setBidParams((p) => ({ ...p, dataTarefa: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Local *</label>
              <Input
                placeholder="Endereço do local de trabalho…"
                value={bidParams.local}
                onChange={(e) => setBidParams((p) => ({ ...p, local: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Atividade *</label>
              <div className="flex items-center rounded-md border border-input bg-background h-8 overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                <span className="pl-2.5 pr-1 text-xs text-muted-foreground whitespace-nowrap pointer-events-none select-none">
                  🛠️ Carga e descarga de
                </span>
                <Input
                  placeholder="Cimento, Materiais…"
                  value={bidParams.atividades}
                  onChange={(e) => setBidParams((p) => ({ ...p, atividades: e.target.value }))}
                  className="h-8 text-sm border-0 focus-visible:ring-0 px-1 flex-1"
                />
              </div>
              <p className="text-[10px] text-muted-foreground/70">O template já contém "Carga e descarga de" — digite só o complemento.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Diária (R$) *</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">R$</span>
                <Input
                  type="number" min="0" placeholder="150"
                  value={bidParams.diaria}
                  onChange={(e) => setBidParams((p) => ({ ...p, diaria: e.target.value }))}
                  className="h-8 text-sm pl-8"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/70 rounded-lg bg-warning/5 border border-warning/20 px-3 py-2">
              Este chapa está bloqueado no cadastro. O BID será enviado mesmo assim.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBidTarget(null)}>Cancelar</Button>
            <Button size="sm" className="gap-1.5"
              disabled={bidSending || !bidParams.local || !bidParams.atividades || !bidParams.diaria}
              onClick={sendAdHocBid}>
              {bidSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar BID
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── CadastroTab ────────────────────────────────────────────────── */

function CadastroTab() {
  const PAGE_SIZE = 50;
  const [rows, setRows] = useState<RegistryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("__all__");
  const [bloqFilter, setBloqFilter] = useState("__all__");
  const [asoOnly, setAsoOnly] = useState(false);
  const [estados, setEstados] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const res = await db.select<{ estado: string }[]>(
          "SELECT DISTINCT estado FROM chapa_registry WHERE estado IS NOT NULL AND estado != '' ORDER BY estado"
        );
        setEstados(res.map((e) => e.estado));
      } catch { /* noop */ }
      await queryRows(0, "", "__all__", "__all__", false);
    })();
  }, []); // eslint-disable-line

  async function queryRows(p: number, s: string, est: string, bloq: string, aso: boolean) {
    setLoading(true);
    try {
      const db = await getDb();
      const conds: string[] = [];
      const params: unknown[] = [];

      if (s.trim()) {
        const q = `%${s.toLowerCase().trim()}%`;
        conds.push("(LOWER(nome) LIKE ? OR REPLACE(REPLACE(cpf,'.',''),'-','') LIKE ? OR REPLACE(telefone,' ','') LIKE ?)");
        params.push(q, q, q);
      }
      if (est !== "__all__") { conds.push("UPPER(estado) = UPPER(?)"); params.push(est); }
      if (bloq === "bloqueados") conds.push("bloqueio IS NOT NULL AND UPPER(bloqueio) LIKE '%BLOQUEADO EM TUDO%'");
      else if (bloq === "ativos") conds.push("(bloqueio IS NULL OR UPPER(bloqueio) NOT LIKE '%BLOQUEADO EM TUDO%')");
      if (aso) conds.push("aso IS NOT NULL AND aso != ''");

      const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
      const [countRes, rowsRes] = await Promise.all([
        db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM chapa_registry ${where}`, [...params]),
        db.select<RegistryRow[]>(`
          SELECT cpf, nome, telefone, cidade, estado, tarefas, data_ultima_tarefa, situacao, bloqueio, motivo_bloqueio, aso
          FROM chapa_registry ${where}
          ORDER BY tarefas DESC
          LIMIT ${PAGE_SIZE} OFFSET ${p * PAGE_SIZE}
        `, params),
      ]);
      setTotal(countRes[0]?.cnt ?? 0);
      setRows(rowsRes);
      setPage(p);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  }

  function handleSearch() { queryRows(0, search, estado, bloqFilter, asoOnly); }

  function exportCsv() {
    if (rows.length === 0) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "Nome;CPF;Telefone;Cidade;Estado;Tarefas;Ultima Tarefa;Situacao;Bloqueio;Motivo;ASO";
    const csv = header + "\n" + rows.map((r) =>
      [r.nome, r.cpf, r.telefone, r.cidade, r.estado, r.tarefas,
       r.data_ultima_tarefa, r.situacao, r.bloqueio, r.motivo_bloqueio, r.aso].map(esc).join(";")
    ).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cadastro_chapas.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} chapas exportados.`);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Nome, CPF ou telefone…"
              className="pl-8 h-9 text-sm"
            />
            {search && (
              <button type="button" onClick={() => { setSearch(""); queryRows(0, "", estado, bloqFilter, asoOnly); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os estados</SelectItem>
              {estados.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={bloqFilter} onValueChange={setBloqFilter}>
            <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="ativos">Não bloqueados</SelectItem>
              <SelectItem value="bloqueados">Bloqueados</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={asoOnly ? "default" : "outline"}
            size="sm"
            className={`h-9 text-xs ${asoOnly ? "bg-success/15 text-success border border-success/40 hover:bg-success/25" : ""}`}
            onClick={() => setAsoOnly((v) => !v)}
          >
            Somente ASO
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={handleSearch} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Buscar
          </Button>
        </div>
      </div>

      {/* Results table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/10 flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">
            {loading ? "Carregando…" : `${total.toLocaleString("pt-BR")} chapas`}
          </span>
          {rows.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={exportCsv}>
              <Download className="h-3 w-3" /> Exportar CSV
            </Button>
          )}
        </div>

        {/* Column headers */}
        <div
          className="hidden md:grid px-4 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 border-b border-border/50"
          style={{ gridTemplateColumns: "1fr 110px 110px 120px 50px 80px 1fr 60px" }}
        >
          <span>Nome / CPF</span>
          <span>Telefone</span>
          <span>Cidade/UF</span>
          <span>Situação</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help underline decoration-dotted">Tar.</span>
            </TooltipTrigger>
            <TooltipContent>Total de tarefas realizadas</TooltipContent>
          </Tooltip>
          <span>Status</span>
          <span>Motivo bloqueio</span>
          <span>ASO</span>
        </div>

        <div className="divide-y divide-border/50">
          {loading && rows.length === 0 ? (
            <div className="px-4 py-4 space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-9 rounded bg-muted/30 animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum resultado encontrado.</div>
          ) : rows.map((r) => {
            const isBloq = !!(r.bloqueio && r.bloqueio.toUpperCase().includes("BLOQUEADO EM TUDO"));
            const sit = sitLabel(r.situacao);
            return (
              <div
                key={r.cpf ?? r.nome}
                className={`grid items-center px-4 py-2 gap-2 hover:bg-muted/20 transition-colors ${isBloq ? "opacity-50" : ""}`}
                style={{ gridTemplateColumns: "1fr 110px 110px 120px 50px 80px 1fr 60px" }}
              >
                <div className="min-w-0">
                  <button type="button" onClick={() => clipCopy(r.nome, "Nome copiado")}
                    className="font-medium text-sm hover:text-primary hover:underline truncate block text-left">
                    {r.nome}
                  </button>
                  {r.cpf && (
                    <button type="button" onClick={() => clipCopy(r.cpf.replace(/\D/g, ""), "CPF copiado")}
                      className="text-[10px] text-muted-foreground/40 hover:text-primary font-mono">
                      {r.cpf}
                    </button>
                  )}
                </div>
                <div>
                  {r.telefone && (
                    <button type="button" onClick={() => clipCopy(r.telefone!.replace(/\D/g, ""), "Telefone copiado")}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                      <Phone className="h-2.5 w-2.5" />{r.telefone}
                    </button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground/60 truncate">
                  {[r.cidade, r.estado].filter(Boolean).join("/")}
                </div>
                <div className={`text-[10px] truncate ${sit.cls}`}>{sit.text}</div>
                <div className="text-xs tabular-nums text-center">{r.tarefas}</div>
                <div className="text-[10px]">
                  {isBloq
                    ? <span className="text-destructive font-semibold">Bloqueado</span>
                    : <span className="text-success/70">Ativo</span>}
                </div>
                <div className="text-[10px] text-muted-foreground/60 truncate">{r.motivo_bloqueio ?? ""}</div>
                <div>
                  <AsoBadge aso={r.aso} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-2.5 border-t border-border flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              Pág. {page + 1}/{totalPages} · {total.toLocaleString("pt-BR")} total
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 text-xs px-2" disabled={page === 0}
                onClick={() => queryRows(0, search, estado, bloqFilter, asoOnly)}>«</Button>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page === 0}
                onClick={() => queryRows(page - 1, search, estado, bloqFilter, asoOnly)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs tabular-nums px-1">{page + 1}</span>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={page >= totalPages - 1}
                onClick={() => queryRows(page + 1, search, estado, bloqFilter, asoOnly)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs px-2" disabled={page >= totalPages - 1}
                onClick={() => queryRows(totalPages - 1, search, estado, bloqFilter, asoOnly)}>»</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
