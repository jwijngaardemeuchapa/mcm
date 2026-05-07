import { useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Upload, Copy, Search, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

type Row = Record<string, string>;

const NAME_KEYS = [
  "nome do chapa",
  "nome_chapa",
  "nome",
  "ajudante",
  "chapa",
  "name",
];

function findNameKey(row: Row): string | null {
  const keys = Object.keys(row);
  for (const want of NAME_KEYS) {
    const found = keys.find((k) => k.toLowerCase().trim() === want);
    if (found) return found;
  }
  // fallback: first column with mostly text
  return keys[0] ?? null;
}

function normalizeName(s: string): string {
  return (s || "").trim().replace(/\s+/g, " ");
}

export default function ContadorTarefas() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [nameKey, setNameKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function handleFile(file: File) {
    setFilename(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (!Array.isArray(parsed)) {
            toast.error("JSON precisa ser uma lista");
            return;
          }
          const norm: Row[] = parsed.map((r: Record<string, unknown>) => {
            const o: Row = {};
            Object.keys(r).forEach((k) => (o[k] = r[k] == null ? "" : String(r[k])));
            return o;
          });
          ingest(norm);
        } catch (e) {
          toast.error("JSON inválido: " + (e as Error).message);
        }
      };
      reader.readAsText(file);
      return;
    }
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = () => {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false });
        ingest(json.map((r) => {
          const o: Row = {};
          Object.keys(r).forEach((k) => (o[k] = r[k] == null ? "" : String(r[k])));
          return o;
        }));
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => ingest(r.data as Row[]),
    });
  }

  function ingest(parsed: Row[]) {
    if (!parsed.length) {
      toast.error("Arquivo vazio");
      return;
    }
    const k = findNameKey(parsed[0]);
    setNameKey(k);
    setRows(parsed);
    toast.success(`${parsed.length} linhas carregadas — coluna usada: ${k}`);
  }

  const counts = useMemo(() => {
    if (!rows.length || !nameKey) return [] as Array<{ nome: string; total: number }>;
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const raw = normalizeName(r[nameKey] ?? "");
      if (!raw) return;
      const key = raw.toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    // preserve display name (Title-ish)
    const display = new Map<string, string>();
    rows.forEach((r) => {
      const raw = normalizeName(r[nameKey] ?? "");
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!display.has(key)) display.set(key, raw);
    });
    return Array.from(map.entries())
      .map(([k, v]) => ({ nome: display.get(k) ?? k, total: v }))
      .sort((a, b) => b.total - a.total);
  }, [rows, nameKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return counts;
    return counts.filter((c) => c.nome.toLowerCase().includes(q));
  }, [counts, search]);

  const totalTarefas = rows.length;
  const ajudantesUnicos = counts.length;
  const top = counts[0];

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  }

  function copyAllNames() {
    copyText(filtered.map((c) => c.nome).join("\n"), `${filtered.length} nome(s)`);
  }

  function copyRanking() {
    const text = filtered.map((c, i) => `${i + 1}. ${c.nome} — ${c.total}`).join("\n");
    copyText(text, "Ranking");
  }

  // Take top 20 for chart
  const chartData = filtered.slice(0, 20);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="font-display font-bold text-2xl">Contador de Tarefas</h1>
        <p className="text-sm text-muted-foreground">
          Anexe um CSV, JSON ou XLSX para contar quantas tarefas cada ajudante fez no período.
        </p>
      </div>

      <label className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary-soft transition-colors bg-card">
        <input
          type="file"
          accept=".csv,.json,.xlsx,.xls,application/json,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Upload className="h-10 w-10 mx-auto text-primary mb-2" />
        <div className="font-semibold">Clique ou arraste CSV / JSON / XLSX</div>
        <div className="text-xs text-muted-foreground mt-1">
          {filename ? `Arquivo: ${filename}` : "A coluna do nome é detectada automaticamente"}
        </div>
      </label>

      {counts.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-muted-foreground tracking-wider">
                  Total de linhas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <button
                  onClick={() => copyText(String(totalTarefas), "Total")}
                  className="text-3xl font-display font-bold text-primary hover:underline cursor-pointer"
                  title="Clique para copiar"
                >
                  {totalTarefas}
                </button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Ajudantes únicos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <button
                  onClick={() => copyText(String(ajudantesUnicos), "Ajudantes únicos")}
                  className="text-3xl font-display font-bold text-foreground hover:underline cursor-pointer"
                  title="Clique para copiar"
                >
                  {ajudantesUnicos}
                </button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-warning" /> Top 1
                </CardTitle>
              </CardHeader>
              <CardContent>
                <button
                  onClick={() => top && copyText(`${top.nome} — ${top.total}`, top.nome)}
                  className="text-left hover:underline cursor-pointer"
                  title="Clique para copiar"
                >
                  <div className="text-base font-semibold capitalize truncate">
                    {top?.nome.toLowerCase()}
                  </div>
                  <div className="text-2xl font-display font-bold text-primary">
                    {top?.total} tarefas
                  </div>
                </button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top {chartData.length} ajudantes</CardTitle>
            </CardHeader>
            <CardContent className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" allowDecimals={false} className="text-xs" />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={180}
                    tick={{ fontSize: 11 }}
                    interval={0}
                  />
                  <RTooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                    {chartData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={
                          i === 0
                            ? "hsl(var(--primary))"
                            : i < 3
                            ? "hsl(var(--primary) / 0.75)"
                            : "hsl(var(--primary) / 0.5)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">Ranking completo ({filtered.length})</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar nome..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 pl-7 w-[220px]"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={copyAllNames} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copiar nomes
                </Button>
                <Button size="sm" variant="outline" onClick={copyRanking} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copiar ranking
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-[500px] rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold w-12">#</th>
                      <th className="text-left px-3 py-2 font-semibold">Ajudante</th>
                      <th className="text-right px-3 py-2 font-semibold w-32">Tarefas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => (
                      <tr key={c.nome} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => copyText(c.nome, c.nome)}
                            className="capitalize hover:text-primary hover:underline text-left"
                            title="Clique para copiar o nome"
                          >
                            {c.nome.toLowerCase()}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => copyText(String(c.total), `${c.total}`)}
                            className="font-mono font-semibold text-primary hover:underline tabular-nums"
                            title="Clique para copiar o número"
                          >
                            {c.total}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
