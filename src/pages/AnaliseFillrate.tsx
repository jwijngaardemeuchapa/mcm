import { useState, useRef, useMemo, useEffect } from "react";
import {
  Upload, X, Search, ArrowUp, ArrowDown, ArrowUpDown, TrendingDown,
  BarChart2, ChevronDown, ChevronUp, MapPin, Briefcase, AlertCircle,
  DollarSign, ChevronRight, Users, TrendingUp, Target,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TooltipProvider, Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { timeAgo } from "@/lib/datetime";

/* ─────────────────────────────── types ── */

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

type CompanyStats = {
  nome: string;
  grupoEconomico: string;
  carteiras: string[];
  finalizadas: number;
  canceladas: number;
  chapasAtendidos: number;
  chapasSolicitados: number;
  fillRate: number;
  cidades: Array<{ label: string; count: number }>;
  tiposTrabalho: Array<{ label: string; count: number }>;
  motivosCancelamento: Array<{ label: string; count: number }>;
  valorTotal: number;
  repasseTotal: number;
  takeRateMedia: number;
};

type CarteiraStats = {
  nome: string;
  clientes: number;
  finalizadas: number;
  canceladas: number;
  chapasAtendidos: number;
  chapasSolicitados: number;
  fillRate: number;
  valorTotal: number;
  abaixo80: number;
  distribuicao: { verde: number; amarelo: number; vermelho: number };
};

type StoredData = {
  rows: TaskRow[];
  uploadedAt: string;
};

type SortKey = "fillRate" | "nome" | "finalizadas" | "chapasAtendidos" | "valorTotal";
type SortDir = "asc" | "desc";

/* ─────────────────────────────── storage ── */

const STORAGE_KEY = "analytics_clientes_v2";

function loadStored(): StoredData | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as StoredData) : null;
  } catch { return null; }
}

/* ─────────────────────────────── parsers ── */

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

  function idx(kw: string[]): number {
    return headers.findIndex((h) => kw.every((k) => h.includes(k)));
  }

  const col = {
    id:        idx(["tarefa"]),
    data:      idx(["data"]),
    status:    idx(["status"]),
    nome:      idx(["nome", "fantasia"]),
    grupo:     idx(["grupo"]),
    carteira:  idx(["carteira"]),
    tipo:      idx(["tipo"]),
    cidade:    idx(["cidade"]),
    uf:        idx(["uf"]),
    motivo:    idx(["motivo"]),
    valor:     idx(["valor", "tarefa"]),
    repasse:   idx(["repasse"]),
    takeRate:  idx(["take"]),
    atendidos: idx(["atendido"]),
    solicit:   idx(["solicitado"]),
    fill:      idx(["fill"]),
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

/* ─────────────────────────────── aggregation ── */

function aggregateByCompany(rows: TaskRow[]): CompanyStats[] {
  const map = new Map<string, { rows: TaskRow[]; grupoEconomico: string; carteiras: Set<string> }>();

  for (const r of rows) {
    if (!map.has(r.nomeFantasia)) {
      map.set(r.nomeFantasia, { rows: [], grupoEconomico: r.grupoEconomico, carteiras: new Set() });
    }
    const e = map.get(r.nomeFantasia)!;
    e.rows.push(r);
    if (r.carteira) e.carteiras.add(r.carteira);
  }

  const stats: CompanyStats[] = [];
  map.forEach((entry, nome) => {
    const { rows: tr, grupoEconomico, carteiras } = entry;
    const fin = tr.filter((r) => r.status === "Finalizado");
    const can = tr.filter((r) => r.status === "Cancelado");
    const atendidos = tr.reduce((a, r) => a + r.chapasAtendidos, 0);
    const solicit = tr.reduce((a, r) => a + r.chapasSolicitados, 0);

    const cidadeMap = new Map<string, number>();
    tr.forEach((r) => {
      const k = r.uf ? `${r.cidade} (${r.uf})` : r.cidade;
      cidadeMap.set(k, (cidadeMap.get(k) ?? 0) + 1);
    });
    const tipoMap = new Map<string, number>();
    tr.forEach((r) => { if (r.tipoTrabalho) tipoMap.set(r.tipoTrabalho, (tipoMap.get(r.tipoTrabalho) ?? 0) + 1); });
    const motivoMap = new Map<string, number>();
    can.forEach((r) => { if (r.motivoCancelamento) motivoMap.set(r.motivoCancelamento, (motivoMap.get(r.motivoCancelamento) ?? 0) + 1); });

    stats.push({
      nome,
      grupoEconomico,
      carteiras: Array.from(carteiras).sort(),
      finalizadas: fin.length,
      canceladas: can.length,
      chapasAtendidos: atendidos,
      chapasSolicitados: solicit,
      fillRate: solicit > 0 ? Math.round((atendidos / solicit) * 100) : 0,
      cidades: Array.from(cidadeMap.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      tiposTrabalho: Array.from(tipoMap.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      motivosCancelamento: Array.from(motivoMap.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      valorTotal: tr.reduce((a, r) => a + r.valorTarefa, 0),
      repasseTotal: tr.reduce((a, r) => a + r.repasse, 0),
      takeRateMedia: tr.length > 0 ? tr.reduce((a, r) => a + r.takeRate, 0) / tr.length : 0,
    });
  });

  return stats;
}

function aggregateByCarteira(rows: TaskRow[], companies: CompanyStats[]): CarteiraStats[] {
  const map = new Map<string, TaskRow[]>();
  for (const r of rows) {
    if (!r.carteira) continue;
    if (!map.has(r.carteira)) map.set(r.carteira, []);
    map.get(r.carteira)!.push(r);
  }

  const result: CarteiraStats[] = [];
  map.forEach((tr, nome) => {
    const fin = tr.filter((r) => r.status === "Finalizado").length;
    const can = tr.filter((r) => r.status === "Cancelado").length;
    const atendidos = tr.reduce((a, r) => a + r.chapasAtendidos, 0);
    const solicit = tr.reduce((a, r) => a + r.chapasSolicitados, 0);
    const companiesIn = companies.filter((c) => c.carteiras.includes(nome));
    const verde = companiesIn.filter((c) => c.fillRate >= 80).length;
    const amarelo = companiesIn.filter((c) => c.fillRate >= 60 && c.fillRate < 80).length;
    const vermelho = companiesIn.filter((c) => c.fillRate < 60 && c.chapasSolicitados > 0).length;
    result.push({
      nome,
      clientes: new Set(tr.map((r) => r.nomeFantasia)).size,
      finalizadas: fin,
      canceladas: can,
      chapasAtendidos: atendidos,
      chapasSolicitados: solicit,
      fillRate: solicit > 0 ? Math.round((atendidos / solicit) * 100) : 0,
      valorTotal: tr.reduce((a, r) => a + r.valorTarefa, 0),
      abaixo80: companiesIn.filter((c) => c.fillRate < 80 && c.chapasSolicitados > 0).length,
      distribuicao: { verde, amarelo, vermelho },
    });
  });

  return result.sort((a, b) => a.nome.localeCompare(b.nome));
}

/* ─────────────────────────────── helpers ── */

function fillColor(v: number) {
  return v >= 80 ? "hsl(var(--success))" : v >= 60 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
}
function fillTextClass(v: number) {
  return v >= 80 ? "text-success" : v >= 60 ? "text-warning" : "text-destructive";
}
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ─────────────────────────────── sub-components ── */

function FillBar({ value, showPct = true }: { value: number; showPct?: boolean }) {
  const bg = value >= 80 ? "bg-success" : value >= 60 ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${bg} transition-[width] duration-300`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      {showPct && <span className={`text-xs font-bold tabular-nums w-9 text-right ${fillTextClass(value)}`}>{value}%</span>}
    </div>
  );
}

function StatCard({ label, value, sub, tone, icon: Icon }: {
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

function SortBtn({ label, sortKey, current, dir, onToggle }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onToggle: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <button type="button" onClick={() => onToggle(sortKey)}
      className={`inline-flex items-center gap-1 text-xs font-semibold transition-colors whitespace-nowrap ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {label}
      {active ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

/* ---- Carteira comparison row ---- */
function CarteiraRow({ stat, active, onClick }: { stat: CarteiraStats; active: boolean; onClick: () => void }) {
  const cancelRate = stat.finalizadas + stat.canceladas > 0
    ? Math.round((stat.canceladas / (stat.finalizadas + stat.canceladas)) * 100) : 0;
  return (
    <div
      className={`grid gap-3 px-4 py-3 items-center cursor-pointer transition-colors border-b border-border last:border-0 ${active ? "bg-primary/5" : "hover:bg-muted/20"}`}
      style={{ gridTemplateColumns: "minmax(140px,1fr) 50px 50px 50px 90px 120px 110px 20px" }}
      onClick={onClick}
    >
      {/* Nome */}
      <div className="min-w-0">
        <p className={`font-semibold text-sm truncate ${active ? "text-primary" : "text-foreground"}`}>{stat.nome}</p>
        <p className="text-[11px] text-muted-foreground">{stat.clientes} cliente{stat.clientes !== 1 ? "s" : ""} · {stat.finalizadas} tarefas</p>
      </div>
      {/* Dist verde/amarelo/vermelho */}
      <UITooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-0.5 text-[11px] font-bold justify-center">
            <span className="text-success">{stat.distribuicao.verde}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-warning">{stat.distribuicao.amarelo}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-destructive">{stat.distribuicao.vermelho}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          <p className="text-success">≥80%: {stat.distribuicao.verde} clientes</p>
          <p className="text-warning">60–79%: {stat.distribuicao.amarelo} clientes</p>
          <p className="text-destructive">&lt;60%: {stat.distribuicao.vermelho} clientes</p>
        </TooltipContent>
      </UITooltip>
      {/* Abaixo de 80% */}
      <span className={`text-xs font-semibold tabular-nums text-center ${stat.abaixo80 > 0 ? "text-destructive" : "text-success"}`}>
        {stat.abaixo80 > 0 ? `${stat.abaixo80}↓` : "✓"}
      </span>
      {/* Cancel rate */}
      <span className={`text-xs tabular-nums text-center ${cancelRate > 15 ? "text-warning" : "text-muted-foreground"}`}>
        {cancelRate > 0 ? `${cancelRate}%` : "—"}
      </span>
      {/* Chapas */}
      <span className="text-xs tabular-nums text-center">
        <span className={fillTextClass(stat.fillRate)}>{stat.chapasAtendidos}</span>
        <span className="text-muted-foreground">/{stat.chapasSolicitados}</span>
      </span>
      {/* Fill Rate */}
      <FillBar value={stat.fillRate} />
      {/* Valor */}
      <span className="text-xs tabular-nums text-right text-foreground">{brl(stat.valorTotal)}</span>
      <ChevronRight className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
    </div>
  );
}

/* ---- Company row (unchanged) ---- */
function CompanyRow({ s, expanded, onToggle }: { s: CompanyStats; expanded: boolean; onToggle: () => void }) {
  const cancelRate = s.finalizadas + s.canceladas > 0
    ? Math.round((s.canceladas / (s.finalizadas + s.canceladas)) * 100) : 0;
  return (
    <>
      <div
        className="grid gap-2 px-4 py-3 items-center hover:bg-muted/20 transition-colors cursor-pointer border-b border-border"
        style={{ gridTemplateColumns: "minmax(180px,1fr) 90px 80px 80px 80px 110px 90px 24px" }}
        onClick={onToggle}
      >
        <div className="min-w-0">
          <span className="text-sm font-medium text-foreground capitalize truncate block">{s.nome.toLowerCase()}</span>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {s.grupoEconomico && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{s.grupoEconomico}</span>
            )}
            {s.carteiras.map((c) => (
              <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c}</span>
            ))}
          </div>
        </div>
        <span className="text-sm font-semibold tabular-nums text-foreground text-center">{s.finalizadas}</span>
        <span className={`text-sm font-semibold tabular-nums text-center ${s.canceladas > 0 ? "text-warning" : "text-muted-foreground"}`}>
          {s.canceladas}{cancelRate > 0 && <span className="text-[10px] font-normal text-muted-foreground ml-0.5">({cancelRate}%)</span>}
        </span>
        <span className="text-sm tabular-nums text-center">
          <span className={s.fillRate >= 80 ? "text-success font-semibold" : s.fillRate >= 60 ? "text-warning font-semibold" : "text-destructive font-semibold"}>{s.chapasAtendidos}</span>
          <span className="text-muted-foreground">/{s.chapasSolicitados}</span>
        </span>
        <UITooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground justify-center cursor-default">
              <MapPin className="h-3 w-3" />{s.cidades.length}
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[260px]">
            <div className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
              {s.cidades.slice(0, 12).map((c) => (
                <div key={c.label}>{c.label} <span className="text-muted-foreground">×{c.count}</span></div>
              ))}
              {s.cidades.length > 12 && <div className="text-muted-foreground">+{s.cidades.length - 12} cidades</div>}
            </div>
          </TooltipContent>
        </UITooltip>
        <FillBar value={s.fillRate} />
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggle(); }} className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>
      {expanded && (
        <div className="bg-muted/20 border-b border-border px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> Cidades ({s.cidades.length})
              </p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {s.cidades.map((c) => (
                  <div key={c.label} className="flex items-center justify-between text-xs">
                    <span>{c.label}</span>
                    <span className="text-muted-foreground tabular-nums">{c.count} tarefa{c.count !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <Briefcase className="h-3 w-3" /> Tipos de Trabalho
              </p>
              <div className="space-y-1">
                {s.tiposTrabalho.map((t) => (
                  <div key={t.label} className="flex items-center justify-between text-xs">
                    <span>{t.label}</span>
                    <span className="text-muted-foreground tabular-nums">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" /> Financeiro
                </p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor total</span><span className="font-semibold tabular-nums">{brl(s.valorTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Repasse total</span><span className="tabular-nums">{brl(s.repasseTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Take rate médio</span><span className="tabular-nums">{s.takeRateMedia.toFixed(1)}%</span></div>
                </div>
              </div>
              {s.motivosCancelamento.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3" /> Cancelamentos
                  </p>
                  <div className="space-y-1">
                    {s.motivosCancelamento.map((m) => (
                      <div key={m.label} className="flex items-center justify-between text-xs">
                        <span className="text-warning">{m.label}</span>
                        <span className="text-muted-foreground tabular-nums">{m.count}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────── upload zone ── */

function UploadZone({ onFile, dragOver, setDragOver, fileRef }: {
  onFile: (f: FileList | null) => void;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="px-4 md:px-6 py-12 max-w-[620px] mx-auto flex flex-col items-center gap-6">
      <div className="text-center">
        <BarChart2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
        <h1 className="font-display font-bold text-xl text-foreground">Fill Rate — Análise por Carteira</h1>
        <p className="text-sm text-muted-foreground mt-2">Importe o CSV de fill rate para visualizar métricas por carteira e por cliente.</p>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={`w-full border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
      >
        <Upload className={`h-8 w-8 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
        <p className="text-sm font-semibold text-foreground">Arraste o CSV ou clique para selecionar</p>
      </div>
      <div className="w-full rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground text-sm">Como exportar do Metabase</p>
        <ol className="space-y-1 ml-3 list-decimal">
          <li>Abra o relatório <strong className="text-foreground">Fill Rate - Novo</strong></li>
          <li>Acesse a aba <strong className="text-foreground">Arquivo Base</strong> e selecione o período</li>
          <li>Passe o mouse sobre o canto superior direito → ícone <strong className="text-foreground">⋯</strong></li>
          <li>Clique em <strong className="text-foreground">Download Results → .csv</strong></li>
        </ol>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => onFile(e.target.files)} />
    </div>
  );
}

/* ────────────────────────────────── main page ── */

export default function AnaliseFillrate() {
  const [stored, setStored] = useState<StoredData | null>(loadStored);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState("");
  const [carteiraFilter, setCarteiraFilter] = useState("__all__");
  const [grupoFilter, setGrupoFilter] = useState("__all__");
  const [ufFilter, setUfFilter] = useState("__all__");
  const [sortKey, setSortKey] = useState<SortKey>("fillRate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
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
      if (rows.length === 0) { toast.error("Nenhuma linha válida encontrada."); return; }
      const data: StoredData = { rows, uploadedAt: new Date().toISOString() };
      setStored(data);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* quota */ }
      toast.success(`${rows.length} tarefas carregadas`);
    };
    reader.readAsText(file, "UTF-8");
  }

  function clearData() {
    localStorage.removeItem(STORAGE_KEY);
    setStored(null);
    setExpandedRows(new Set());
    setCarteiraFilter("__all__");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "fillRate" ? "asc" : "desc"); }
  }

  function toggleExpand(nome: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome); else next.add(nome);
      return next;
    });
  }

  const rows = stored?.rows ?? [];
  const uploadedAt = stored?.uploadedAt ?? "";

  // ── aggregation ──
  const companies = useMemo(() => aggregateByCompany(rows), [rows]);
  const carteiraStats = useMemo(() => aggregateByCarteira(rows, companies), [rows, companies]);

  // ── filter options ──
  const grupos = useMemo(() => ["__all__", ...Array.from(new Set(rows.map((r) => r.grupoEconomico).filter(Boolean))).sort()], [rows]);
  const ufs = useMemo(() => ["__all__", ...Array.from(new Set(rows.map((r) => r.uf).filter(Boolean))).sort()], [rows]);

  // ── rows scoped to selected carteira (for KPIs) ──
  const scopedRows = useMemo(
    () => carteiraFilter !== "__all__" ? rows.filter((r) => r.carteira === carteiraFilter) : rows,
    [rows, carteiraFilter],
  );

  // ── filter companies ──
  const filtered = useMemo(() => {
    return companies.filter((s) => {
      if (search && !s.nome.toLowerCase().includes(search.toLowerCase())) return false;
      if (carteiraFilter !== "__all__" && !s.carteiras.includes(carteiraFilter)) return false;
      if (grupoFilter !== "__all__" && s.grupoEconomico !== grupoFilter) return false;
      if (ufFilter !== "__all__") {
        if (!s.cidades.some((c) => c.label.endsWith(`(${ufFilter})`))) return false;
      }
      return true;
    });
  }, [companies, search, carteiraFilter, grupoFilter, ufFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let diff = 0;
      if (sortKey === "fillRate") diff = a.fillRate - b.fillRate;
      else if (sortKey === "nome") diff = a.nome.localeCompare(b.nome);
      else if (sortKey === "finalizadas") diff = a.finalizadas - b.finalizadas;
      else if (sortKey === "chapasAtendidos") diff = a.chapasAtendidos - b.chapasAtendidos;
      else if (sortKey === "valorTotal") diff = a.valorTotal - b.valorTotal;
      return sortDir === "asc" ? diff : -diff;
    });
  }, [filtered, sortKey, sortDir]);

  if (!stored) {
    return <UploadZone onFile={(f) => { if (f?.[0]) processFile(f[0]); }} dragOver={dragOver} setDragOver={setDragOver} fileRef={fileRef as React.RefObject<HTMLInputElement>} />;
  }

  const hasCarteiras = carteiraStats.length > 0;
  const selectedCarteira = carteiraFilter !== "__all__" ? carteiraStats.find((c) => c.nome === carteiraFilter) : null;

  // ── scoped KPIs ──
  const totalTarefas = scopedRows.length;
  const finalizadas = scopedRows.filter((r) => r.status === "Finalizado").length;
  const canceladas = scopedRows.filter((r) => r.status === "Cancelado").length;
  const totalAtendidos = scopedRows.reduce((a, r) => a + r.chapasAtendidos, 0);
  const totalSolicit = scopedRows.reduce((a, r) => a + r.chapasSolicitados, 0);
  const overallFill = totalSolicit > 0 ? Math.round((totalAtendidos / totalSolicit) * 100) : 0;
  const valorGeral = scopedRows.reduce((a, r) => a + r.valorTarefa, 0);
  const scopedCompanies = carteiraFilter !== "__all__"
    ? companies.filter((c) => c.carteiras.includes(carteiraFilter)) : companies;
  const abaixo80 = scopedCompanies.filter((c) => c.fillRate < 80 && c.chapasSolicitados > 0).length;

  // ── chart data for carteira comparison ──
  const carteiraChartData = carteiraStats.map((c) => ({ name: c.nome, fill: c.fillRate }));

  return (
    <TooltipProvider>
      <div className="px-4 md:px-6 py-6 pb-10 space-y-5 max-w-[1400px] mx-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-xl text-foreground">Fill Rate — Análise por Carteira</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalTarefas.toLocaleString("pt-BR")} tarefas · {scopedCompanies.length} clientes
              {(() => { const p = periodLabel(rows); return p ? ` · ${p}` : ""; })()}
              {" · "}atualizado {timeAgo(uploadedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Atualizar CSV
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10" onClick={clearData}>
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { if (e.target.files?.[0]) processFile(e.target.files[0]); }} />
          </div>
        </div>

        {/* ── Carteira pills — sempre visíveis ── */}
        {hasCarteiras && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">Carteira:</span>
            <button
              onClick={() => setCarteiraFilter("__all__")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                carteiraFilter === "__all__"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground bg-card"
              }`}
            >
              Todas
              <span className={`text-[10px] ${carteiraFilter === "__all__" ? "opacity-80" : "text-muted-foreground"}`}>
                {companies.length}
              </span>
            </button>
            {carteiraStats.map((c) => (
              <button
                key={c.nome}
                onClick={() => setCarteiraFilter(c.nome)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  carteiraFilter === c.nome
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground bg-card"
                }`}
              >
                {c.nome}
                <span className={`text-[11px] font-bold ${carteiraFilter === c.nome ? "opacity-90" : fillTextClass(c.fillRate)}`}>
                  {c.fillRate}%
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── KPIs — sempre contextuais à carteira selecionada ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label={selectedCarteira ? `Fill rate · ${selectedCarteira.nome}` : "Fill rate geral"}
            value={`${overallFill}%`}
            sub={`${totalAtendidos.toLocaleString("pt-BR")} / ${totalSolicit.toLocaleString("pt-BR")} chapas`}
            tone={overallFill >= 80 ? "text-success" : overallFill >= 60 ? "text-warning" : "text-destructive"}
            icon={BarChart2}
          />
          <StatCard
            label="Tarefas finalizadas"
            value={finalizadas.toLocaleString("pt-BR")}
            sub={`${canceladas.toLocaleString("pt-BR")} canceladas (${totalTarefas > 0 ? Math.round(canceladas / totalTarefas * 100) : 0}%)`}
          />
          <StatCard
            label="Clientes abaixo de 80%"
            value={abaixo80}
            sub={`de ${scopedCompanies.length} clientes`}
            tone={abaixo80 > 0 ? "text-destructive" : "text-success"}
            icon={TrendingDown}
          />
          <StatCard
            label="Faturamento"
            value={brl(valorGeral)}
            sub={`${scopedCompanies.length} cliente${scopedCompanies.length !== 1 ? "s" : ""}`}
            icon={DollarSign}
          />
        </div>

        {/* ── Análise por carteira — só quando "Todas" e há múltiplas carteiras ── */}
        {carteiraFilter === "__all__" && carteiraStats.length > 1 && (
          <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">Comparativo por Carteira</span>
                <span className="text-xs text-muted-foreground">— clique para filtrar</span>
              </div>
            </div>
            {/* Gráfico de barras fill rate por carteira */}
            <div className="px-4 pt-4 pb-2">
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={carteiraChartData} margin={{ top: 0, right: 8, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} className="fill-muted-foreground" />
                  <Tooltip formatter={(v: number) => [`${v}%`, "Fill rate"]} contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="fill" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d) => setCarteiraFilter(d.name)}>
                    {carteiraChartData.map((entry) => (
                      <Cell key={entry.name} fill={fillColor(entry.fill)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Tabela de carteiras */}
            <div className="border-t border-border">
              {/* Header */}
              <div
                className="grid gap-3 px-4 py-2 bg-muted/30 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                style={{ gridTemplateColumns: "minmax(140px,1fr) 50px 50px 50px 90px 120px 110px 20px" }}
              >
                <span>Carteira</span>
                <span className="text-center">🟢·🟡·🔴</span>
                <span className="text-center">↓80%</span>
                <span className="text-center">Cancel.</span>
                <span className="text-center">Chapas</span>
                <span>Fill Rate</span>
                <span className="text-right">Valor</span>
                <span />
              </div>
              {carteiraStats.map((c) => (
                <CarteiraRow
                  key={c.nome}
                  stat={c}
                  active={false}
                  onClick={() => setCarteiraFilter(c.nome)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Painel de distribuição — quando uma carteira específica está selecionada ── */}
        {selectedCarteira && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-success/5 border border-success/20 rounded-xl p-4 flex items-center gap-3">
              <Target className="h-5 w-5 text-success shrink-0" />
              <div>
                <p className="text-2xl font-display font-bold text-success">{selectedCarteira.distribuicao.verde}</p>
                <p className="text-xs text-muted-foreground">clientes ≥ 80% <span className="text-success font-semibold">· meta atingida</span></p>
              </div>
            </div>
            <div className="bg-warning/5 border border-warning/20 rounded-xl p-4 flex items-center gap-3">
              <TrendingDown className="h-5 w-5 text-warning shrink-0" />
              <div>
                <p className="text-2xl font-display font-bold text-warning">{selectedCarteira.distribuicao.amarelo}</p>
                <p className="text-xs text-muted-foreground">clientes 60–79% <span className="text-warning font-semibold">· atenção</span></p>
              </div>
            </div>
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="text-2xl font-display font-bold text-destructive">{selectedCarteira.distribuicao.vermelho}</p>
                <p className="text-xs text-muted-foreground">clientes &lt; 60% <span className="text-destructive font-semibold">· crítico</span></p>
              </div>
            </div>
          </div>
        )}

        {/* ── Filtros da tabela de clientes ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente…" className="pl-9 h-9" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
          </div>
          {grupos.length > 2 && (
            <Select value={grupoFilter} onValueChange={setGrupoFilter}>
              <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os grupos</SelectItem>
                {grupos.slice(1).map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {ufs.length > 2 && (
            <Select value={ufFilter} onValueChange={setUfFilter}>
              <SelectTrigger className="h-9 w-[100px] text-xs"><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os UF</SelectItem>
                {ufs.slice(1).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} de {scopedCompanies.length} cliente{scopedCompanies.length !== 1 ? "s" : ""}
            {carteiraFilter !== "__all__" && <span className="ml-1 text-primary font-semibold">· {carteiraFilter}</span>}
          </span>
        </div>

        {/* ── Tabela de clientes ── */}
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          <div
            className="grid gap-2 px-4 py-2.5 bg-muted/30 border-b border-border text-[11px] uppercase tracking-wider font-semibold text-muted-foreground"
            style={{ gridTemplateColumns: "minmax(180px,1fr) 90px 80px 80px 80px 110px 90px 24px" }}
          >
            <SortBtn label="Cliente" sortKey="nome" current={sortKey} dir={sortDir} onToggle={toggleSort} />
            <SortBtn label="Finaliz." sortKey="finalizadas" current={sortKey} dir={sortDir} onToggle={toggleSort} />
            <span>Cancel.</span>
            <SortBtn label="Chapas" sortKey="chapasAtendidos" current={sortKey} dir={sortDir} onToggle={toggleSort} />
            <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />Cid.</span>
            <SortBtn label="Fill Rate" sortKey="fillRate" current={sortKey} dir={sortDir} onToggle={toggleSort} />
            <SortBtn label="Valor" sortKey="valorTotal" current={sortKey} dir={sortDir} onToggle={toggleSort} />
            <span />
          </div>
          <div>
            {sorted.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado para os filtros aplicados.
              </div>
            ) : (
              sorted.map((s) => (
                <CompanyRow key={s.nome} s={s} expanded={expandedRows.has(s.nome)} onToggle={() => toggleExpand(s.nome)} />
              ))
            )}
          </div>
          {sorted.length > 0 && (
            <div
              className="grid gap-2 px-4 py-2.5 bg-muted/40 border-t border-border text-xs font-semibold text-muted-foreground"
              style={{ gridTemplateColumns: "minmax(180px,1fr) 90px 80px 80px 80px 110px 90px 24px" }}
            >
              <span>{sorted.length} clientes</span>
              <span className="tabular-nums text-foreground">{sorted.reduce((a, s) => a + s.finalizadas, 0)}</span>
              <span className="tabular-nums text-warning">{sorted.reduce((a, s) => a + s.canceladas, 0)}</span>
              <span className="tabular-nums text-foreground">
                {sorted.reduce((a, s) => a + s.chapasAtendidos, 0)}/{sorted.reduce((a, s) => a + s.chapasSolicitados, 0)}
              </span>
              <span />
              <FillBar value={(() => {
                const at = sorted.reduce((a, s) => a + s.chapasAtendidos, 0);
                const sol = sorted.reduce((a, s) => a + s.chapasSolicitados, 0);
                return sol > 0 ? Math.round((at / sol) * 100) : 0;
              })()} />
              <span className="tabular-nums text-foreground">{brl(sorted.reduce((a, s) => a + s.valorTotal, 0))}</span>
              <span />
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
