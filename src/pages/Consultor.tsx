import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Upload, Search, X, Trash2, Send, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { F, norm, type WorkerRow, type FilterResult } from "@/utils/consultorFields";
import { fmtDate, parseDate, parseNLDate } from "@/utils/consultorDate";
import { MODES } from "@/utils/consultorRouter";

type DescEntry = { descricao: string; remessa: string };

function classifyIndicado(remessa: string): "confirmado" | "possivel" | null {
  const t = remessa.trim().toUpperCase();
  if (!t) return null;
  if (t === "INDICADO") return "confirmado";
  if (t.includes("INDICADO")) return "possivel";
  return null;
}

function highlightText(text: string, term: string) {
  if (!term.trim()) return text;
  const n = norm(text);
  const t = norm(term);
  const idx = n.indexOf(t);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-warning/40 text-foreground rounded-sm px-0.5">{text.slice(idx, idx + term.length)}</mark>
      {text.slice(idx + term.length)}
    </>
  );
}

function statusTarefaCls(s: string) {
  const n = norm(s);
  if (n.includes("finaliz")) return "bg-success/15 text-success border-success/30";
  if (n === "aberto" || n.includes("aguardando inicio")) return "bg-warning/15 text-warning border-warning/30";
  if (n.includes("aguardando")) return "bg-info/15 text-info border-info/30";
  if (n.includes("cancel")) return "bg-destructive/15 text-destructive border-destructive/30";
  if (n.includes("andamento")) return "bg-teal-500/15 text-teal-500 border-teal-500/30";
  return "bg-muted text-muted-foreground border-border";
}
function statusContatoCls(s: string) {
  const n = norm(s);
  if (n === "confirmado") return "bg-success/15 text-success border-success/30";
  if (n === "removido") return "bg-destructive/15 text-destructive border-destructive/30";
  if (n.includes("respondeu")) return "bg-warning/15 text-warning border-warning/30";
  return "bg-muted text-muted-foreground border-border";
}
function validacaoCls(s: string) {
  const n = norm(s);
  if (n === "presente") return "bg-success/15 text-success border-success/30";
  if (n === "ausente") return "bg-destructive/15 text-destructive border-destructive/30";
  return "bg-muted text-muted-foreground border-border";
}

async function askAI(query: string, allData: WorkerRow[]) {
  const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let context = allData;

  const nameMatch = q.match(/([a-z]{3,}(?:\s+[a-z]{3,})+)/);
  if (nameMatch) {
    const parts = nameMatch[1].split(" ").filter((p) => p.length >= 3);
    const byName = allData.filter((r) => parts.every((p) => norm(F.nome(r)).includes(p)));
    if (byName.length > 0) context = byName;
  }
  const tidMatch = q.match(/\b(\d{4,7})\b/);
  if (tidMatch) {
    const byId = allData.filter((r) => String(F.id(r)).trim() === tidMatch[1]);
    if (byId.length > 0) context = byId;
  }
  const dateRange = parseNLDate(q);
  if (dateRange && context === allData) {
    context = allData.filter((r) => {
      const d = parseDate(F.data(r));
      return d && d >= dateRange.start && d <= dateRange.end;
    });
  }

  const sample = context.slice(0, 80);
  const csvLines = sample
    .map(
      (r) =>
        `${F.id(r)}|${F.nome(r)}|${F.empresa(r)}|${fmtDate(F.data(r))}|${F.status(r)}|${F.contato(r) || "—"}|${F.valid(r) || "—"}`,
    )
    .join("\n");

  const apiKey = import.meta.env.VITE_OPENROUTER_KEY || "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";
  const model = import.meta.env.VITE_AI_MODEL || "google/gemma-3-27b-it:free";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "MCM",
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente de consulta de registros logísticos. Responda em português, seja direto (máximo 4 frases). Status da Tarefa: Aberto=sem ajudante; Aguardando Início=chapas em confirmação; Finalizado=encerrado. Status Contato: confirmado=vai comparecer; não respondeu=sem resposta; removido=excluído. Validação Presença: presente=validado pelo cliente; ausente=não compareceu; pendente=não processado. Formato: ID|Nome|Empresa|Data|StatusTarefa|StatusContato|Validação",
        },
        {
          role: "user",
          content: `Dados (${sample.length} de ${context.length} registros):\n${csvLines}\n\nConsulta: ${query}`,
        },
      ],
    }),
  });

  const data = await response.json();
  return {
    answer: data.choices?.[0]?.message?.content || "Sem resposta.",
    tokens: data.usage?.total_tokens || 0,
  };
}

export default function Consultor() {
  const [data, setData] = useState<WorkerRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<FilterResult | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("__all__");
  const [filterEmpresa, setFilterEmpresa] = useState<string>("__all__");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortAsc, setSortAsc] = useState(true);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const [aiQuery, setAiQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [tokens, setTokens] = useState(0);

  const [descTerm, setDescTerm] = useState("");
  const [descSearchTerm, setDescSearchTerm] = useState("");

  function handleFile(file: File) {
    setLoading(true);
    setProgress(0);
    const isJson = file.name.toLowerCase().endsWith(".json");
    if (isJson) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          const arr = Array.isArray(parsed) ? parsed : parsed.data || [];
          setData(arr as WorkerRow[]);
          setProgress(100);
          toast.success(`${arr.length} registros carregados`);
        } catch (e) {
          toast.error("JSON inválido");
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
      return;
    }
    const rows: WorkerRow[] = [];
    Papa.parse<WorkerRow>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      step: (res, parser) => {
        rows.push(res.data);
        const cursor = (res.meta as { cursor?: number }).cursor ?? 0;
        const pct = Math.min(99, Math.round((cursor / file.size) * 100));
        setProgress(pct);
      },
      complete: () => {
        setData(rows);
        setProgress(100);
        setLoading(false);
        toast.success(`${rows.length} registros carregados`);
      },
      error: (err) => {
        toast.error(err.message);
        setLoading(false);
      },
    });
  }

  function normId(v: unknown): string {
    return String(v ?? "").replace(/\D/g, "");
  }

  function clearSession() {
    setData([]);
    setResult(null);
    setValues({});
    setAiQuery("");
    setAiAnswer("");
    setTokens(0);
    setProgress(0);
    setDescTerm("");
    setDescSearchTerm("");
  }

  const dataById = useMemo(() => {
    const map = new Map<string, WorkerRow>();
    for (const r of data) {
      const id = normId(F.id(r));
      if (id) map.set(id, r);
    }
    return map;
  }, [data]);

  // Descrição/remessa (Obs/Shipping) lidas do MESMO CSV principal, sem exigir
  // um segundo anexo — a Question do Metabase que gera o CSV pode incluir
  // essas colunas junto das demais.
  const descMap = useMemo(() => {
    const map = new Map<string, DescEntry>();
    for (const r of data) {
      const id = normId(F.id(r));
      const descricao = F.descricao(r);
      const remessa = F.remessa(r);
      if (id && (descricao || remessa)) map.set(id, { descricao, remessa });
    }
    return map;
  }, [data]);

  // Quick lists
  const quickRemoved = useMemo(
    () => data.filter((r) => norm(F.contato(r)) === "removido"),
    [data],
  );
  const quickNoResp = useMemo(
    () => data.filter((r) => norm(F.contato(r)).includes("respondeu")),
    [data],
  );

  function runMode(modeKey: string) {
    const mode = MODES[modeKey];
    if (!mode) return;
    const out = mode.run(values, data);
    setResult(out);
    setPage(1);
    if (out.data.length === 0 && out.zeroMsg) toast.info(out.zeroMsg);
  }

  function runQuick(label: string, rows: WorkerRow[]) {
    setResult({ data: rows, label });
    setPage(1);
  }

  function runDescSearch(term: string) {
    const raw = term.trim();
    if (!raw) {
      toast.info("Digite um telefone ou nome para buscar nas descrições.");
      return;
    }
    if (descMap.size === 0) {
      toast.info("O CSV carregado não tem colunas de descrição/remessa (Obs/Shipping).");
      return;
    }
    const digits = raw.replace(/\D/g, "");
    const n = norm(raw);
    const matches = (text: string) =>
      (digits.length >= 8 && text.replace(/\D/g, "").includes(digits)) || norm(text).includes(n);
    // descMap vem do mesmo `data` (ver useMemo acima), então todo id aqui já
    // existe em dataById — sem necessidade de linha mínima de fallback.
    const rows: WorkerRow[] = [];
    descMap.forEach(({ descricao, remessa }, id) => {
      if (!matches(descricao) && !matches(remessa)) return;
      const existing = dataById.get(id);
      if (existing) rows.push(existing);
    });
    setDescSearchTerm(raw);
    setResult({ data: rows, label: `Descrição/Remessa: "${raw}"`, zeroMsg: `Nada em descrição/remessa contém "${raw}".` });
    setPage(1);
  }

  // Filtered + sorted result
  const empresas = useMemo(() => {
    const set = new Set<string>();
    (result?.data || []).forEach((r) => {
      const e = F.empresa(r);
      if (e) set.add(e);
    });
    return Array.from(set).sort();
  }, [result]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    (result?.data || []).forEach((r) => {
      const s = F.status(r);
      if (s) set.add(s);
    });
    return Array.from(set).sort();
  }, [result]);

  const filtered = useMemo(() => {
    let rows = result?.data || [];
    if (filterText.trim()) {
      const n = norm(filterText);
      rows = rows.filter((r) =>
        Object.values(r).some((v) => norm(String(v ?? "")).includes(n)),
      );
    }
    if (filterStatus !== "__all__") rows = rows.filter((r) => F.status(r) === filterStatus);
    if (filterEmpresa !== "__all__") rows = rows.filter((r) => F.empresa(r) === filterEmpresa);
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = String(a[sortKey] ?? "");
        const bv = String(b[sortKey] ?? "");
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return rows;
  }, [result, filterText, filterStatus, filterEmpresa, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function handleAi() {
    if (!aiQuery.trim() || data.length === 0) return;
    setAiLoading(true);
    setAiAnswer("");
    try {
      const { answer, tokens: t } = await askAI(aiQuery, data);
      setAiAnswer(answer);
      setTokens((prev) => prev + t);
    } catch (e) {
      toast.error("Erro na consulta IA");
    } finally {
      setAiLoading(false);
    }
  }

  // ============== UPLOAD VIEW ==============
  if (data.length === 0) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <h1 className="text-2xl font-display font-bold mb-2">Consultor</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Ferramenta de busca avulsa. Envie um CSV ou JSON da sessão atual — nada é salvo.
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <div className="font-semibold">Arraste um arquivo CSV ou JSON</div>
            <div className="text-xs text-muted-foreground mt-1">ou clique para selecionar</div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
          {loading && (
            <div className="mt-4">
              <Progress value={progress} />
              <div className="text-xs text-muted-foreground mt-1 text-center">{progress}%</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============== SEARCH VIEW ==============
  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* SIDEBAR */}
      <aside className="w-[300px] border-r border-border bg-card overflow-y-auto p-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" /> {data.length} registros
            </div>
            {data.length > 8000 && (
              <div className="text-[11px] text-warning mt-1">
                Arquivo grande ({data.length}). Consultas funcionam normalmente.
              </div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={clearSession} title="Limpar sessão">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Accordion type="multiple" defaultValue={["w", "t", "e", "d", "q"]} className="space-y-1">
          <AccordionItem value="w" className="border-border">
            <AccordionTrigger className="text-sm font-semibold py-2">Ajudante</AccordionTrigger>
            <AccordionContent className="space-y-3 pb-2">
              {(["worker-phone", "worker-task", "worker-validation", "worker-date"] as const).map((k) => (
                <ModeBlock key={k} modeKey={k} values={values} setValues={setValues} onRun={runMode} />
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="t" className="border-border">
            <AccordionTrigger className="text-sm font-semibold py-2">Tarefa</AccordionTrigger>
            <AccordionContent className="space-y-3 pb-2">
              {(["task-id", "task-status"] as const).map((k) => (
                <ModeBlock key={k} modeKey={k} values={values} setValues={setValues} onRun={runMode} />
              ))}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Buscar em descrições/remessa
                </div>
                <Input
                  placeholder="Telefone ou nome"
                  value={descTerm}
                  onChange={(e) => setDescTerm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runDescSearch(descTerm); }}
                  className="h-8 text-xs"
                  disabled={descMap.size === 0}
                />
                <Button
                  size="sm"
                  variant="default"
                  className="w-full h-8 text-xs"
                  onClick={() => runDescSearch(descTerm)}
                  disabled={descMap.size === 0}
                >
                  Buscar
                </Button>
                {descMap.size === 0 && (
                  <p className="text-[10px] text-muted-foreground">O CSV carregado não tem colunas de descrição/remessa (Obs/Shipping).</p>
                )}
              </div>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => runMode("task-not-validated")}
                >
                  Finalizadas sem validação
                  <Badge variant="secondary">
                    {data.filter((r) => {
                      const st = norm(F.status(r));
                      const vl = norm(F.valid(r));
                      return st.includes("finaliz") && (!vl || vl === "pendente");
                    }).length}
                  </Badge>
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="e" className="border-border">
            <AccordionTrigger className="text-sm font-semibold py-2">Empresa</AccordionTrigger>
            <AccordionContent className="space-y-3 pb-2">
              {(["empresa-name", "empresa-week", "empresa-date"] as const).map((k) => (
                <ModeBlock key={k} modeKey={k} values={values} setValues={setValues} onRun={runMode} />
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="d" className="border-border">
            <AccordionTrigger className="text-sm font-semibold py-2">Data</AccordionTrigger>
            <AccordionContent className="space-y-3 pb-2">
              {(["date-exact", "date-week", "date-month", "date-range"] as const).map((k) => (
                <ModeBlock key={k} modeKey={k} values={values} setValues={setValues} onRun={runMode} />
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="q" className="border-border">
            <AccordionTrigger className="text-sm font-semibold py-2">Listagens rápidas</AccordionTrigger>
            <AccordionContent className="space-y-2 pb-2">
              <Button size="sm" variant="outline" className="w-full justify-between" onClick={() => runQuick("Removidos", quickRemoved)}>
                Removidos <Badge variant="secondary">{quickRemoved.length}</Badge>
              </Button>
              <Button size="sm" variant="outline" className="w-full justify-between" onClick={() => runQuick("Não responderam", quickNoResp)}>
                Não responderam <Badge variant="secondary">{quickNoResp.length}</Badge>
              </Button>
              <Button size="sm" variant="outline" className="w-full" onClick={() => {
                const today = new Date(); today.setHours(0,0,0,0);
                const end = new Date(today.getTime() + 86400000 - 1);
                runQuick("Hoje", data.filter(r => {
                  const d = parseDate(F.data(r));
                  return d && d >= today && d <= end;
                }));
              }}>Hoje</Button>
              <Button size="sm" variant="outline" className="w-full" onClick={() => runQuick("Todos os registros", data)}>
                Todos os registros
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* AI */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">IA — Pergunta livre</div>
            <span className="text-[10px] text-muted-foreground">{tokens} tokens</span>
          </div>
          <Textarea
            placeholder="Ex: João trabalhou semana passada? Quem foi para a Tragetta?"
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAi();
              }
            }}
            className="text-xs min-h-[64px]"
          />
          <Button size="sm" className="w-full mt-2 gap-1.5" onClick={handleAi} disabled={aiLoading}>
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Perguntar
          </Button>
          {aiAnswer && (
            <div className="mt-3 p-3 rounded-md bg-muted/50 border border-border text-xs whitespace-pre-wrap">
              {aiAnswer}
            </div>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto">
        {/* Filter bar */}
        <div className="sticky top-0 z-10 bg-background border-b border-border p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filtrar resultados..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os status</SelectItem>
              {statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as empresas</SelectItem>
              {empresas.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {(filterText || filterStatus !== "__all__" || filterEmpresa !== "__all__") && (
            <Button size="sm" variant="ghost" onClick={() => { setFilterText(""); setFilterStatus("__all__"); setFilterEmpresa("__all__"); }}>
              <X className="h-3.5 w-3.5 mr-1" />Limpar
            </Button>
          )}
        </div>

        {!result ? (
          <div className="flex items-center justify-center h-[60vh] text-muted-foreground text-sm">
            Selecione uma busca no painel lateral
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="text-sm">
                <span className="font-semibold">{filtered.length}</span>{" "}
                <span className="text-muted-foreground">registros encontrados</span>
              </div>
              <Badge variant="secondary" className="gap-1">
                {result.label}
                <button onClick={() => setResult(null)} className="ml-1 hover:text-destructive" aria-label="Limpar busca">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
              <div className="ml-auto flex items-center gap-2">
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v)); setPage(1); }}>
                  <SelectTrigger className="w-[100px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50/pág</SelectItem>
                    <SelectItem value="100">100/pág</SelectItem>
                    <SelectItem value="200">200/pág</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border border-border rounded-lg overflow-x-auto bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    {descMap.size > 0 && <TableHead className="w-8" />}
                    {[
                      ["Tarefa", "ID Tarefa"],
                      ["Data/Hora", "Data da Tarefa"],
                      ["Empresa", "Empresa"],
                      ["Cidade/UF", "Cidade/UF"],
                      ["Ajudante", "Nome do Chapa"],
                      ["Telefone", "Telefone Chapa"],
                      ["Qtd", "Quantidade de Chapas"],
                      ["Status Tarefa", "Status da Tarefa"],
                      ["Status Contato", "Status Contato"],
                      ["Validação", "Validação Presença"],
                    ].map(([label, key]) => (
                      <TableHead
                        key={key}
                        className="cursor-pointer select-none"
                        onClick={() => {
                          if (sortKey === key) setSortAsc(!sortAsc);
                          else { setSortKey(key); setSortAsc(true); }
                        }}
                      >
                        {label}{sortKey === key ? (sortAsc ? " ↑" : " ↓") : ""}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((r, i) => {
                    const desc = descMap.size > 0 ? descMap.get(normId(F.id(r))) : undefined;
                    const indicado = desc ? classifyIndicado(desc.remessa) : null;
                    return (
                    <TableRow key={i}>
                      {descMap.size > 0 && (
                        <TableCell className="p-1">
                          {desc && (
                            <div className="flex items-center gap-1">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    title="Ver descrição/remessa da tarefa"
                                    className="text-muted-foreground hover:text-primary transition-colors"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-96 max-h-72 overflow-y-auto text-xs leading-relaxed space-y-3">
                                  {desc.descricao && (
                                    <div>
                                      <div className="font-semibold text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Descrição</div>
                                      <div className="whitespace-pre-wrap">{highlightText(desc.descricao, descSearchTerm)}</div>
                                    </div>
                                  )}
                                  {desc.remessa && (
                                    <div>
                                      <div className="font-semibold text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                                        Remessa
                                        {indicado === "confirmado" && (
                                          <span className="px-1 py-0 rounded text-[9px] font-bold bg-success/15 text-success normal-case tracking-normal">Indicado</span>
                                        )}
                                        {indicado === "possivel" && (
                                          <span className="px-1 py-0 rounded text-[9px] font-bold bg-warning/15 text-warning normal-case tracking-normal">Possível indicado</span>
                                        )}
                                      </div>
                                      <div className="whitespace-pre-wrap">{highlightText(desc.remessa, descSearchTerm)}</div>
                                    </div>
                                  )}
                                </PopoverContent>
                              </Popover>
                              {indicado === "confirmado" && (
                                <span className="w-1.5 h-1.5 rounded-full bg-success" title="Indicado" />
                              )}
                              {indicado === "possivel" && (
                                <span className="w-1.5 h-1.5 rounded-full bg-warning" title="Possível indicado" />
                              )}
                            </div>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="font-mono text-xs">
                        {F.id(r) ? (
                          <a
                            href={`https://app.meu-chapa.com/admin/edit-task/${encodeURIComponent(F.id(r))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                            title="Abrir tarefa no Meu Chapa"
                          >
                            #{F.id(r)}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(F.data(r))}</TableCell>
                      <TableCell className="text-xs capitalize">{F.empresa(r).toLowerCase()}</TableCell>
                      <TableCell className="text-xs">{F.cidade(r)}</TableCell>
                      <TableCell className="text-xs capitalize">{F.nome(r).toLowerCase()}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {F.telefone(r) ? (
                          <button
                            type="button"
                            onClick={async () => {
                              const tel = F.telefone(r);
                              try {
                                await navigator.clipboard.writeText(tel);
                                toast.success(`Telefone copiado: ${tel}`);
                              } catch {
                                toast.error("Não foi possível copiar");
                              }
                            }}
                            className="text-primary hover:underline cursor-pointer"
                            title="Copiar telefone"
                          >
                            {F.telefone(r)}
                          </button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-center">{F.qtd(r)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${statusTarefaCls(F.status(r))}`}>
                          {F.status(r) || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${statusContatoCls(F.contato(r))}`}>
                          {F.contato(r) || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${validacaoCls(F.valid(r))}`}>
                          {F.valid(r) || "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );})}
                  {paged.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={descMap.size > 0 ? 11 : 10} className="text-center text-sm text-muted-foreground py-8">
                        Nenhum registro
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                  Próxima
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ModeBlock({
  modeKey,
  values,
  setValues,
  onRun,
}: {
  modeKey: string;
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  onRun: (k: string) => void;
}) {
  const mode = MODES[modeKey];
  if (!mode) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{mode.label}</div>
      {mode.inputs.map((inp) => {
        if (inp.type === "select") {
          return (
            <Select
              key={inp.id}
              value={values[inp.id] ?? ""}
              onValueChange={(v) => setValues({ ...values, [inp.id]: v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={inp.label} /></SelectTrigger>
              <SelectContent>
                {inp.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          );
        }
        return (
          <Input
            key={inp.id}
            type={inp.type}
            placeholder={inp.placeholder ?? inp.label}
            value={values[inp.id] ?? ""}
            onChange={(e) => setValues({ ...values, [inp.id]: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") onRun(modeKey); }}
            className="h-8 text-xs"
          />
        );
      })}
      <Button size="sm" variant="default" className="w-full h-8 text-xs" onClick={() => onRun(modeKey)}>
        Buscar
      </Button>
    </div>
  );
}
