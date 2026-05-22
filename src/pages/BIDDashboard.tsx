import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { getDb, uuid, errMsg } from "@/lib/db";
import { readSettings } from "@/lib/settings";
import { sendUmblerFup, fmtTaskDateParam } from "@/lib/umbler";
import { bidDispatchQueue, type BidBatchState, type BidDispatchRecord } from "@/lib/dispatchQueue";
import { fmtSP, fmtDateTime, fmtTime, todayDateISO_SP } from "@/lib/datetime";
import { normalize } from "@/lib/normalize";
import { companyMatches } from "@/lib/company";
import { cepGeocoder } from "@/lib/geocode";
import { toast } from "sonner";
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
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────── */

type BidChapa = {
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

type BidDisparo = {
  id: string;
  chapa_nome: string;
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

type OpenTask = {
  id_tarefa: number;
  empresa: string;
  data_tarefa: string;
  cidade_uf: string | null;
  quantidade_chapas: number;
  alocados: number;
};

type ClienteAddress = {
  id: string;
  label: string;
  endereco: string;
  maps_link: string | null;
  lat: number | null;
  lng: number | null;
  cep: string | null;
};

type DispatchParams = {
  local: string;
  mapsLink: string;
  sendMapsAsLocal: boolean;
  localLat: number | null;
  localLng: number | null;
  atividades: string;
  diaria: string;
  localCep: string;
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

type RankedCandidate = BidChapa & {
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

function computeScore(c: BidChapa, distKm: number | null, cepPrefix?: string | null): number {
  let score = 0;
  score += Math.min(c.tarefas, 100) * 1.0;
  if (distKm !== null) score += Math.max(0, 30 - distKm) * 2;
  if (c.data_ultima_tarefa) {
    const days = (Date.now() - new Date(c.data_ultima_tarefa).getTime()) / 86400000;
    if (days < 30) score += 40; else if (days < 90) score += 20; else if (days < 180) score += 5;
  }
  const sit = (c.situacao ?? "").toLowerCase();
  if (sit.includes("ativo") && !sit.includes("não") && !sit.includes("nao") && !sit.includes("ainda")) score += 20;
  else if (sit.includes("ainda") || sit.includes("não ativo") || sit.includes("nao ativo")) score += 5;
  if (c.aso) score += 10;
  if (cepPrefix && distKm === null && c.cep && c.cep.replace(/\D/g, "").startsWith(cepPrefix)) score += 20;
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

const ATIVIDADES_PRESETS = [
  "Carga e Descarga",
  "Movimentação Interna",
  "Inventário",
  "Montagem e Desmontagem",
];

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  aguardando:     { label: "Aguardando",     cls: "bg-muted/40 text-muted-foreground border-border" },
  interesse_sim:  { label: "Interesse ✓",    cls: "bg-success/10 text-success border-success/30" },
  interesse_nao:  { label: "Interesse ✗",    cls: "bg-destructive/10 text-destructive border-destructive/30" },
  aceita_app:     { label: "Aceita App",     cls: "bg-success/15 text-success border-success/40" },
  nao_aceita_app: { label: "Não Aceita App", cls: "bg-warning/10 text-warning border-warning/30" },
  precisa_ajuda:  { label: "Precisa Ajuda",  cls: "bg-warning/10 text-warning border-warning/30" },
};

const EMPTY_PARAMS: DispatchParams = {
  local: "",
  mapsLink: "",
  sendMapsAsLocal: false,
  localLat: null,
  localLng: null,
  atividades: "",
  diaria: "",
  localCep: "",
};

/* ── BidTaskCard ────────────────────────────────────────────────── */

function BidTaskCard({
  task,
  disparos,
  onDisparoStatusUpdate,
  initialExpanded,
}: {
  task: OpenTask;
  disparos: BidDisparo[];
  onDisparoStatusUpdate: (id: string, status: string, step: 1 | 2) => Promise<void>;
  initialExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [dispatchParams, setDispatchParams] = useState<DispatchParams>(() => {
    try {
      const saved = localStorage.getItem(`bid_params_${task.id_tarefa}`);
      if (saved) return { ...EMPTY_PARAMS, ...JSON.parse(saved) };
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
  const [negOpen, setNegOpen] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [editingDisparoId, setEditingDisparoId] = useState<string | null>(null);
  const [rawCandidates, setRawCandidates] = useState<BidChapa[]>([]);
  const [occupiedCpfSet, setOccupiedCpfSet] = useState<Set<string>>(new Set());
  const [occupiedNameSet, setOccupiedNameSet] = useState<Set<string>>(new Set());

  const taskDisparos = useMemo(
    () => disparos.filter((d) => d.id_tarefa === task.id_tarefa),
    [disparos, task.id_tarefa],
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
    if (!expanded) { setRawCandidates([]); setOccupiedCpfSet(new Set()); setOccupiedNameSet(new Set()); setCandidatesLoading(false); return; }
    const cityUf = parseCidadeUf(task.cidade_uf);
    setCandidatesLoading(true);
    (async () => {
      try {
        const db = await getDb();
        const taskDate = fmtSP(task.data_tarefa, "yyyy-MM-dd");

        const [byCpf, byName] = await Promise.all([
          db.select<{ cpf: string }[]>(`
            SELECT DISTINCT c.cpf FROM chapas c
            JOIN tarefas t ON c.id_tarefa = t.id_tarefa
            WHERE DATE(t.data_tarefa) = ? AND c.status_contato != 'removido'
            AND c.cpf IS NOT NULL AND t.id_tarefa != ?
          `, [taskDate, task.id_tarefa]),
          db.select<{ nome_norm: string }[]>(`
            SELECT DISTINCT LOWER(TRIM(c.nome_chapa)) as nome_norm FROM chapas c
            JOIN tarefas t ON c.id_tarefa = t.id_tarefa
            WHERE DATE(t.data_tarefa) = ? AND c.status_contato != 'removido'
            AND c.cpf IS NULL AND c.nome_chapa IS NOT NULL AND t.id_tarefa != ?
          `, [taskDate, task.id_tarefa]),
        ]);
        setOccupiedCpfSet(new Set(byCpf.map((r) => r.cpf.replace(/\D/g, ""))));
        setOccupiedNameSet(new Set(byName.map((r) => normalize(r.nome_norm))));

        if (!cityUf) { setRawCandidates([]); return; }

        const chapas = await db.select<BidChapa[]>(`
          SELECT r.cpf as _key, r.cpf, r.nome, r.telefone, r.cidade, r.bairro, r.estado, r.rua,
                 REPLACE(r.cep,'-','') as cep, r.numero, r.tarefas,
                 r.data_primeira_tarefa, r.data_ultima_tarefa, r.situacao, r.bloqueio,
                 r.motivo_bloqueio, r.aso, r.importado_em, cc.lat, cc.lng
          FROM chapa_registry r
          LEFT JOIN cep_cache cc ON REPLACE(r.cep,'-','') = cc.cep
          WHERE (r.bloqueio IS NULL OR UPPER(r.bloqueio) NOT LIKE '%BLOQUEADO EM TUDO%')
          AND UPPER(r.cidade) = UPPER(?) AND UPPER(r.estado) = UPPER(?)

          UNION ALL

          SELECT b.id as _key, NULL as cpf, b.nome, b.telefone, b.cidade, NULL as bairro, b.estado, NULL as rua,
                 NULL as cep, NULL as numero, b.tarefas_finalizadas as tarefas,
                 NULL as data_primeira_tarefa, NULL as data_ultima_tarefa, NULL as situacao,
                 NULL as bloqueio, NULL as motivo_bloqueio, NULL as aso,
                 b.importado_em, b.lat, b.lng
          FROM bid_chapas b
          WHERE (b.cidade IS NULL OR b.cidade = '' OR UPPER(b.cidade) = UPPER(?))
          AND (b.estado IS NULL OR b.estado = '' OR UPPER(b.estado) = UPPER(?))

          ORDER BY tarefas DESC
          LIMIT 600
        `, [cityUf.cidade, cityUf.estado, cityUf.cidade, cityUf.estado]);

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
  }, [expanded, task.id_tarefa, task.cidade_uf, task.data_tarefa]); // eslint-disable-line

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
        score: isOccupied ? -9999 : computeScore(c, distKm, cepPrefix),
        is_occupied: isOccupied,
        disparo,
      };
    }).sort((a, b) => b.score - a.score);
  }, [rawCandidates, occupiedCpfSet, occupiedNameSet, dispatchParams.localLat, dispatchParams.localLng, dispatchParams.localCep, taskDisparos]);

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

    setDispatchingIds((prev) => new Set(prev).add(candidate._key));
    try {
      await sendUmblerFup({
        chapaNome: candidate.nome,
        chapaTelefone: candidate.telefone,
        dataTarefa: task.data_tarefa,
        empresa: task.empresa,
        settings: us,
        templateIdOverride: us.bidTemplateId || "aH6pLxMKil-bY_UP",
        overrideParams: [
          fmtTaskDateParam(task.data_tarefa),
          localParam,
          dispatchParams.atividades,
          `R$ ${dispatchParams.diaria}`,
        ],
      });
      const dispId = uuid();
      const now = new Date().toISOString();
      const paramsJson = JSON.stringify({
        data: fmtTaskDateParam(task.data_tarefa),
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
    const toDispatch = candidates.filter((c) => selectedIds.has(c._key) && !c.is_occupied && c.telefone);
    if (toDispatch.length === 0) return;
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
      },
    });
    if (started) setSelectedIds(new Set());
  }

  function toggleSelect(key: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const hasCoords = dispatchParams.localLat !== null;
  const cepPrefixFilter = dispatchParams.localCep
    ? dispatchParams.localCep.replace(/\D/g, "").slice(0, 5)
    : null;
  const hasCepFilter = !!cepPrefixFilter && cepPrefixFilter.length >= 5;
  const available = candidates.filter((c) => !c.is_occupied);
  const within30 = hasCoords
    ? available.filter((c) => c.distance_km === null || c.distance_km <= 30)
    : hasCepFilter
      ? available.filter((c) => !c.cep || c.cep.replace(/\D/g, "").startsWith(cepPrefixFilter!))
      : available;
  const beyond30 = hasCoords
    ? available.filter((c) => c.distance_km !== null && c.distance_km > 30)
    : hasCepFilter
      ? available.filter((c) => !!c.cep && !c.cep.replace(/\D/g, "").startsWith(cepPrefixFilter!))
      : [];
  const useProximityFilter = hasCoords || hasCepFilter;
  const visibleCandidates = showAll
    ? (useProximityFilter ? [...within30, ...beyond30] : available)
    : (useProximityFilter ? within30.slice(0, 40) : available.slice(0, 40));

  function toggleSelectAll() {
    const all = available.filter((c) => c.telefone);
    const allSel = all.length > 0 && all.every((c) => selectedIds.has(c._key));
    setSelectedIds(allSel ? new Set() : new Set(all.map((c) => c._key)));
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
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
            const negativo = taskDisparos.filter((d) => ["interesse_nao", "nao_aceita_app"].includes(d.status)).length;
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
                {negativo > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-destructive px-1.5 py-0.5 rounded-full bg-destructive/10 border border-destructive/20 tabular-nums">
                    {negativo}<XCircle className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
            );
          })()}
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground/60 shrink-0" />}
        </div>
        {/* Row 2: time · city · alocados/total · vagas badge */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{fmtTime(task.data_tarefa)}</span>
          {task.cidade_uf && <span>· {task.cidade_uf}</span>}
          <span className="tabular-nums">· {task.alocados}/{task.quantidade_chapas || "?"}</span>
          <Badge variant="outline" className="text-warning border-warning/40 bg-warning/5 text-[10px] px-1.5 py-0 h-4">
            {vagas} vaga{vagas !== 1 ? "s" : ""}
          </Badge>
        </div>
      </button>

      {expanded && (
        <>
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
                <label className="text-xs font-medium text-muted-foreground">Atividades</label>
                <Select
                  value={ATIVIDADES_PRESETS.includes(dispatchParams.atividades) ? dispatchParams.atividades : "__custom__"}
                  onValueChange={(v) => setDispatchParams((p) => ({ ...p, atividades: v === "__custom__" ? "" : v }))}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                  <SelectContent>
                    {ATIVIDADES_PRESETS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    <SelectItem value="__custom__">Digitar…</SelectItem>
                  </SelectContent>
                </Select>
                {!ATIVIDADES_PRESETS.includes(dispatchParams.atividades) && (
                  <Input
                    placeholder="Descreva as atividades…"
                    value={dispatchParams.atividades}
                    onChange={(e) => setDispatchParams((p) => ({ ...p, atividades: e.target.value }))}
                    className="h-8 text-sm mt-1"
                  />
                )}
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
                  <span><span className="text-foreground/60">Data:</span> {fmtTaskDateParam(task.data_tarefa)}</span>
                  <span><span className="text-foreground/60">Local:</span> {
                    dispatchParams.sendMapsAsLocal && dispatchParams.mapsLink
                      ? <span className="text-info/80 italic text-[10px]">link maps</span>
                      : dispatchParams.local || <em>—</em>
                  }</span>
                  <span><span className="text-foreground/60">Ativ.:</span> {dispatchParams.atividades || <em>—</em>}</span>
                  <span><span className="text-foreground/60">Diária:</span> {dispatchParams.diaria ? `R$ ${dispatchParams.diaria}` : <em>—</em>}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Candidatos ── */}
          <div>
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2.5 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1 flex items-center flex-wrap gap-1.5">
                Candidatos
                {available.length > 0 && (
                  <span className="font-normal normal-case">
                    — {available.length} disponíveis
                    {hasCoords ? ` · ${within30.length} em até 30 km` : hasCepFilter ? ` · ${within30.length} no CEP raiz` : ""}
                  </span>
                )}
                {(useProximityFilter ? within30 : available).length > 40 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowAll((v) => !v); }}
                    className="font-normal normal-case text-primary hover:underline"
                  >
                    {showAll ? "mostrar menos" : `ver todos (${(useProximityFilter ? within30 : available).length})`}
                  </button>
                )}
              </span>
              <button
                type="button"
                onClick={() => setShowOccupied((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showOccupied ? "Ocultar" : "Ver"} ocupados ({candidates.filter((c) => c.is_occupied).length})
              </button>
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
                    checked={available.filter((c) => c.telefone).length > 0 && available.filter((c) => c.telefone).every((c) => selectedIds.has(c._key))}
                    onChange={toggleSelectAll}
                  />
                </span>
                <span>#</span><span>Nome</span><span>Distância</span>
                <Tooltip>
                  <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted">Tarefas</span></TooltipTrigger>
                  <TooltipContent>Total de tarefas realizadas</TooltipContent>
                </Tooltip>
                <span>Situação</span>
                <span>Status</span><span />
              </div>

              <div className="divide-y divide-border/50">
                {candidatesLoading && rawCandidates.length === 0 && (
                  <div className="px-4 py-3 space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
                    ))}
                  </div>
                )}
                {!candidatesLoading && rawCandidates.length === 0 && (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground space-y-2">
                    <p>Sem chapas cadastrados para <b>{task.cidade_uf || "esta cidade"}</b>.</p>
                    <p className="text-muted-foreground/60">Verifique se o cadastro geral foi importado em <b>Importar &rsaquo; Cadastro Geral de Chapas</b>.</p>
                  </div>
                )}
                {visibleCandidates.map((c, idx) => {
                  const sc = STATUS_CFG[c.disparo?.status ?? ""] ?? null;
                  const isDispatching = dispatchingIds.has(c._key);
                  const sit = sitLabel(c.situacao);
                  return (
                    <div
                      key={c._key}
                      className={`grid items-center px-4 py-2 gap-2 transition-colors hover:bg-muted/20 ${c.is_occupied ? "opacity-35" : ""}`}
                      style={{ gridTemplateColumns: "28px 24px 1fr 80px 60px 100px 100px 100px" }}
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
                          {c.aso && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[9px] font-bold text-success px-1 py-0.5 rounded bg-success/10 border border-success/20 cursor-help">ASO</span>
                              </TooltipTrigger>
                              <TooltipContent>ASO válido: {c.aso}</TooltipContent>
                            </Tooltip>
                          )}
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

                {showOccupied && candidates.filter((c) => c.is_occupied).map((c) => (
                  <div key={c._key} className="grid items-center px-4 py-2 gap-2 opacity-30 bg-muted/5"
                    style={{ gridTemplateColumns: "28px 24px 1fr 80px 60px 100px 100px 100px" }}>
                    <div /><div />
                    <div className="text-sm text-muted-foreground truncate">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">{c.distance_km !== null ? `${c.distance_km.toFixed(1)} km` : "—"}</div>
                    <div className="text-xs text-center">{c.tarefas}</div>
                    <div />
                    <div className="text-[10px] text-muted-foreground italic">Ocupado</div>
                    <div />
                  </div>
                ))}
              </div>
            </div>

            {!hasCoords && !hasCepFilter && candidates.length > 0 && (
              <div className="px-4 py-2 border-t border-border/50 bg-warning/5 flex items-center gap-2 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Informe o CEP do local para filtrar chapas próximos. Adicione um link Maps para ranking por distância exata.
              </div>
            )}
          </div>

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
                    const n = taskDisparos.filter((d) => ["interesse_nao", "nao_aceita_app"].includes(d.status)).length;
                    return <>
                      {a > 0 && <span className="flex items-center gap-0.5 text-warning tabular-nums">{a} aguard. <Clock className="h-3 w-3" /></span>}
                      {p > 0 && <span className="flex items-center gap-0.5 text-success tabular-nums">{p} interesse <CheckCircle2 className="h-3 w-3" /></span>}
                      {n > 0 && <span className="flex items-center gap-0.5 text-destructive tabular-nums">{n} negativo <XCircle className="h-3 w-3" /></span>}
                    </>;
                  })()}
                </div>
              </div>
              <div className="divide-y divide-border/50">
                {taskDisparos.map((d) => {
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
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sc.cls} shrink-0`}>{sc.label}</span>
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
  const [openTasks, setOpenTasks] = useState<OpenTask[]>([]);
  const [disparos, setDisparos] = useState<BidDisparo[]>([]);
  const [selectedDay, setSelectedDay] = useState<"today" | "tomorrow">("today");
  const [search, setSearch] = useState("");
  const [cidadeFilter, setCidadeFilter] = useState("__all__");
  const [searchParams] = useSearchParams();
  const autoExpandId = searchParams.get("taskId") ? parseInt(searchParams.get("taskId")!) : null;
  const registryImportedAt = localStorage.getItem("chapa_registry_imported_at");

  const [activeBatches, setActiveBatches] = useState<Map<number, NonNullable<BidBatchState>>>(() => bidDispatchQueue.getActiveBatches());
  useEffect(() => bidDispatchQueue.subscribeAnyBatch(() => setActiveBatches(bidDispatchQueue.getActiveBatches())), []);

  const loadAll = useCallback(async () => {
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
        importado_em TEXT NOT NULL
      )`);
      try { await db.execute("ALTER TABLE cliente_book ADD COLUMN enderecos TEXT"); } catch { /* exists */ }

      const [cntRows, extrasRows, tasks, disp, carteira] = await Promise.all([
        db.select<{ cnt: number }[]>("SELECT COUNT(*) as cnt FROM chapa_registry").catch(() => [{ cnt: 0 }]),
        db.select<{ cnt: number }[]>("SELECT COUNT(*) as cnt FROM bid_chapas").catch(() => [{ cnt: 0 }]),
        db.select<OpenTask[]>(`
          SELECT t.id_tarefa, t.empresa, t.data_tarefa, t.cidade_uf, t.quantidade_chapas,
            (SELECT COUNT(*) FROM chapas c WHERE c.id_tarefa = t.id_tarefa
             AND c.nome_chapa IS NOT NULL AND c.status_contato != 'removido') as alocados
          FROM tarefas t
          WHERE t.ativo = 1
          AND t.status_tarefa NOT IN ('Em Andamento', 'Concluído', 'Finalizado')
          AND t.validacao_status != 'subido_meu_chapa'
          AND strftime('%s', t.data_tarefa) >= strftime('%s', datetime('now', '-2 hours'))
          AND DATE(t.data_tarefa) <= date('now', '+7 days')
          ORDER BY t.data_tarefa ASC
        `),
        db.select<BidDisparo[]>("SELECT * FROM bid_disparos WHERE DATE(data_disparo) >= date('now', '-1 day') ORDER BY data_disparo DESC"),
        db.select<{ nome_fantasia: string }[]>("SELECT nome_fantasia FROM carteira"),
      ]);

      const carteiraNames = carteira.map((c) => c.nome_fantasia);
      const withVagas = tasks.filter((t) => {
        if (carteiraNames.length > 0 && !companyMatches(t.empresa, carteiraNames)) return false;
        return t.quantidade_chapas > t.alocados || t.quantidade_chapas === 0;
      });
      setRegistryCount(cntRows[0]?.cnt ?? 0);
      setExtrasCount(extrasRows[0]?.cnt ?? 0);
      setOpenTasks(withVagas);
      setDisparos(disp);
    } catch (e) { toast.error(errMsg(e)); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);


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

  async function updateDisparoStatus(id: string, status: string, step: 1 | 2) {
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      if (step === 1) await db.execute("UPDATE bid_disparos SET status=?, data_resposta1=? WHERE id=?", [status, now, id]);
      else await db.execute("UPDATE bid_disparos SET status=?, data_resposta2=? WHERE id=?", [status, now, id]);
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
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-xl">BID Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {registryCount > 0
              ? `${registryCount.toLocaleString("pt-BR")} chapas no cadastro${registryImportedAt ? ` · atualizado ${fmtDateTime(registryImportedAt)}` : ""}`
              : "Importe o cadastro geral de chapas para começar"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAll} className="gap-1.5 h-8">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setExtrasOpen(true)} className="gap-1.5 h-8">
            <UserPlus className="h-3.5 w-3.5" /> Extras{extrasCount > 0 ? ` (${extrasCount.toLocaleString("pt-BR")})` : ""}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/importar")} className="gap-1.5 h-8">
            <Upload className="h-3.5 w-3.5" /> Cadastro de Chapas
          </Button>
        </div>
      </div>

      {/* Tab navigation */}
      {registryCount > 0 && (
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
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

        </>
      )}

      {registryCount > 0 && activeTab === "bloqueados" && <BloqueadosTab />}
      {registryCount > 0 && activeTab === "cadastro" && <CadastroTab />}

      <ImportExtrasDialog
        open={extrasOpen}
        onClose={() => setExtrasOpen(false)}
        onDone={loadAll}
      />
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

function ImportExtrasDialog({ open, onClose, onDone }: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [extRows, setExtRows] = useState<ExtrasRow[]>([]);
  const [preview, setPreview] = useState<{ count: number; format: "csv" | "xlsx" } | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() { setExtRows([]); setPreview(null); setProgress(0); }

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
        for (let i = 1; i < data.length; i++) {
          const r = data[i] as unknown[];
          const nome = [String(r[12] ?? "").trim(), String(r[10] ?? "").trim()].filter(Boolean).join(" ");
          if (!nome) continue;
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
      } catch {
        toast.error("Erro ao ler arquivo xlsx.");
      }
    };
    reader.readAsArrayBuffer(f);
  }

  async function doImport() {
    if (extRows.length === 0) return;
    setImporting(true);
    setProgress(0);
    try {
      const db = await getDb();
      await db.execute("DELETE FROM bid_chapas");
      const now = new Date().toISOString();
      const CHUNK = 100;
      for (let i = 0; i < extRows.length; i += CHUNK) {
        const chunk = extRows.slice(i, i + CHUNK);
        const ph = chunk.map(() => "(?,?,?,?,?,?,?,?,?)").join(",");
        const vals: unknown[] = [];
        for (const r of chunk) {
          vals.push(uuid(), r.nome, r.telefone, r.cidade, r.estado, r.lat ?? null, r.lng ?? null, r.tarefas, now);
        }
        await db.execute(
          `INSERT INTO bid_chapas (id,nome,telefone,cidade,estado,lat,lng,tarefas_finalizadas,importado_em) VALUES ${ph}`,
          vals,
        );
        setProgress(Math.round(((i + chunk.length) / extRows.length) * 100));
        await new Promise<void>((r) => setTimeout(r, 0));
      }
      toast.success(`${extRows.length.toLocaleString("pt-BR")} chapas extras importados.`);
      onDone();
      onClose();
      reset();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !importing) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> Importar Chapas Extras
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Lista complementar ao cadastro geral. Aceita dois formatos:
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

          {preview && !importing && (
            <div className="rounded-lg bg-muted/30 border border-border px-3 py-2.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total de chapas</span>
                <span className="font-semibold tabular-nums">{preview.count.toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground/60">
                <span>Formato detectado</span>
                <span>{preview.format === "csv" ? "CSV" : "XLSX Busca Chapa"}</span>
              </div>
              <p className="text-[10px] text-warning/80 border-t border-border/40 pt-1.5">
                Esta importação substituirá todos os chapas extras atualmente cadastrados.
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
            disabled={extRows.length === 0 || importing}
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

/* ── BloqueadosTab ──────────────────────────────────────────────── */

function BloqueadosTab() {
  const [groups, setGroups] = useState<{ motivo: string; total: number }[]>([]);
  const [totalBloq, setTotalBloq] = useState(0);
  const [totalReg, setTotalReg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<RegistryRow[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailEstado, setDetailEstado] = useState("__all__");
  const [estados, setEstados] = useState<string[]>([]);

  useEffect(() => { loadGroups(); }, []); // eslint-disable-line

  async function loadGroups() {
    setLoading(true);
    try {
      const db = await getDb();
      const [g, totals, estList] = await Promise.all([
        db.select<{ motivo: string; total: number }[]>(`
          SELECT COALESCE(motivo_bloqueio, '(não informado)') as motivo, COUNT(*) as total
          FROM chapa_registry
          WHERE bloqueio IS NOT NULL AND UPPER(bloqueio) LIKE '%BLOQUEADO EM TUDO%'
          GROUP BY motivo_bloqueio ORDER BY total DESC
        `),
        db.select<{ bloq: number; total: number }[]>(`
          SELECT
            SUM(CASE WHEN bloqueio IS NOT NULL AND UPPER(bloqueio) LIKE '%BLOQUEADO EM TUDO%' THEN 1 ELSE 0 END) as bloq,
            COUNT(*) as total
          FROM chapa_registry
        `),
        db.select<{ estado: string }[]>(
          "SELECT DISTINCT estado FROM chapa_registry WHERE estado IS NOT NULL AND estado != '' ORDER BY estado"
        ),
      ]);
      setGroups(g);
      setTotalBloq(totals[0]?.bloq ?? 0);
      setTotalReg(totals[0]?.total ?? 0);
      setEstados(estList.map((e) => e.estado));
    } catch (e) { toast.error(errMsg(e)); }
    finally { setLoading(false); }
  }

  async function toggleExpanded(motivo: string) {
    if (expanded === motivo) { setExpanded(null); setDetail([]); setDetailSearch(""); return; }
    setExpanded(motivo);
    setDetailSearch("");
    setDetailEstado("__all__");
    await loadDetail(motivo, "", "__all__");
  }

  async function loadDetail(motivo: string, search: string, estado: string) {
    setDetailLoading(true);
    try {
      const db = await getDb();
      const conds = [
        "bloqueio IS NOT NULL",
        "UPPER(bloqueio) LIKE '%BLOQUEADO EM TUDO%'",
        motivo === "(não informado)" ? "motivo_bloqueio IS NULL" : "motivo_bloqueio = ?",
      ];
      const params: unknown[] = motivo !== "(não informado)" ? [motivo] : [];

      if (search.trim()) {
        const q = `%${search.toLowerCase().trim()}%`;
        conds.push("(LOWER(nome) LIKE ? OR REPLACE(REPLACE(cpf,'.',''),'-','') LIKE ? OR REPLACE(telefone,' ','') LIKE ?)");
        params.push(q, q, q);
      }
      if (estado !== "__all__") { conds.push("UPPER(estado) = UPPER(?)"); params.push(estado); }

      const where = `WHERE ${conds.join(" AND ")}`;
      const [countRes, rows] = await Promise.all([
        db.select<{ cnt: number }[]>(`SELECT COUNT(*) as cnt FROM chapa_registry ${where}`, [...params]),
        db.select<RegistryRow[]>(`
          SELECT cpf, nome, telefone, cidade, estado, tarefas, data_ultima_tarefa, situacao, bloqueio, motivo_bloqueio, aso
          FROM chapa_registry ${where}
          ORDER BY tarefas DESC LIMIT 300
        `, params),
      ]);
      setDetailTotal(countRes[0]?.cnt ?? 0);
      setDetail(rows);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setDetailLoading(false); }
  }

  const bloqPct = totalReg > 0 ? ((totalBloq / totalReg) * 100).toFixed(1) : "—";

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
          <div className="text-xs text-muted-foreground mt-0.5">Não bloqueados</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
          <div className="text-2xl font-bold tabular-nums">{bloqPct}%</div>
          <div className="text-xs text-muted-foreground mt-0.5">Taxa de bloqueio</div>
        </div>
      </div>

      {/* Groups */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/10 flex items-center gap-2">
          <Ban className="h-3.5 w-3.5 text-destructive/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">
            Motivos de bloqueio · {groups.length} tipo{groups.length !== 1 ? "s" : ""}
          </span>
        </div>
        {loading ? (
          <div className="px-4 py-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-muted/30 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhum chapa bloqueado no cadastro.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {groups.map((g) => (
              <div key={g.motivo}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(g.motivo)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20 ${expanded === g.motivo ? "bg-destructive/5" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{g.motivo}</span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-bold text-destructive tabular-nums">{g.total.toLocaleString("pt-BR")}</div>
                      <div className="text-[10px] text-muted-foreground/60">
                        {totalBloq > 0 ? `${((g.total / totalBloq) * 100).toFixed(0)}%` : ""}
                      </div>
                    </div>
                    {expanded === g.motivo
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground/40" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground/40" />}
                  </div>
                </button>

                {expanded === g.motivo && (
                  <div className="border-t border-border/40 bg-muted/5">
                    {/* Search + filter bar */}
                    <div className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2 flex-wrap">
                      <div className="relative flex-1 min-w-[160px]">
                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={detailSearch}
                          onChange={(e) => setDetailSearch(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && loadDetail(g.motivo, detailSearch, detailEstado)}
                          placeholder="Nome, CPF, telefone…"
                          className="pl-8 h-8 text-xs"
                        />
                      </div>
                      {estados.length > 0 && (
                        <Select value={detailEstado} onValueChange={(v) => { setDetailEstado(v); loadDetail(g.motivo, detailSearch, v); }}>
                          <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">Todos</SelectItem>
                            {estados.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                        onClick={() => loadDetail(g.motivo, detailSearch, detailEstado)}>
                        <Search className="h-3 w-3" /> Buscar
                      </Button>
                      {detailTotal > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {detail.length < detailTotal
                            ? `${detail.length} de ${detailTotal.toLocaleString("pt-BR")}`
                            : `${detailTotal.toLocaleString("pt-BR")} resultado${detailTotal !== 1 ? "s" : ""}`}
                        </span>
                      )}
                    </div>

                    {/* Detail rows */}
                    {detailLoading ? (
                      <div className="px-4 py-3 space-y-1.5">
                        {[...Array(4)].map((_, i) => (
                          <div key={i} className="h-9 rounded bg-muted/30 animate-pulse" />
                        ))}
                      </div>
                    ) : detail.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum resultado.</div>
                    ) : (
                      <div className="divide-y divide-border/30 max-h-[400px] overflow-y-auto">
                        {detail.map((r) => (
                          <div key={r.cpf ?? r.nome} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/10 transition-colors">
                            <div className="flex-1 min-w-0">
                              <button type="button" onClick={() => clipCopy(r.nome, "Nome copiado")}
                                className="font-medium text-sm hover:text-primary hover:underline truncate block text-left max-w-[220px]">
                                {r.nome}
                              </button>
                              {r.telefone && (
                                <button type="button" onClick={() => clipCopy(r.telefone!.replace(/\D/g, ""), "Telefone copiado")}
                                  className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5">
                                  <Phone className="h-2.5 w-2.5" /> {r.telefone}
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground/60 hidden sm:block min-w-[90px] shrink-0">
                              {[r.cidade, r.estado].filter(Boolean).join("/")}
                            </div>
                            <div className="text-xs tabular-nums text-center w-10 text-muted-foreground shrink-0">
                              {r.tarefas}
                            </div>
                            {r.aso && (
                              <span className="text-[9px] font-bold text-success px-1 py-0.5 rounded bg-success/10 border border-success/20 shrink-0">ASO</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
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
                  {r.aso && (
                    <span className="text-[9px] font-bold text-success px-1 py-0.5 rounded bg-success/10 border border-success/20">ASO</span>
                  )}
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
