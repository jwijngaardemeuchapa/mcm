import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  ComposedChart,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  Inbox,
  BarChart3,
  Clock,
  Target,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { todayDateISO_SP } from "@/lib/datetime";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ---- Types ----
type FillDay = { date: string; fill: number; tasks: number };
type HourDay = { hour: number; day: number; count: number };
type CompanyFill = { empresa: string; fill: number; total: number };
type AvgTime = { avg_minutes: number | null };

type MonthStat = {
  month: string;   // "YYYY-MM"
  label: string;   // "Mai/25"
  fill: number;
  tasks: number;
  cancelados: number;
  total_chapas: number;
  validados: number;
};

type CompanyMonthRow = {
  empresa: string;
  month: string;
  fill: number;
  tasks: number;
};

type Insight = {
  type: "success" | "warning" | "info" | "danger";
  title: string;
  desc: string;
};

// ---- Constants ----
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const META_FILL = 80;

// ---- Helpers ----
function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1]}/${y.slice(2)}`;
}

function fillColor(fill: number): string {
  return fill >= META_FILL
    ? "hsl(var(--success))"
    : fill >= 50
    ? "hsl(var(--warning))"
    : "hsl(var(--destructive))";
}

function fillBg(fill: number): string {
  return fill >= META_FILL
    ? "hsl(var(--success) / 0.15)"
    : fill >= 50
    ? "hsl(var(--warning) / 0.15)"
    : "hsl(var(--destructive) / 0.15)";
}

// ---- Insights engine ----
function computeInsights(months: MonthStat[], companyRows: CompanyMonthRow[]): Insight[] {
  const insights: Insight[] = [];
  if (months.length === 0) return insights;

  const sorted = [...months].sort((a, b) => b.month.localeCompare(a.month));
  const curr = sorted[0];
  const prev = sorted[1];

  // Meta vs current month
  if (curr.fill > 0) {
    if (curr.fill >= META_FILL) {
      insights.push({
        type: "success",
        title: `Meta de ${META_FILL}% atingida em ${curr.label}`,
        desc: `Fill rate de ${curr.fill}% — ${curr.fill - META_FILL}pp acima da meta`,
      });
    } else {
      const gap = META_FILL - curr.fill;
      insights.push({
        type: curr.fill < 50 ? "danger" : "warning",
        title: `${gap}pp abaixo da meta em ${curr.label}`,
        desc: `Fill rate de ${curr.fill}% vs meta de ${META_FILL}% — ${gap} pontos a recuperar`,
      });
    }
  }

  if (prev) {
    const fillDelta = curr.fill - prev.fill;
    if (Math.abs(fillDelta) >= 3) {
      insights.push({
        type: fillDelta > 0 ? "success" : "warning",
        title: fillDelta > 0
          ? `Fill rate subiu ${fillDelta}pp mês a mês`
          : `Fill rate caiu ${Math.abs(fillDelta)}pp mês a mês`,
        desc: `${prev.label}: ${prev.fill}%  →  ${curr.label}: ${curr.fill}%`,
      });
    }
    if (prev.tasks > 0) {
      const volPct = Math.round(((curr.tasks - prev.tasks) / prev.tasks) * 100);
      if (Math.abs(volPct) >= 10) {
        insights.push({
          type: volPct > 0 ? "info" : "warning",
          title: volPct > 0
            ? `Volume de tarefas cresceu ${volPct}%`
            : `Volume de tarefas caiu ${Math.abs(volPct)}%`,
          desc: `${curr.tasks} tarefas em ${curr.label} vs ${prev.tasks} em ${prev.label}`,
        });
      }
    }
  }

  // Best / worst month in period
  if (sorted.length >= 3) {
    const best = sorted.reduce((b, m) => m.fill > b.fill ? m : b);
    const worst = sorted.filter(m => m.fill > 0).reduce((w, m) => m.fill < w.fill ? m : w, sorted[0]);
    if (best.month === curr.month) {
      insights.push({
        type: "success",
        title: `Melhor mês registrado no período`,
        desc: `${curr.label} com ${curr.fill}% é o maior fill rate dos últimos ${months.length} meses`,
      });
    }
    if (worst.month === curr.month && curr.fill < 60) {
      insights.push({
        type: "danger",
        title: `Pior mês registrado no período`,
        desc: `${curr.fill}% em ${curr.label} é o menor dos últimos ${months.length} meses — atenção redobrada`,
      });
    }
  }

  // Company analysis
  const byEmpresa = new Map<string, CompanyMonthRow[]>();
  companyRows.forEach((r) => {
    if (!byEmpresa.has(r.empresa)) byEmpresa.set(r.empresa, []);
    byEmpresa.get(r.empresa)!.push(r);
  });

  // Recurrent underperformers (< 50% por 2+ meses)
  const underperformers: string[] = [];
  byEmpresa.forEach((rows, empresa) => {
    const recent = [...rows]
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 3);
    if (recent.filter((r) => r.fill < 50 && r.tasks >= 2).length >= 2) {
      underperformers.push(empresa);
    }
  });
  if (underperformers.length > 0) {
    insights.push({
      type: "danger",
      title: `${underperformers.length} empresa(s) com fill rate crítico recorrente`,
      desc: underperformers.slice(0, 3).join(", ") +
        (underperformers.length > 3 ? ` e mais ${underperformers.length - 3}` : "") +
        " — abaixo de 50% por 2+ meses consecutivos",
    });
  }

  // Most improved company
  const improvements: { empresa: string; delta: number; from: number; to: number }[] = [];
  byEmpresa.forEach((rows, empresa) => {
    const s = [...rows].sort((a, b) => b.month.localeCompare(a.month));
    if (s.length >= 2 && s[0].tasks >= 2 && s[1].tasks >= 2) {
      const delta = s[0].fill - s[1].fill;
      if (delta >= 10) improvements.push({ empresa, delta, from: s[1].fill, to: s[0].fill });
    }
  });
  if (improvements.length > 0) {
    const top = improvements.sort((a, b) => b.delta - a.delta)[0];
    insights.push({
      type: "success",
      title: `${top.empresa} melhorou ${top.delta}pp`,
      desc: `De ${top.from}% para ${top.to}% — maior evolução de fill rate no período`,
    });
  }

  // Most worsened company
  const worsenings: { empresa: string; delta: number; from: number; to: number }[] = [];
  byEmpresa.forEach((rows, empresa) => {
    const s = [...rows].sort((a, b) => b.month.localeCompare(a.month));
    if (s.length >= 2 && s[0].tasks >= 2 && s[1].tasks >= 2) {
      const delta = s[0].fill - s[1].fill;
      if (delta <= -10) worsenings.push({ empresa, delta, from: s[1].fill, to: s[0].fill });
    }
  });
  if (worsenings.length > 0) {
    const top = worsenings.sort((a, b) => a.delta - b.delta)[0];
    insights.push({
      type: "warning",
      title: `${top.empresa} piorou ${Math.abs(top.delta)}pp`,
      desc: `De ${top.from}% para ${top.to}% — maior queda de fill rate no período`,
    });
  }

  return insights;
}

// ---- Sub-components ----
function KpiCard({
  label, value, delta, deltaUnit, loading, color, muted,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaUnit?: string;
  loading: boolean;
  color?: string;
  muted?: boolean;
}) {
  return (
    <Card className={muted ? "opacity-60" : ""}>
      <CardContent className="pt-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold opacity-70 leading-tight">
          {label}
        </p>
        {loading ? (
          <Skeleton className="h-8 w-16 mt-1" />
        ) : (
          <div className="flex items-end gap-2 mt-1">
            <p
              className="text-3xl font-display font-bold"
              style={color ? { color } : {}}
            >
              {value}
            </p>
            {delta !== null && delta !== undefined && (
              <span
                className={`text-xs font-semibold mb-1 flex items-center gap-0.5 ${
                  delta > 0
                    ? "text-success"
                    : delta < 0
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {delta > 0 ? (
                  <ArrowUp className="h-3 w-3" />
                ) : delta < 0 ? (
                  <ArrowDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {delta > 0 ? "+" : ""}
                {delta}
                {deltaUnit}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />,
    info: <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />,
    danger: <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />,
  };
  const bg = {
    success: "bg-success/5 border-success/20",
    warning: "bg-warning/5 border-warning/20",
    info: "bg-primary/5 border-primary/20",
    danger: "bg-destructive/5 border-destructive/20",
  };
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${bg[insight.type]}`}>
      {icons[insight.type]}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">
          {insight.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{insight.desc}</p>
      </div>
    </div>
  );
}

// ---- Main component ----
export default function Tendencias() {
  // 30-day state
  const [loading, setLoading] = useState(true);
  const [fillTrend, setFillTrend] = useState<FillDay[]>([]);
  const [heatmap, setHeatmap] = useState<HourDay[]>([]);
  const [worstCompanies, setWorstCompanies] = useState<CompanyFill[]>([]);
  const [avgMinutes, setAvgMinutes] = useState<number | null>(null);

  // Monthly state
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [monthlyStats, setMonthlyStats] = useState<MonthStat[]>([]);
  const [companyMonthRows, setCompanyMonthRows] = useState<CompanyMonthRow[]>([]);

  // Load 30-day data
  useEffect(() => {
    async function load() {
      try {
        const db = await getDb();
        const today = todayDateISO_SP();
        const start30 = new Date(`${today}T12:00:00-03:00`);
        start30.setDate(start30.getDate() - 29);
        const startISO = start30.toISOString().slice(0, 10);

        const trend = await db.select<
          { date: string; total: number; validados: number; tasks: number }[]
        >(
          `SELECT date(t.data_tarefa) as date,
                  SUM(t.quantidade_chapas) as total,
                  SUM(CASE WHEN c.validacao_presenca = 'presente' THEN 1 ELSE 0 END) as validados,
                  COUNT(DISTINCT t.id_tarefa) as tasks
           FROM tarefas t
           LEFT JOIN chapas c ON c.id_tarefa = t.id_tarefa
           WHERE t.ativo = 1 AND date(t.data_tarefa) BETWEEN ? AND ?
             AND t.status_tarefa NOT LIKE 'Cancel%'
           GROUP BY date(t.data_tarefa)
           ORDER BY date(t.data_tarefa)`,
          [startISO, today],
        );
        setFillTrend(
          trend.map((r) => ({
            date: r.date.slice(5),
            fill: r.total > 0 ? Math.round((r.validados / r.total) * 100) : 0,
            tasks: r.tasks,
          })),
        );

        const heat = await db.select<{ hour: number; dow: number; cnt: number }[]>(
          `SELECT CAST(strftime('%H', data_tarefa) AS INTEGER) as hour,
                  CAST(strftime('%w', data_tarefa) AS INTEGER) as dow,
                  COUNT(*) as cnt
           FROM tarefas
           WHERE ativo = 1 AND date(data_tarefa) BETWEEN ? AND ?
             AND status_tarefa NOT LIKE 'Cancel%'
           GROUP BY hour, dow`,
          [startISO, today],
        );
        setHeatmap(heat.map((r) => ({ hour: r.hour, day: r.dow, count: r.cnt })));

        const worst = await db.select<
          { empresa: string; total: number; present: number }[]
        >(
          `SELECT t.empresa,
                  SUM(t.quantidade_chapas) as total,
                  SUM(CASE WHEN c.validacao_presenca = 'presente' THEN 1 ELSE 0 END) as present
           FROM tarefas t
           LEFT JOIN chapas c ON c.id_tarefa = t.id_tarefa
           WHERE t.ativo = 1 AND date(t.data_tarefa) BETWEEN ? AND ?
             AND t.status_tarefa NOT LIKE 'Cancel%'
           GROUP BY t.empresa
           HAVING COUNT(DISTINCT t.id_tarefa) >= 3 AND total > 0
           ORDER BY (CAST(present AS REAL) / total) ASC
           LIMIT 5`,
          [startISO, today],
        );
        setWorstCompanies(
          worst.map((r) => ({
            empresa: r.empresa,
            total: r.total,
            fill: r.total > 0 ? Math.round((r.present / r.total) * 100) : 0,
          })),
        );

        const avgRows = await db.select<AvgTime[]>(
          `SELECT AVG((julianday(c.data_contato) - julianday(f.data_disparo)) * 1440) as avg_minutes
           FROM chapas c
           JOIN fup_log f ON f.id_tarefa = c.id_tarefa
           WHERE c.status_contato = 'confirmado'
             AND c.data_contato IS NOT NULL
             AND f.data_disparo IS NOT NULL
             AND date(f.data_disparo) BETWEEN ? AND ?
             AND (julianday(c.data_contato) - julianday(f.data_disparo)) * 1440 BETWEEN 0 AND 720`,
          [startISO, today],
        );
        setAvgMinutes(avgRows[0]?.avg_minutes ?? null);
      } catch {
        /* noop */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load monthly data (last 6 months)
  useEffect(() => {
    async function loadMonthly() {
      try {
        const db = await getDb();
        const today = todayDateISO_SP();
        const d = new Date(`${today}T12:00:00-03:00`);
        d.setMonth(d.getMonth() - 5);
        d.setDate(1);
        const startISO = d.toISOString().slice(0, 10);

        const rows = await db.select<{
          month: string;
          total: number;
          validados: number;
          tasks: number;
          cancelados: number;
        }[]>(
          `SELECT strftime('%Y-%m', t.data_tarefa) as month,
                  SUM(CASE WHEN t.status_tarefa NOT LIKE 'Cancel%' THEN t.quantidade_chapas ELSE 0 END) as total,
                  SUM(CASE WHEN c.validacao_presenca = 'presente' AND t.status_tarefa NOT LIKE 'Cancel%' THEN 1 ELSE 0 END) as validados,
                  COUNT(DISTINCT CASE WHEN t.status_tarefa NOT LIKE 'Cancel%' THEN t.id_tarefa END) as tasks,
                  COUNT(DISTINCT CASE WHEN t.status_tarefa LIKE 'Cancel%' THEN t.id_tarefa END) as cancelados
           FROM tarefas t
           LEFT JOIN chapas c ON c.id_tarefa = t.id_tarefa
           WHERE t.ativo = 1 AND date(t.data_tarefa) >= ?
           GROUP BY month
           ORDER BY month`,
          [startISO],
        );

        setMonthlyStats(
          rows.map((r) => ({
            month: r.month,
            label: fmtMonth(r.month),
            fill: r.total > 0 ? Math.round((r.validados / r.total) * 100) : 0,
            tasks: r.tasks,
            cancelados: r.cancelados,
            total_chapas: r.total,
            validados: r.validados,
          })),
        );

        const compRows = await db.select<{
          month: string;
          empresa: string;
          total: number;
          validados: number;
          tasks: number;
        }[]>(
          `SELECT strftime('%Y-%m', t.data_tarefa) as month,
                  t.empresa,
                  SUM(t.quantidade_chapas) as total,
                  SUM(CASE WHEN c.validacao_presenca = 'presente' THEN 1 ELSE 0 END) as validados,
                  COUNT(DISTINCT t.id_tarefa) as tasks
           FROM tarefas t
           LEFT JOIN chapas c ON c.id_tarefa = t.id_tarefa
           WHERE t.ativo = 1 AND date(t.data_tarefa) >= ?
             AND t.status_tarefa NOT LIKE 'Cancel%'
             AND t.empresa IS NOT NULL AND t.empresa != ''
           GROUP BY month, t.empresa
           HAVING tasks >= 2
           ORDER BY month, t.empresa`,
          [startISO],
        );

        setCompanyMonthRows(
          compRows.map((r) => ({
            empresa: r.empresa,
            month: r.month,
            fill: r.total > 0 ? Math.round((r.validados / r.total) * 100) : 0,
            tasks: r.tasks,
          })),
        );
      } catch {
        /* noop */
      } finally {
        setMonthlyLoading(false);
      }
    }
    loadMonthly();
  }, []);

  // Heatmap grid
  const heatGrid = useMemo(() => {
    const map = new Map<string, number>();
    heatmap.forEach((h) => map.set(`${h.hour}-${h.day}`, h.count));
    const maxVal = Math.max(...heatmap.map((h) => h.count), 1);
    return { map, maxVal };
  }, [heatmap]);

  const avgFill =
    fillTrend.length > 0
      ? Math.round(fillTrend.reduce((a, b) => a + b.fill, 0) / fillTrend.length)
      : null;

  // Monthly derived
  const sortedMonths = useMemo(
    () => [...monthlyStats].sort((a, b) => a.month.localeCompare(b.month)),
    [monthlyStats],
  );

  const currMonth = sortedMonths[sortedMonths.length - 1];
  const prevMonth = sortedMonths[sortedMonths.length - 2];

  const insights = useMemo(
    () => computeInsights(monthlyStats, companyMonthRows),
    [monthlyStats, companyMonthRows],
  );

  const cancelRate = useMemo(() => {
    const totalAll = sortedMonths.reduce((a, b) => a + b.tasks + b.cancelados, 0);
    const totalCanc = sortedMonths.reduce((a, b) => a + b.cancelados, 0);
    return totalAll > 0 ? Math.round((totalCanc / totalAll) * 100) : 0;
  }, [sortedMonths]);

  // Company evolution table
  const companyEvolution = useMemo(() => {
    const lastMonths = sortedMonths.slice(-4).map((m) => m.month);
    const byEmpresa = new Map<string, Map<string, { fill: number; tasks: number }>>();
    companyMonthRows.forEach((r) => {
      if (!byEmpresa.has(r.empresa)) byEmpresa.set(r.empresa, new Map());
      byEmpresa.get(r.empresa)!.set(r.month, { fill: r.fill, tasks: r.tasks });
    });

    return Array.from(byEmpresa.entries())
      .map(([empresa, monthMap]) => {
        const months = lastMonths.map((m) => ({
          month: m,
          label: fmtMonth(m),
          ...(monthMap.has(m) ? monthMap.get(m)! : { fill: null as null, tasks: 0 }),
        }));
        const vals = months
          .filter((m) => m.fill !== null)
          .map((m) => m.fill as number);
        const trend =
          vals.length >= 2 ? vals[vals.length - 1] - vals[vals.length - 2] : 0;
        const lastFill = months[months.length - 1]?.fill ?? null;
        return { empresa, months, trend, lastFill };
      })
      .filter((e) => e.months.some((m) => m.fill !== null))
      .sort((a, b) => (b.lastFill ?? -1) - (a.lastFill ?? -1));
  }, [sortedMonths, companyMonthRows]);

  const tableHeaderMonths = sortedMonths.slice(-4);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="font-display font-semibold text-2xl">Tendências</h1>
          <p className="text-sm text-muted-foreground">
            Análise de desempenho e evolução operacional
          </p>
        </div>
      </div>

      <Tabs defaultValue="mensal">
        <TabsList>
          <TabsTrigger value="mensal">Análise Mensal</TabsTrigger>
          <TabsTrigger value="30d">Últimos 30 Dias</TabsTrigger>
        </TabsList>

        {/* ======================================================= */}
        {/*  ABA: ANÁLISE MENSAL                                     */}
        {/* ======================================================= */}
        <TabsContent value="mensal" className="space-y-5 mt-4">

          {/* KPI row com deltas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label={`Fill Rate — ${currMonth?.label ?? "—"}`}
              value={currMonth?.fill !== undefined ? `${currMonth.fill}%` : "—"}
              delta={currMonth && prevMonth ? currMonth.fill - prevMonth.fill : null}
              deltaUnit="pp"
              loading={monthlyLoading}
              color={currMonth ? fillColor(currMonth.fill) : undefined}
            />
            <KpiCard
              label={`Tarefas — ${currMonth?.label ?? "—"}`}
              value={currMonth?.tasks !== undefined ? String(currMonth.tasks) : "—"}
              delta={
                currMonth && prevMonth ? currMonth.tasks - prevMonth.tasks : null
              }
              deltaUnit=" tarefas"
              loading={monthlyLoading}
            />
            <KpiCard
              label={`Fill Rate — ${prevMonth?.label ?? "mês anterior"}`}
              value={prevMonth?.fill !== undefined ? `${prevMonth.fill}%` : "—"}
              loading={monthlyLoading}
              color={prevMonth ? fillColor(prevMonth.fill) : undefined}
              muted
            />
            <KpiCard
              label="Cancelamentos (6 meses)"
              value={`${cancelRate}%`}
              loading={monthlyLoading}
            />
          </div>

          {/* Comparativo mensal — gráfico composto */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Comparativo mensal — fill rate e volume
              </CardTitle>
              <CardDescription>
                Barras = volume de tarefas · Linha = fill rate (%) · Linha verde tracejada = meta {META_FILL}%
              </CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyLoading ? (
                <Skeleton className="h-[260px] w-full" />
              ) : sortedMonths.length === 0 ? (
                <div className="h-[180px] flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Inbox className="h-4 w-4" /> Sem dados mensais ainda.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart
                    data={sortedMonths}
                    margin={{ top: 8, right: 40, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12 }}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      label={{
                        value: "Tarefas",
                        angle: -90,
                        position: "insideLeft",
                        offset: 14,
                        style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
                      }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                      className="fill-muted-foreground"
                    />
                    <Tooltip
                      formatter={(v: number, name: string) =>
                        name === "fill"
                          ? [`${v}%`, "Fill rate"]
                          : [v, "Tarefas"]
                      }
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend
                      formatter={(v) =>
                        v === "fill" ? "Fill rate (%)" : "Volume (tarefas)"
                      }
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <ReferenceLine
                      yAxisId="right"
                      y={META_FILL}
                      stroke="hsl(var(--success))"
                      strokeDasharray="5 3"
                      label={{
                        value: `Meta ${META_FILL}%`,
                        position: "right",
                        fontSize: 10,
                        fill: "hsl(var(--success))",
                      }}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="tasks"
                      name="tasks"
                      fill="hsl(var(--primary) / 0.25)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="fill"
                      name="fill"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={{ r: 5, fill: "hsl(var(--primary))" }}
                      activeDot={{ r: 7 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Fill rate por mês + Volume por mês (dois cards lado a lado) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Fill rate por mês
                </CardTitle>
                <CardDescription className="text-xs">
                  Verde ≥ {META_FILL}% · Amarelo ≥ 50% · Vermelho &lt; 50%
                </CardDescription>
              </CardHeader>
              <CardContent>
                {monthlyLoading ? (
                  <Skeleton className="h-[160px] w-full" />
                ) : sortedMonths.length === 0 ? (
                  <div className="h-[80px] flex items-center justify-center text-sm text-muted-foreground">
                    <Inbox className="h-4 w-4 mr-2" /> Sem dados.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                      data={sortedMonths}
                      margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        formatter={(v: number) => [`${v}%`, "Fill rate"]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <ReferenceLine
                        y={META_FILL}
                        stroke="hsl(var(--success))"
                        strokeDasharray="4 2"
                      />
                      <Bar dataKey="fill" radius={[4, 4, 0, 0]}>
                        {sortedMonths.map((m) => (
                          <Cell key={m.month} fill={fillColor(m.fill)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Volume por mês
                </CardTitle>
                <CardDescription className="text-xs">
                  Tarefas criadas vs canceladas
                </CardDescription>
              </CardHeader>
              <CardContent>
                {monthlyLoading ? (
                  <Skeleton className="h-[160px] w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                      data={sortedMonths}
                      margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(v) =>
                          v === "tasks" ? "Ativas" : "Canceladas"
                        }
                      />
                      <Bar
                        dataKey="tasks"
                        name="tasks"
                        stackId="a"
                        fill="hsl(var(--primary) / 0.7)"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="cancelados"
                        name="cancelados"
                        stackId="a"
                        fill="hsl(var(--destructive) / 0.55)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Insights automáticos */}
          {!monthlyLoading && insights.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  Insights automáticos
                </CardTitle>
                <CardDescription>
                  Observações geradas a partir dos dados — problemas, progressos e alertas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {insights.map((ins, i) => (
                    <InsightRow key={i} insight={ins} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Evolução por empresa */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Evolução por empresa
              </CardTitle>
              <CardDescription>
                Fill rate mensal por empresa · mín. 2 tarefas por mês · tendência = variação vs mês anterior
              </CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : companyEvolution.length === 0 ? (
                <div className="h-[80px] flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Inbox className="h-4 w-4" /> Dados insuficientes.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                          Empresa
                        </th>
                        {tableHeaderMonths.map((m) => (
                          <th
                            key={m.month}
                            className="text-center py-2 px-2 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold"
                          >
                            {m.label}
                          </th>
                        ))}
                        <th className="text-center py-2 px-2 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                          Tendência
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {companyEvolution.map((row) => (
                        <tr
                          key={row.empresa}
                          className="border-b border-border/40 hover:bg-muted/30 transition-colors"
                        >
                          <td
                            className="py-2 pr-4 font-medium text-foreground max-w-[160px] truncate"
                            title={row.empresa}
                          >
                            {row.empresa.length > 22
                              ? row.empresa.slice(0, 21) + "…"
                              : row.empresa}
                          </td>
                          {row.months.map((m) => (
                            <td key={m.month} className="py-2 px-2 text-center">
                              {m.fill !== null ? (
                                <span
                                  className="inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums"
                                  style={{
                                    backgroundColor: fillBg(m.fill),
                                    color: fillColor(m.fill),
                                  }}
                                >
                                  {m.fill}%
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                          ))}
                          <td className="py-2 px-2 text-center">
                            {row.trend > 5 ? (
                              <span className="inline-flex items-center gap-0.5 text-success text-xs font-semibold">
                                <ArrowUp className="h-3 w-3" />+{row.trend}pp
                              </span>
                            ) : row.trend < -5 ? (
                              <span className="inline-flex items-center gap-0.5 text-destructive text-xs font-semibold">
                                <ArrowDown className="h-3 w-3" />{row.trend}pp
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
                                <Minus className="h-3 w-3" /> estável
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================================================= */}
        {/*  ABA: ÚLTIMOS 30 DIAS                                    */}
        {/* ======================================================= */}
        <TabsContent value="30d" className="space-y-5 mt-4">

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold opacity-60">
                  Fill rate médio (30d)
                </p>
                {loading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p
                    className="text-3xl font-display font-bold mt-1"
                    style={avgFill !== null ? { color: fillColor(avgFill) } : {}}
                  >
                    {avgFill !== null ? `${avgFill}%` : "—"}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold opacity-60">
                  Total de tarefas (30d)
                </p>
                {loading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-3xl font-display font-bold mt-1 text-foreground">
                    {fillTrend.reduce((a, b) => a + b.tasks, 0)}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold opacity-60">
                  Tempo médio FUP→confirmação
                </p>
                {loading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-3xl font-display font-bold mt-1 text-foreground">
                    {avgMinutes !== null
                      ? avgMinutes < 60
                        ? `${Math.round(avgMinutes)}min`
                        : `${(avgMinutes / 60).toFixed(1)}h`
                      : "—"}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Fill rate trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Fill rate diário — últimos 30 dias
              </CardTitle>
              <CardDescription>
                % de chapas com presença validada pelo cliente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[220px] w-full" />
              ) : fillTrend.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Inbox className="h-4 w-4" /> Sem dados de validação no período.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={fillTrend}
                    margin={{ top: 4, right: 12, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground fill-muted-foreground"
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground fill-muted-foreground"
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(v: number) => [`${v}%`, "Fill rate"]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <ReferenceLine
                      y={META_FILL}
                      stroke="hsl(var(--success))"
                      strokeDasharray="4 2"
                    />
                    <Line
                      type="monotone"
                      dataKey="fill"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Mapa de calor — horário × dia da semana
              </CardTitle>
              <CardDescription>
                Concentração de tarefas por hora e dia (últimos 30 dias)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : heatmap.length === 0 ? (
                <div className="h-[140px] flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Inbox className="h-4 w-4" /> Sem dados no período.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[560px]">
                    <div className="flex mb-1 pl-10">
                      {DAYS.map((d) => (
                        <div
                          key={d}
                          className="flex-1 text-center text-[11px] text-muted-foreground font-medium"
                        >
                          {d}
                        </div>
                      ))}
                    </div>
                    {HOURS.filter((h) => h >= 5 && h <= 22).map((hour) => (
                      <div key={hour} className="flex items-center gap-0.5 mb-0.5">
                        <span className="w-9 text-[10px] text-muted-foreground text-right pr-1.5 tabular-nums shrink-0">
                          {String(hour).padStart(2, "0")}h
                        </span>
                        {DAYS.map((_, day) => {
                          const count = heatGrid.map.get(`${hour}-${day}`) ?? 0;
                          const intensity = count / heatGrid.maxVal;
                          return (
                            <div
                              key={day}
                              className="flex-1 h-6 rounded-sm transition-colors"
                              style={{
                                backgroundColor:
                                  count === 0
                                    ? "hsl(var(--muted))"
                                    : `hsl(var(--primary) / ${0.15 + intensity * 0.85})`,
                              }}
                              title={`${DAYS[day]} ${String(hour).padStart(2, "0")}h: ${count} tarefa(s)`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Worst companies */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Top 5 piores fill rates — últimos 30 dias
              </CardTitle>
              <CardDescription>
                Empresas com menor percentual de presença validada (mín. 3 tarefas)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[180px] w-full" />
              ) : worstCompanies.length === 0 ? (
                <div className="h-[100px] flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Inbox className="h-4 w-4" /> Dados insuficientes.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={worstCompanies}
                    layout="vertical"
                    margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      className="stroke-border"
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      dataKey="empresa"
                      type="category"
                      tick={{ fontSize: 11 }}
                      width={110}
                      className="fill-muted-foreground"
                      tickFormatter={(v: string) =>
                        v.length > 16 ? v.slice(0, 15) + "…" : v
                      }
                    />
                    <Tooltip
                      formatter={(v: number) => [`${v}%`, "Fill rate"]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="fill" radius={[0, 4, 4, 0]}>
                      {worstCompanies.map((c) => (
                        <Cell key={c.empresa} fill={fillColor(c.fill)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
