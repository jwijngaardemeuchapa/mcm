import { useState, useRef, useMemo, useEffect } from "react";
import {
  Upload, X, Search, ArrowUp, ArrowDown, ArrowUpDown,
  BarChart2, Target, TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, MapPin, Briefcase, AlertCircle, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { timeAgo } from "@/lib/datetime";

/* ─────────────── types ── */

type TaskRow = {
  id: number;
  data: string;
  status: string;
  nomeFantasia: string;
  grupoEconomico: string;
  carteira: string;
  tipoTrabalho: string;
  cidade: string;
  uf: string;
  motivoCancelamento: string;
  valorTarefa: number;
  repasse: number;
  takeRate: number;
  chapasAtendidos: number;
  chapasSolicitados: number;
  fillRate: number;
};

type StoredData = { rows: TaskRow[]; uploadedAt: string };
type TaskSortKey = "id" | "data" | "fill" | "take" | "chapas" | "valor";
type RankSortKey = "fill" | "nome" | "tasks" | "valor" | "take" | "cancel";
type SortDir = "asc" | "desc";

type CompanyRank = {
  nome: string;
  grupoEconomico: string;
  carteiras: string[];
  ufs: string[];
  tasks: number;
  finalizadas: number;
  canceladas: number;
  atendidos: number;
  solicitados: number;
  fill: number;
  fillMin: number;
  fillMax: number;
  take: number;
  valor: number;
  repasse: number;
  ticketMedio: number;
  mediaChapas: number;
  cidades: Array<{ label: string; count: number }>;
  tiposTrabalho: Array<{ label: string; count: number }>;
  motivosCancelamento: Array<{ label: string; count: number }>;
};

/* ─────────────── storage ── */

const STORAGE_KEY = "analytics_fillrate_v2";

function loadStored(): StoredData | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as StoredData) : null;
  } catch { return null; }
}

/* ─────────────── parsers ── */

function parseBRL(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function parsePct(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace("%", "").replace(",", ".")) || 0;
}

function parseCSV(text: string): TaskRow[] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { result.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    result.push(cur.trim());
    return result;
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().trim());
  function idx(kw: string[]) { return headers.findIndex((h) => kw.every((k) => h.includes(k))); }

  const col = {
    id: idx(["tarefa"]), data: idx(["data"]), status: idx(["status"]),
    nome: idx(["nome", "fantasia"]), grupo: idx(["grupo"]), carteira: idx(["carteira"]),
    tipo: idx(["tipo"]), cidade: idx(["cidade"]), uf: idx(["uf"]),
    motivo: idx(["motivo"]), valor: idx(["valor", "tarefa"]), repasse: idx(["repasse"]),
    takeRate: idx(["take"]), atendidos: idx(["atendido"]), solicit: idx(["solicitado"]),
    fill: idx(["fill"]),
  };

  const rows: TaskRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseLine(lines[i]);
    if (c.length < 5) continue;
    const nome = col.nome >= 0 ? c[col.nome] : "";
    if (!nome) continue;
    rows.push({
      id:                 parseInt(c[col.id] ?? "0", 10) || 0,
      data:               col.data >= 0 ? c[col.data] : "",
      status:             col.status >= 0 ? c[col.status] : "",
      nomeFantasia:       nome.trim(),
      grupoEconomico:     col.grupo >= 0 ? c[col.grupo]?.trim() ?? "" : "",
      carteira:           col.carteira >= 0 ? c[col.carteira]?.trim() ?? "" : "",
      tipoTrabalho:       col.tipo >= 0 ? c[col.tipo]?.trim() ?? "" : "",
      cidade:             col.cidade >= 0 ? c[col.cidade]?.trim() ?? "" : "",
      uf:                 col.uf >= 0 ? c[col.uf]?.trim() ?? "" : "",
      motivoCancelamento: col.motivo >= 0 ? c[col.motivo]?.trim() ?? "" : "",
      valorTarefa:        col.valor >= 0 ? parseBRL(c[col.valor] ?? "") : 0,
      repasse:            col.repasse >= 0 ? parseBRL(c[col.repasse] ?? "") : 0,
      takeRate:           col.takeRate >= 0 ? parsePct(c[col.takeRate] ?? "") : 0,
      chapasAtendidos:    parseInt(c[col.atendidos] ?? "0", 10) || 0,
      chapasSolicitados:  parseInt(c[col.solicit] ?? "0", 10) || 0,
      fillRate:           col.fill >= 0 ? parsePct(c[col.fill] ?? "") : 0,
    });
  }
  return rows;
}

/* ─────────────── helpers ── */

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function parseDateTs(s: string): number {
  if (!s) return NaN;
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]).getTime();
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]).getTime();
  const m3 = s.match(/(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (m3) {
    const mo = MONTHS[m3[1].toLowerCase()];
    if (mo !== undefined) return new Date(+m3[3], mo, +m3[2]).getTime();
  }
  return NaN;
}

function periodLabel(rows: { data: string }[]): string {
  const ts = rows.map((r) => parseDateTs(r.data)).filter(Number.isFinite);
  if (!ts.length) return "";
  const fmt = (t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const min = Math.min(...ts), max = Math.max(...ts);
  return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
}

function weightedFill(rows: TaskRow[]) {
  const at = rows.reduce((a, r) => a + r.chapasAtendidos, 0);
  const sol = rows.reduce((a, r) => a + r.chapasSolicitados, 0);
  return sol > 0 ? Math.round((at / sol) * 100) : 0;
}

function avgTakeRate(rows: TaskRow[]) {
  if (!rows.length) return 0;
  return rows.reduce((a, r) => a + r.takeRate, 0) / rows.length;
}

function fillColor(v: number) {
  return v >= 80 ? "text-success" : v >= 60 ? "text-warning" : "text-destructive";
}

function fillBg(v: number) {
  return v >= 80 ? "bg-success" : v >= 60 ? "bg-warning" : "bg-destructive";
}

/* ─────────────── buildRanking ── */

function buildRanking(rows: TaskRow[]): CompanyRank[] {
  const map = new Map<string, {
    rows: TaskRow[]; grupoEconomico: string; carteiras: Set<string>; ufs: Set<string>;
  }>();

  for (const r of rows) {
    if (!map.has(r.nomeFantasia))
      map.set(r.nomeFantasia, { rows: [], grupoEconomico: r.grupoEconomico, carteiras: new Set(), ufs: new Set() });
    const e = map.get(r.nomeFantasia)!;
    e.rows.push(r);
    if (r.carteira) e.carteiras.add(r.carteira);
    if (r.uf) e.ufs.add(r.uf);
  }

  return Array.from(map.entries()).map(([nome, { rows: tr, grupoEconomico, carteiras, ufs }]) => {
    const fin = tr.filter((r) => r.status === "Finalizado");
    const can = tr.filter((r) => r.status === "Cancelado");
    const atendidos = tr.reduce((a, r) => a + r.chapasAtendidos, 0);
    const solicitados = tr.reduce((a, r) => a + r.chapasSolicitados, 0);
    const fill = solicitados > 0 ? Math.round((atendidos / solicitados) * 100) : 0;
    const taskFills = tr.filter((r) => r.chapasSolicitados > 0).map((r) => r.fillRate);
    const fillMin = taskFills.length ? Math.round(Math.min(...taskFills)) : 0;
    const fillMax = taskFills.length ? Math.round(Math.max(...taskFills)) : 0;
    const take = tr.length > 0 ? tr.reduce((a, r) => a + r.takeRate, 0) / tr.length : 0;
    const valor = tr.reduce((a, r) => a + r.valorTarefa, 0);
    const repasse = tr.reduce((a, r) => a + r.repasse, 0);

    const cidadeMap = new Map<string, number>();
    tr.forEach((r) => {
      const k = r.uf ? `${r.cidade} (${r.uf})` : r.cidade;
      if (k.trim()) cidadeMap.set(k, (cidadeMap.get(k) ?? 0) + 1);
    });
    const tipoMap = new Map<string, number>();
    tr.forEach((r) => { if (r.tipoTrabalho) tipoMap.set(r.tipoTrabalho, (tipoMap.get(r.tipoTrabalho) ?? 0) + 1); });
    const motivoMap = new Map<string, number>();
    can.forEach((r) => { if (r.motivoCancelamento) motivoMap.set(r.motivoCancelamento, (motivoMap.get(r.motivoCancelamento) ?? 0) + 1); });

    return {
      nome, grupoEconomico,
      carteiras: Array.from(carteiras).sort(),
      ufs: Array.from(ufs).sort(),
      tasks: tr.length,
      finalizadas: fin.length,
      canceladas: can.length,
      atendidos, solicitados, fill, fillMin, fillMax, take, valor, repasse,
      ticketMedio: tr.length > 0 ? valor / tr.length : 0,
      mediaChapas: tr.length > 0 ? solicitados / tr.length : 0,
      cidades: Array.from(cidadeMap.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      tiposTrabalho: Array.from(tipoMap.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      motivosCancelamento: Array.from(motivoMap.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    };
  }).sort((a, b) => a.fill - b.fill);
}

/* ─────────────── sub-components ── */

function FillBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${fillBg(value)} transition-[width]`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums w-8 text-right ${fillColor(value)}`}>{value}%</span>
    </div>
  );
}

function KpiCard({ label, value, sub, tone, icon: Icon }: {
  label: string; value: string | number; sub?: string; tone?: string; icon?: typeof BarChart2;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground opacity-60">{label}</span>
        {Icon && <Icon className={`h-4 w-4 ${tone ?? "text-muted-foreground"}`} />}
      </div>
      <div className={`text-2xl font-display font-bold tabular-nums ${tone ?? "text-foreground"}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function SortBtn({ label, k, cur, dir, onToggle }: {
  label: string; k: TaskSortKey; cur: TaskSortKey; dir: SortDir; onToggle: (k: TaskSortKey) => void;
}) {
  const active = cur === k;
  return (
    <button type="button" onClick={() => onToggle(k)}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {label}
      {active ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

/* ─────────────── CompanyRankingTable ── */

const RANK_COLS = "minmax(180px,1fr) 68px 100px 90px 130px 62px 100px 24px";

function RankSortBtn({ label, k, cur, dir, onToggle }: {
  label: string; k: RankSortKey; cur: RankSortKey; dir: SortDir; onToggle: (k: RankSortKey) => void;
}) {
  const active = cur === k;
  return (
    <button type="button" onClick={() => onToggle(k)}
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold transition-colors whitespace-nowrap ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {label}
      {active ? (dir === "asc" ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />) : <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />}
    </button>
  );
}

function CompanyRankingTable({ stats, selected, onSelect }: {
  stats: CompanyRank[];
  selected: string;
  onSelect: (n: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [fillFaixa, setFillFaixa] = useState("__all__");
  const [sortKey, setSortKey] = useState<RankSortKey>("fill");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleSort(k: RankSortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  function toggleExpand(nome: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded((prev) => { const n = new Set(prev); if (n.has(nome)) n.delete(nome); else n.add(nome); return n; });
  }

  const distOk = stats.filter((s) => s.fill >= 80).length;
  const distAtencao = stats.filter((s) => s.fill >= 60 && s.fill < 80).length;
  const distCritico = stats.filter((s) => s.fill < 60).length;

  const filtered = useMemo(() => stats.filter((s) => {
    if (search && !s.nome.toLowerCase().includes(search.toLowerCase())) return false;
    if (fillFaixa === "critico" && s.fill >= 60) return false;
    if (fillFaixa === "atencao" && (s.fill < 60 || s.fill >= 80)) return false;
    if (fillFaixa === "ok" && s.fill < 80) return false;
    return true;
  }), [stats, search, fillFaixa]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let d = 0;
    if (sortKey === "fill") d = a.fill - b.fill;
    else if (sortKey === "nome") d = a.nome.localeCompare(b.nome);
    else if (sortKey === "tasks") d = a.tasks - b.tasks;
    else if (sortKey === "valor") d = a.valor - b.valor;
    else if (sortKey === "take") d = a.take - b.take;
    else if (sortKey === "cancel") d = (a.canceladas / Math.max(1, a.tasks)) - (b.canceladas / Math.max(1, b.tasks));
    return sortDir === "asc" ? d : -d;
  }), [filtered, sortKey, sortDir]);

  const faixaBtn = (faixa: string, label: string, cls: string, activeCls: string) => (
    <button
      onClick={() => setFillFaixa(fillFaixa === faixa ? "__all__" : faixa)}
      className={`text-[10px] font-bold px-2 py-1 rounded-full transition-colors ${fillFaixa === faixa ? activeCls : cls}`}
    >{label}</button>
  );

  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      {/* header */}
      <div className="px-4 py-3 border-b border-border space-y-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-foreground">
            Empresas <span className="text-muted-foreground font-normal">({stats.length})</span>
          </h2>
          <div className="flex items-center gap-1.5">
            {faixaBtn("ok",      `≥80% · ${distOk}`,      "bg-success/10 text-success hover:bg-success/20",      "bg-success text-white")}
            {faixaBtn("atencao", `60-79% · ${distAtencao}`, "bg-warning/10 text-warning hover:bg-warning/20",      "bg-warning text-white")}
            {faixaBtn("critico", `<60% · ${distCritico}`,  "bg-destructive/10 text-destructive hover:bg-destructive/20", "bg-destructive text-white")}
          </div>
        </div>

        {/* search + sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa…" className="pl-8 h-8 text-xs" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{filtered.length} empresa{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* sort bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Ordenar:</span>
          {(["fill", "nome", "tasks", "valor", "take", "cancel"] as RankSortKey[]).map((k) => {
            const labels: Record<RankSortKey, string> = {
              fill: "Fill", nome: "Nome", tasks: "Tarefas", valor: "Valor", take: "Take", cancel: "% Canc.",
            };
            return <RankSortBtn key={k} label={labels[k]} k={k} cur={sortKey} dir={sortDir} onToggle={toggleSort} />;
          })}
        </div>
      </div>

      {/* col headers */}
      <div className="grid gap-2 px-4 py-2 bg-muted/30 border-b border-border text-[11px] uppercase tracking-wider font-semibold text-muted-foreground"
        style={{ gridTemplateColumns: RANK_COLS }}>
        <span>Empresa</span>
        <span className="text-center">Tar.</span>
        <span className="text-center">Fin. / Canc.</span>
        <span className="text-center">Chapas</span>
        <span>Fill Rate</span>
        <span className="text-center">Take</span>
        <span className="text-right">Valor</span>
        <span />
      </div>

      {/* rows */}
      <div className="max-h-[520px] overflow-y-auto divide-y divide-border">
        {sorted.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</div>
        ) : sorted.map((s) => {
          const isSelected = selected === s.nome;
          const isExpanded = expanded.has(s.nome);
          const cancelRate = s.tasks > 0 ? Math.round((s.canceladas / s.tasks) * 100) : 0;

          return (
            <div key={s.nome}>
              <div
                className={`grid gap-2 px-4 py-3 items-center cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/20"
                }`}
                style={{ gridTemplateColumns: RANK_COLS }}
                onClick={() => onSelect(isSelected ? "__all__" : s.nome)}
              >
                {/* nome + badges */}
                <div className="min-w-0">
                  <span className="text-sm font-medium capitalize text-foreground truncate block">
                    {s.nome.toLowerCase()}
                  </span>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {s.grupoEconomico && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{s.grupoEconomico}</span>
                    )}
                    {s.carteiras.map((c) => (
                      <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c}</span>
                    ))}
                    {s.ufs.length > 0 && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <MapPin className="h-2.5 w-2.5" />
                        {s.ufs.length > 3 ? `${s.ufs.slice(0, 3).join(", ")} +${s.ufs.length - 3}` : s.ufs.join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                {/* tarefas */}
                <span className="text-sm font-semibold tabular-nums text-center text-foreground">{s.tasks}</span>

                {/* fin / canc */}
                <div className="text-xs tabular-nums text-center">
                  <span className="text-success font-semibold">{s.finalizadas}</span>
                  {s.canceladas > 0
                    ? <span className="text-warning"> / {s.canceladas} <span className="text-muted-foreground text-[10px]">({cancelRate}%)</span></span>
                    : <span className="text-muted-foreground"> / 0</span>
                  }
                </div>

                {/* chapas */}
                <div className="text-xs tabular-nums text-center">
                  <span className={`font-semibold ${fillColor(s.fill)}`}>{s.atendidos}</span>
                  <span className="text-muted-foreground">/{s.solicitados}</span>
                  <div className="text-[10px] text-muted-foreground">~{s.mediaChapas.toFixed(1)}/tar</div>
                </div>

                {/* fill bar */}
                <FillBar value={s.fill} />

                {/* take */}
                <span className={`text-xs font-semibold tabular-nums text-center ${s.take >= 25 ? "text-success" : s.take >= 15 ? "text-warning" : "text-destructive"}`}>
                  {s.take.toFixed(1)}%
                </span>

                {/* valor */}
                <span className="text-xs tabular-nums text-muted-foreground text-right">
                  {s.valor > 0 ? s.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                </span>

                {/* expand */}
                <button type="button" onClick={(e) => toggleExpand(s.nome, e)}
                  className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted">
                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>

              {/* expanded detail */}
              {isExpanded && (
                <div className="bg-muted/20 border-b border-border px-5 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {/* cidades */}
                    {s.cidades.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                          <MapPin className="h-3 w-3" /> Cidades ({s.cidades.length})
                        </p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {s.cidades.slice(0, 8).map((c) => (
                            <div key={c.label} className="flex justify-between text-xs">
                              <span className="text-foreground">{c.label}</span>
                              <span className="text-muted-foreground tabular-nums">{c.count}×</span>
                            </div>
                          ))}
                          {s.cidades.length > 8 && <p className="text-[10px] text-muted-foreground">+{s.cidades.length - 8} cidades</p>}
                        </div>
                      </div>
                    )}

                    {/* tipos */}
                    {s.tiposTrabalho.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Briefcase className="h-3 w-3" /> Tipos de Trabalho
                        </p>
                        <div className="space-y-1">
                          {s.tiposTrabalho.slice(0, 6).map((t) => (
                            <div key={t.label} className="flex justify-between text-xs">
                              <span className="text-foreground truncate">{t.label}</span>
                              <span className="text-muted-foreground tabular-nums ml-2">{t.count}×</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* financeiro + fill range + cancelamentos */}
                    <div className="space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                          <DollarSign className="h-3 w-3" /> Financeiro
                        </p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Ticket médio</span>
                            <span className="tabular-nums text-foreground font-semibold">
                              {s.ticketMedio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Repasse total</span>
                            <span className="tabular-nums text-foreground">
                              {s.repasse.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Take rate médio</span>
                            <span className={`tabular-nums font-semibold ${s.take >= 25 ? "text-success" : s.take >= 15 ? "text-warning" : "text-destructive"}`}>
                              {s.take.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* fill range */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Fill por tarefa</p>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-bold tabular-nums ${fillColor(s.fillMin)}`}>{s.fillMin}%</span>
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden relative">
                            <div
                              className={`absolute h-full opacity-25 ${fillBg(s.fill)}`}
                              style={{ left: `${Math.min(s.fillMin, 100)}%`, width: `${Math.max(0, Math.min(s.fillMax, 100) - Math.min(s.fillMin, 100))}%` }}
                            />
                            <div
                              className={`absolute top-0 h-full w-0.5 ${fillBg(s.fill)}`}
                              style={{ left: `${Math.min(s.fill, 100)}%` }}
                            />
                          </div>
                          <span className={`font-bold tabular-nums ${fillColor(s.fillMax)}`}>{s.fillMax}%</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">mín – máx por tarefa · média {s.fill}%</p>
                      </div>

                      {/* cancelamentos */}
                      {s.motivosCancelamento.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-warning" /> Motivos de Cancelamento
                          </p>
                          <div className="space-y-0.5">
                            {s.motivosCancelamento.slice(0, 5).map((m) => (
                              <div key={m.label} className="flex justify-between text-xs">
                                <span className="text-warning truncate">{m.label}</span>
                                <span className="text-muted-foreground tabular-nums ml-2">{m.count}×</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer totals */}
      {sorted.length > 0 && (
        <div className="grid gap-2 px-4 py-2.5 bg-muted/40 border-t border-border text-xs font-semibold"
          style={{ gridTemplateColumns: RANK_COLS }}>
          <span className="text-muted-foreground">{sorted.length} empresa{sorted.length !== 1 ? "s" : ""}</span>
          <span className="tabular-nums text-center text-foreground">{sorted.reduce((a, s) => a + s.tasks, 0)}</span>
          <span className="tabular-nums text-center">
            <span className="text-success">{sorted.reduce((a, s) => a + s.finalizadas, 0)}</span>
            {" / "}
            <span className="text-warning">{sorted.reduce((a, s) => a + s.canceladas, 0)}</span>
          </span>
          <span className="tabular-nums text-center text-foreground">
            {sorted.reduce((a, s) => a + s.atendidos, 0)}/{sorted.reduce((a, s) => a + s.solicitados, 0)}
          </span>
          <FillBar value={(() => {
            const at = sorted.reduce((a, s) => a + s.atendidos, 0);
            const sol = sorted.reduce((a, s) => a + s.solicitados, 0);
            return sol > 0 ? Math.round((at / sol) * 100) : 0;
          })()} />
          <span className="tabular-nums text-center text-foreground">
            {(sorted.reduce((a, s) => a + s.take, 0) / sorted.length).toFixed(1)}%
          </span>
          <span className="tabular-nums text-right text-foreground">
            {sorted.reduce((a, s) => a + s.valor, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
          <span />
        </div>
      )}
    </div>
  );
}

/* ─────────────── carteira section ── */

function CarteiraSections({ rows }: { rows: TaskRow[] }) {
  const byCarteira = useMemo(() => {
    const all = Array.from(new Set(rows.map((r) => r.carteira).filter(Boolean))).sort();
    return all.map((cart) => {
      const cr = rows.filter((r) => r.carteira === cart);
      const fin = cr.filter((r) => r.status === "Finalizado");
      const can = cr.filter((r) => r.status === "Cancelado");
      return {
        carteira: cart,
        total: cr.length,
        finalizadas: fin.length,
        canceladas: can.length,
        fill: weightedFill(cr),
        take: avgTakeRate(cr),
        atendidos: cr.reduce((a, r) => a + r.chapasAtendidos, 0),
        solicitados: cr.reduce((a, r) => a + r.chapasSolicitados, 0),
        valor: cr.reduce((a, r) => a + r.valorTarefa, 0),
      };
    });
  }, [rows]);

  if (!byCarteira.length) return null;

  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Por Carteira</h2>
      </div>
      <div className="divide-y divide-border">
        {byCarteira.map((c) => (
          <div key={c.carteira}
            className="grid items-center gap-3 px-4 py-3"
            style={{ gridTemplateColumns: "64px 60px 80px 80px 120px 100px minmax(100px,1fr)" }}>
            <span className="text-xs font-bold px-2 py-1 rounded bg-primary/10 text-primary text-center">{c.carteira}</span>
            <span className="text-sm tabular-nums text-center">
              <span className="font-semibold text-foreground">{c.total}</span>
              <span className="text-[10px] text-muted-foreground block">tarefas</span>
            </span>
            <span className="text-sm tabular-nums text-center">
              <span className="text-success font-semibold">{c.finalizadas}</span>
              {c.canceladas > 0 && <span className="text-warning"> / {c.canceladas}✗</span>}
              <span className="text-[10px] text-muted-foreground block">fin. / canc.</span>
            </span>
            <span className="text-sm tabular-nums text-center">
              <span className={`font-semibold ${fillColor(c.fill)}`}>{c.atendidos}</span>
              <span className="text-muted-foreground">/{c.solicitados}</span>
              <span className="text-[10px] text-muted-foreground block">chapas</span>
            </span>
            <FillBar value={c.fill} />
            <div className="text-center">
              <span className="text-sm font-semibold tabular-nums text-foreground">{c.take.toFixed(1)}%</span>
              <span className="text-[10px] text-muted-foreground block">take rate</span>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground text-right">
              {c.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </div>
        ))}
      </div>
      <div className="grid items-center gap-3 px-4 py-2.5 bg-muted/40 border-t border-border text-xs font-semibold"
        style={{ gridTemplateColumns: "64px 60px 80px 80px 120px 100px minmax(100px,1fr)" }}>
        <span className="text-muted-foreground">Total</span>
        <span className="text-foreground tabular-nums text-center">{byCarteira.reduce((a, c) => a + c.total, 0)}</span>
        <span className="text-foreground tabular-nums text-center">
          {byCarteira.reduce((a, c) => a + c.finalizadas, 0)} / {byCarteira.reduce((a, c) => a + c.canceladas, 0)}
        </span>
        <span className="tabular-nums text-center text-foreground">
          {byCarteira.reduce((a, c) => a + c.atendidos, 0)}/{byCarteira.reduce((a, c) => a + c.solicitados, 0)}
        </span>
        <FillBar value={weightedFill(rows)} />
        <span className="text-foreground tabular-nums text-center">{avgTakeRate(rows).toFixed(1)}%</span>
        <span className="tabular-nums text-right text-foreground">
          {rows.reduce((a, r) => a + r.valorTarefa, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </span>
      </div>
    </div>
  );
}

/* ─────────────── task table ── */

function TaskTable({ rows }: { rows: TaskRow[] }) {
  const [sortKey, setSortKey] = useState<TaskSortKey>("data");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [carteiraFilter, setCarteiraFilter] = useState("__all__");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const carteiras = useMemo(() => ["__all__", ...Array.from(new Set(rows.map((r) => r.carteira).filter(Boolean))).sort()], [rows]);

  function toggleSort(k: TaskSortKey) {
    if (sortKey === k) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter !== "__all__" && r.status !== statusFilter) return false;
    if (carteiraFilter !== "__all__" && r.carteira !== carteiraFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.tipoTrabalho.toLowerCase().includes(q) && !r.cidade.toLowerCase().includes(q) && !String(r.id).includes(q)) return false;
    }
    return true;
  }), [rows, statusFilter, carteiraFilter, search]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let d = 0;
    if (sortKey === "id") d = a.id - b.id;
    else if (sortKey === "data") d = parseDateTs(a.data) - parseDateTs(b.data);
    else if (sortKey === "fill") d = a.fillRate - b.fillRate;
    else if (sortKey === "take") d = a.takeRate - b.takeRate;
    else if (sortKey === "chapas") d = a.chapasAtendidos - b.chapasAtendidos;
    else if (sortKey === "valor") d = a.valorTarefa - b.valorTarefa;
    return sortDir === "asc" ? d : -d;
  }), [filtered, sortKey, sortDir]);

  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground shrink-0">Por Tarefa</h2>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Tipo, cidade, ID…" className="pl-8 h-8 text-xs" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos status</SelectItem>
            <SelectItem value="Finalizado">Finalizado</SelectItem>
            <SelectItem value="Cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        {carteiras.length > 2 && (
          <Select value={carteiraFilter} onValueChange={setCarteiraFilter}>
            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Carteiras</SelectItem>
              {carteiras.slice(1).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} tarefa{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="grid gap-2 px-4 py-2 bg-muted/30 border-b border-border"
        style={{ gridTemplateColumns: "60px 1fr 70px 80px 80px 80px 90px 80px 24px" }}>
        <SortBtn label="#ID" k="id" cur={sortKey} dir={sortDir} onToggle={toggleSort} />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Tipo / Cidade</span>
        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Cart.</span>
        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Status</span>
        <SortBtn label="Chapas" k="chapas" cur={sortKey} dir={sortDir} onToggle={toggleSort} />
        <SortBtn label="Fill" k="fill" cur={sortKey} dir={sortDir} onToggle={toggleSort} />
        <SortBtn label="Take Rate" k="take" cur={sortKey} dir={sortDir} onToggle={toggleSort} />
        <SortBtn label="Valor" k="valor" cur={sortKey} dir={sortDir} onToggle={toggleSort} />
        <span />
      </div>

      <div className="max-h-[520px] overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma tarefa encontrada.</div>
        ) : sorted.map((r) => (
          <div key={r.id}>
            <div className="grid gap-2 px-4 py-2.5 items-center border-b border-border hover:bg-muted/20 transition-colors cursor-pointer"
              style={{ gridTemplateColumns: "60px 1fr 70px 80px 80px 80px 90px 80px 24px" }}
              onClick={() => toggleExpand(r.id)}>
              <a href={`https://app.meu-chapa.com/admin/edit-task/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-primary hover:underline" title="Abrir tarefa no Meu Chapa">#{r.id}</a>
              <div className="min-w-0">
                <span className="text-xs font-medium text-foreground truncate block">{r.tipoTrabalho || "—"}</span>
                <span className="text-[10px] text-muted-foreground">{r.cidade}{r.uf ? ` (${r.uf})` : ""}</span>
              </div>
              <span className="text-xs text-center">
                {r.carteira
                  ? <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{r.carteira}</span>
                  : <span className="text-muted-foreground">—</span>}
              </span>
              <span className={`text-xs font-semibold flex items-center gap-1 ${r.status === "Finalizado" ? "text-success" : "text-warning"}`}>
                {r.status === "Finalizado" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {r.status === "Finalizado" ? "OK" : "Canc."}
              </span>
              <span className="text-xs tabular-nums text-center">
                <span className={`font-semibold ${fillColor(r.fillRate)}`}>{r.chapasAtendidos}</span>
                <span className="text-muted-foreground">/{r.chapasSolicitados}</span>
              </span>
              <FillBar value={r.fillRate} />
              <span className={`text-xs font-semibold tabular-nums text-center ${r.takeRate >= 25 ? "text-success" : r.takeRate >= 15 ? "text-warning" : "text-destructive"}`}>
                {r.takeRate.toFixed(1)}%
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground text-right">
                {r.valorTarefa > 0 ? r.valorTarefa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
              </span>
              <button type="button" className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted">
                {expanded.has(r.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
            {expanded.has(r.id) && (
              <div className="bg-muted/20 px-6 py-3 border-b border-border grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 text-xs">
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Data</span><span className="text-foreground">{r.data}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Grupo</span><span className="text-foreground">{r.grupoEconomico || "—"}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Repasse</span><span className="text-foreground tabular-nums">{r.repasse.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></div>
                {r.motivoCancelamento && (
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Cancelamento</span><span className="text-warning">{r.motivoCancelamento}</span></div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {sorted.length > 0 && (
        <div className="grid gap-2 px-4 py-2.5 bg-muted/40 border-t border-border text-xs font-semibold"
          style={{ gridTemplateColumns: "60px 1fr 70px 80px 80px 80px 90px 80px 24px" }}>
          <span className="text-muted-foreground">{sorted.length}</span>
          <span /><span />
          <span className="text-success text-center">{sorted.filter((r) => r.status === "Finalizado").length}✓</span>
          <span className="tabular-nums text-center text-foreground">
            {sorted.reduce((a, r) => a + r.chapasAtendidos, 0)}/{sorted.reduce((a, r) => a + r.chapasSolicitados, 0)}
          </span>
          <FillBar value={weightedFill(sorted)} />
          <span className="tabular-nums text-center text-foreground">{avgTakeRate(sorted).toFixed(1)}%</span>
          <span className="tabular-nums text-right text-foreground">
            {sorted.reduce((a, r) => a + r.valorTarefa, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
          <span />
        </div>
      )}
    </div>
  );
}

/* ─────────────── upload zone ── */

function UploadZone({ onFile, dragOver, setDragOver, fileRef }: {
  onFile: (f: FileList | null) => void;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="px-4 md:px-6 py-12 max-w-[620px] mx-auto flex flex-col items-center gap-6">
      <div className="text-center">
        <Target className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
        <h1 className="font-display font-bold text-xl text-foreground">Fill Rate 2.0</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Análise de fill rate e take rate por empresa, carteira e tarefa.
        </p>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`w-full border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}>
        <Upload className={`h-8 w-8 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
        <p className="text-sm font-semibold text-foreground">Arraste o CSV ou clique para selecionar</p>
      </div>
      <div className="w-full rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground text-sm">Como exportar do Metabase</p>
        <ol className="space-y-1 ml-3 list-decimal">
          <li>Abra o relatório <strong className="text-foreground">Fill Rate - Novo</strong></li>
          <li>Acesse a aba <strong className="text-foreground">Arquivo Base</strong> e selecione o período desejado</li>
          <li>No painel de dados, passe o mouse sobre o canto superior direito até aparecer o ícone <strong className="text-foreground">⋯</strong></li>
          <li>Clique em <strong className="text-foreground">Download Results</strong> e selecione <strong className="text-foreground">.csv</strong></li>
        </ol>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => onFile(e.target.files)} />
    </div>
  );
}

/* ────────────────── main page ── */

export default function FillrateDetalhe() {
  const [stored, setStored] = useState<StoredData | null>(loadStored);
  const [dragOver, setDragOver] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState("__all__");
  const [carteiraFilter, setCarteiraFilter] = useState("__all__");
  const [ufFilter, setUfFilter] = useState("__all__");
  const [grupoFilter, setGrupoFilter] = useState("__all__");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") setStored(loadStored());
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  function processFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (!rows.length) { toast.error("Nenhuma linha válida encontrada."); return; }
      const data: StoredData = { rows, uploadedAt: new Date().toISOString() };
      setStored(data);
      setSelectedEmpresa("__all__");
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* quota */ }
      toast.success(`${rows.length} tarefas carregadas`);
    };
    reader.readAsText(file, "UTF-8");
  }

  const rows = stored?.rows ?? [];
  const uploadedAt = stored?.uploadedAt ?? "";

  // filter options
  const carteiras = useMemo(() => ["__all__", ...Array.from(new Set(rows.map((r) => r.carteira).filter(Boolean))).sort()], [rows]);
  const ufs = useMemo(() => ["__all__", ...Array.from(new Set(rows.map((r) => r.uf).filter(Boolean))).sort()], [rows]);
  const grupos = useMemo(() => ["__all__", ...Array.from(new Set(rows.map((r) => r.grupoEconomico).filter(Boolean))).sort()], [rows]);

  // base rows (filtered by carteira + UF + grupo, NOT by empresa)
  const baseRows = useMemo(() => rows.filter((r) => {
    if (carteiraFilter !== "__all__" && r.carteira !== carteiraFilter) return false;
    if (ufFilter !== "__all__" && r.uf !== ufFilter) return false;
    if (grupoFilter !== "__all__" && r.grupoEconomico !== grupoFilter) return false;
    return true;
  }), [rows, carteiraFilter, ufFilter, grupoFilter]);

  // drill-down rows (additionally filtered by empresa)
  const drillRows = useMemo(() =>
    selectedEmpresa === "__all__" ? baseRows : baseRows.filter((r) => r.nomeFantasia === selectedEmpresa),
    [baseRows, selectedEmpresa],
  );

  // ranking built from base rows
  const ranking = useMemo(() => buildRanking(baseRows), [baseRows]);

  if (!stored) {
    return <UploadZone onFile={(f) => { if (f?.[0]) processFile(f[0]); }} dragOver={dragOver} setDragOver={setDragOver} fileRef={fileRef as React.RefObject<HTMLInputElement>} />;
  }

  // KPI values from drillRows
  const fill = weightedFill(drillRows);
  const take = avgTakeRate(drillRows);
  const totalValor = drillRows.reduce((a, r) => a + r.valorTarefa, 0);
  const totalRepasse = drillRows.reduce((a, r) => a + r.repasse, 0);
  const finalizadas = drillRows.filter((r) => r.status === "Finalizado").length;
  const canceladas = drillRows.filter((r) => r.status === "Cancelado").length;
  const cancelRate = drillRows.length > 0 ? Math.round((canceladas / drillRows.length) * 100) : 0;

  // empresa-specific extra KPIs
  const empresaRank = selectedEmpresa !== "__all__" ? ranking.find((s) => s.nome === selectedEmpresa) : null;

  const activeFilters = [carteiraFilter, ufFilter, grupoFilter].filter((f) => f !== "__all__").length;

  return (
    <div className="px-4 md:px-6 py-6 pb-10 space-y-5 max-w-[1400px] mx-auto">
      {/* header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-foreground">Fill Rate 2.0</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rows.length.toLocaleString("pt-BR")} tarefas · {ranking.length} empresas
            {(() => { const p = periodLabel(rows); return p ? ` · ${p}` : ""; })()}
            {" · "}atualizado {timeAgo(uploadedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Atualizar CSV
          </Button>
          <Button size="sm" variant="ghost"
            className="gap-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              if (!confirm("Remover os dados de fillrate carregados?")) return;
              localStorage.removeItem(STORAGE_KEY);
              setStored(null);
              setSelectedEmpresa("__all__");
            }}>
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) processFile(e.target.files[0]); }} />
        </div>
      </div>

      {/* filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {carteiras.length > 2 && (
          <Select value={carteiraFilter} onValueChange={setCarteiraFilter}>
            <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Carteira" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas carteiras</SelectItem>
              {carteiras.slice(1).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {ufs.length > 2 && (
          <Select value={ufFilter} onValueChange={setUfFilter}>
            <SelectTrigger className="h-9 w-[110px] text-xs"><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os UF</SelectItem>
              {ufs.slice(1).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {grupos.length > 2 && (
          <Select value={grupoFilter} onValueChange={setGrupoFilter}>
            <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Grupo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os grupos</SelectItem>
              {grupos.slice(1).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {activeFilters > 0 && (
          <Button size="sm" variant="ghost" className="h-9 gap-1 text-xs text-muted-foreground"
            onClick={() => { setCarteiraFilter("__all__"); setUfFilter("__all__"); setGrupoFilter("__all__"); }}>
            <X className="h-3 w-3" /> Limpar filtros ({activeFilters})
          </Button>
        )}
        {selectedEmpresa !== "__all__" && (
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-xs font-semibold text-primary ml-auto">
            {selectedEmpresa.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
            <button onClick={() => setSelectedEmpresa("__all__")} className="ml-1 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Fill Rate" value={`${fill}%`}
          sub={`${drillRows.reduce((a, r) => a + r.chapasAtendidos, 0).toLocaleString("pt-BR")} / ${drillRows.reduce((a, r) => a + r.chapasSolicitados, 0).toLocaleString("pt-BR")} chapas`}
          tone={fillColor(fill)} icon={BarChart2} />

        {empresaRank ? (
          <KpiCard label="Fill mín – máx" value={`${empresaRank.fillMin}% – ${empresaRank.fillMax}%`}
            sub="faixa por tarefa individual" tone={fillColor(empresaRank.fillMin)} icon={TrendingDown} />
        ) : (
          <KpiCard label="Tx. Cancelamento" value={`${cancelRate}%`}
            sub={`${canceladas} canc. de ${drillRows.length} tar.`}
            tone={cancelRate > 20 ? "text-destructive" : cancelRate > 10 ? "text-warning" : "text-success"} icon={TrendingDown} />
        )}

        <KpiCard label="Take Rate Médio" value={`${take.toFixed(1)}%`}
          sub={`${drillRows.length} tarefa${drillRows.length !== 1 ? "s" : ""}`}
          tone={take >= 25 ? "text-success" : take >= 15 ? "text-warning" : "text-destructive"} icon={TrendingUp} />

        <KpiCard label="Finalizadas" value={finalizadas.toLocaleString("pt-BR")}
          sub={`${canceladas} cancelada${canceladas !== 1 ? "s" : ""} · ${drillRows.length} total`} />

        <KpiCard label="Faturamento"
          value={totalValor >= 1_000_000
            ? `R$ ${(totalValor / 1_000_000).toFixed(1)}M`
            : totalValor >= 1_000 ? `R$ ${(totalValor / 1_000).toFixed(0)}k` : totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          sub={empresaRank ? `ticket médio ${empresaRank.ticketMedio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : `${ranking.length} empresas`}
          icon={DollarSign} />

        <KpiCard label="Repasse"
          value={totalRepasse >= 1_000_000
            ? `R$ ${(totalRepasse / 1_000_000).toFixed(1)}M`
            : totalRepasse >= 1_000 ? `R$ ${(totalRepasse / 1_000).toFixed(0)}k` : totalRepasse.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          sub={`margem: ${totalValor > 0 ? ((1 - totalRepasse / totalValor) * 100).toFixed(1) : "0"}%`}
          icon={TrendingUp} />
      </div>

      {/* company ranking */}
      <CompanyRankingTable stats={ranking} selected={selectedEmpresa} onSelect={setSelectedEmpresa} />

      {/* por carteira */}
      <CarteiraSections rows={drillRows} />

      {/* por tarefa */}
      <TaskTable rows={drillRows} />
    </div>
  );
}
