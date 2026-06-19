import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { getDb, errMsg } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Upload, Users, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { timeAgo } from "@/lib/datetime";
import { ingestTarefas } from "@/lib/ingestTarefas";

function excelSerialToISO(val: unknown): string | null {
  const n = typeof val === "number" ? val : parseFloat(String(val ?? ""));
  if (!n || isNaN(n) || n < 1) return null;
  return new Date((n - 25569) * 86400 * 1000).toISOString().slice(0, 10);
}

export default function Importar() {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cadastro geral de chapas
  const [regFile, setRegFile] = useState<File | null>(null);
  const [regRows, setRegRows] = useState<unknown[][] | null>(null);
  const [regCols, setRegCols] = useState<Record<string, number> | null>(null);
  const [regParsing, setRegParsing] = useState(false);
  const [regPreview, setRegPreview] = useState<{ count: number; blocked: number; semCep: number } | null>(null);
  const [regImporting, setRegImporting] = useState(false);
  const [regProgress, setRegProgress] = useState<{ done: number; total: number } | null>(null);
  const [regDragOver, setRegDragOver] = useState(false);
  const regFileRef = useRef<HTMLInputElement>(null);
  const lastRegImport = localStorage.getItem("chapa_registry_imported_at");
  const regIsStale = lastRegImport
    ? (Date.now() - new Date(lastRegImport).getTime()) / 86400000 > 7
    : false;

  async function loadLast() {
    try {
      const db = await getDb();
      const rows = await db.select<{ importado_em: string }[]>(
        "SELECT importado_em FROM tarefas ORDER BY importado_em DESC LIMIT 1",
      );
      if (rows[0]) setLastImport(rows[0].importado_em);
    } catch { /* noop */ }
  }

  useEffect(() => { loadLast(); }, []);

  function onFile(file: File) {
    const isJson = file.name.toLowerCase().endsWith(".json") || file.type.includes("json");
    if (isJson) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (!Array.isArray(parsed)) { toast.error("JSON precisa ser uma lista de objetos"); return; }
          const rows = parsed.map((r: Record<string, unknown>) => {
            const out: Record<string, string> = {};
            Object.keys(r).forEach((k) => { out[k] = r[k] == null ? "" : String(r[k]); });
            return out;
          });
          setPreview(rows);
          toast.success(`${rows.length} linhas carregadas (JSON)`);
        } catch (e) {
          toast.error("JSON inválido: " + errMsg(e));
        }
      };
      reader.readAsText(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = Papa.parse<Record<string, string>>(reader.result as string, {
        header: true,
        skipEmptyLines: true,
      });
      setPreview(result.data);
      toast.success(`${result.data.length} linhas carregadas`);
    };
    reader.onerror = () => toast.error("Erro ao ler o arquivo");
    reader.readAsText(file);
  }

  function onRegFile(file: File) {
    if (!file.name.toLowerCase().match(/\.(xlsx|xls)$/)) { toast.error("Envie um arquivo .xlsx"); return; }
    setRegFile(file);
    setRegRows(null);
    setRegCols(null);
    setRegPreview(null);
    setRegParsing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const raw = e.target?.result as ArrayBuffer;
      setTimeout(() => {
        try {
          const data = new Uint8Array(raw);
          const wb = XLSX.read(data, { type: "array", cellDates: false, cellNF: false, cellText: false });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

          // Detect columns from header row
          const headerRow = (matrix[0] ?? []) as string[];
          const hdrs = headerRow.map((h) => String(h ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim());
          const fc = (...names: string[]) => {
            for (const n of names) {
              const i = hdrs.findIndex((h) => h === n || h.includes(n));
              if (i >= 0) return i;
            }
            return -1;
          };
          const cols: Record<string, number> = {
            nome:             fc("nome", "name"),
            cpf:              fc("cpf", "documento"),
            telefone:         fc("telefone", "celular", "fone", "phone"),
            cidade:           fc("cidade", "city", "municipio"),
            bairro:           fc("bairro", "district", "bairro/distrito"),
            estado:           fc("estado", "uf", "state"),
            rua:              fc("rua", "logradouro", "endereco", "street"),
            cep:              fc("cep", "postal", "zip"),
            numero:           fc("numero", "num", "n°"),
            tarefas:          fc("qtd. tarefas", "qtd tarefas", "tarefas", "total tarefas", "qt. tarefas"),
            data_primeira:    fc("primeira tarefa", "data primeira", "data_primeira", "entrada"),
            data_ultima:      fc("ultima tarefa", "data ultima", "data_ultima", "ultimo trabalho", "ultimo"),
            situacao:         fc("situacao", "situação", "status app", "status"),
            bloqueio:         fc("bloqueio", "blocked", "block", "status bloqueio"),
            motivo_bloqueio:  fc("motivo bloqueio", "motivo_bloqueio", "motivo do bloqueio", "motivo"),
            aso:              fc("aso"),
          };

          // Filter: require non-empty nome (not cpf — many chapas lack CPF)
          const iNome = cols.nome >= 0 ? cols.nome : 0;
          const iCpf = cols.cpf >= 0 ? cols.cpf : -1;
          const iBloq = cols.bloqueio >= 0 ? cols.bloqueio : -1;
          const iCep = cols.cep >= 0 ? cols.cep : -1;

          const rows = (matrix.slice(1) as unknown[][]).filter((r) => r[iNome]?.toString().trim());
          const blocked = iBloq >= 0
            ? rows.filter((r) => r[iBloq]?.toString().toLowerCase().includes("bloqueado em tudo")).length
            : 0;
          const semCep = iCep >= 0
            ? rows.filter((r) => !r[iCep]?.toString().replace(/\D/g, "")).length
            : rows.length;
          const semCpf = iCpf >= 0
            ? rows.filter((r) => !r[iCpf]?.toString().replace(/\D/g, "")).length
            : rows.length;

          setRegCols(cols);
          setRegRows(rows);
          setRegPreview({ count: rows.length, blocked, semCep: semCep + semCpf });
        } catch (err) {
          toast.error("Erro ao ler arquivo: " + errMsg(err));
        } finally {
          setRegParsing(false);
        }
      }, 80);
    };
    reader.readAsArrayBuffer(file);
  }

  async function doRegistryImport() {
    if (!regRows || regRows.length === 0) return;
    setRegImporting(true);
    const db = await getDb();
    try {
      // Drop and recreate to allow schema changes across imports
      await new Promise((r) => setTimeout(r, 0));
      await db.execute("DROP TABLE IF EXISTS chapa_registry");
      await db.execute(`CREATE TABLE chapa_registry (
        cpf TEXT, nome TEXT NOT NULL, telefone TEXT,
        cidade TEXT, bairro TEXT, estado TEXT, rua TEXT, cep TEXT, numero TEXT,
        tarefas INTEGER NOT NULL DEFAULT 0, data_primeira_tarefa TEXT, data_ultima_tarefa TEXT,
        situacao TEXT, bloqueio TEXT, motivo_bloqueio TEXT, aso TEXT,
        importado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )`);
      await db.execute(`CREATE TABLE IF NOT EXISTS cep_cache (
        cep TEXT PRIMARY KEY, lat REAL, lng REAL, geocodificado_em TEXT NOT NULL
      )`);
      try { await db.execute("CREATE INDEX IF NOT EXISTS idx_registry_cidade ON chapa_registry(cidade)"); } catch { /* exists */ }
      try { await db.execute("CREATE INDEX IF NOT EXISTS idx_registry_cpf ON chapa_registry(cpf) WHERE cpf IS NOT NULL"); } catch { /* exists */ }

      // Column mapping — use detected cols if available, fall back to positional defaults
      const c = regCols ?? {};
      const g = (key: string, fallback: number) => (c[key] !== undefined && c[key] >= 0 ? c[key] : fallback);
      const iNome      = g("nome", 0);
      const iCpf       = g("cpf", 2);
      const iTel       = g("telefone", 3);
      const iCidade    = g("cidade", 14);
      const iBairro    = g("bairro", 15);
      const iEstado    = g("estado", 16);
      const iRua       = g("rua", 17);
      const iCep       = g("cep", 18);
      const iNumero    = g("numero", 19);
      const iTarefas   = g("tarefas", 11);
      const iPrimeira  = g("data_primeira", 5);
      const iUltima    = g("data_ultima", 6);
      const iSituacao  = g("situacao", 12);
      const iBloqueio  = g("bloqueio", 8);
      const iMotivo    = g("motivo_bloqueio", 9);
      const iAso       = g("aso", 13);

      const now = new Date().toISOString();
      const total = regRows.length;
      setRegProgress({ done: 0, total });

      const CHUNK = 30;
      for (let i = 0; i < regRows.length; i += CHUNK) {
        const chunk = regRows.slice(i, i + CHUNK);
        const ph = chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
        const vals = chunk.flatMap((r) => [
          r[iCpf]?.toString().replace(/\D/g, "") || null,
          r[iNome]?.toString().trim() || "",
          r[iTel]?.toString().replace(/\D/g, "") || null,
          r[iCidade]?.toString().trim() || null,
          r[iBairro]?.toString().trim() || null,
          r[iEstado]?.toString().trim() || null,
          r[iRua]?.toString().trim() || null,
          r[iCep]?.toString().replace(/\D/g, "") || null,
          r[iNumero]?.toString().trim() || null,
          parseInt(String(r[iTarefas] ?? "0")) || 0,
          excelSerialToISO(r[iPrimeira]),
          excelSerialToISO(r[iUltima]),
          r[iSituacao]?.toString().trim() || null,
          r[iBloqueio]?.toString().trim() || null,
          r[iMotivo]?.toString().trim() || null,
          r[iAso]?.toString().trim() || null,
          now,
        ]);
        await db.execute(
          `INSERT INTO chapa_registry (cpf,nome,telefone,cidade,bairro,estado,rua,cep,numero,tarefas,data_primeira_tarefa,data_ultima_tarefa,situacao,bloqueio,motivo_bloqueio,aso,importado_em) VALUES ${ph}`,
          vals,
        );
        setRegProgress({ done: Math.min(i + CHUNK, total), total });
        await new Promise((r) => setTimeout(r, 0));
      }

      localStorage.setItem("chapa_registry_imported_at", now);
      toast.success(`✓ ${total.toLocaleString("pt-BR")} chapas importados no cadastro geral`);
      setRegFile(null);
      setRegPreview(null);
      setRegRows(null);
      setRegCols(null);
    } catch (e) {
      toast.error("Erro ao importar cadastro: " + errMsg(e));
    } finally {
      setRegImporting(false);
      setRegProgress(null);
    }
  }

  async function doImport() {
    if (!preview.length) return;
    try {
      const result = await ingestTarefas(preview as Record<string, unknown>[], {
        confirmDateMismatch: async (summary) =>
          window.confirm(
            `Atenção: o arquivo contém tarefas de datas diferentes de hoje.\n\n${summary}\n\nDeseja importar mesmo assim?`,
          ),
      });
      if (result.tarefas === 0 && result.chapas === 0) return;
      toast.success(`✓ ${result.tarefas} tarefas · ${result.chapas} chapas`);
      setPreview([]);
      loadLast();
      navigate("/dashboard");
    } catch (e) {
      toast.error("Erro ao importar: " + errMsg(e));
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-2xl">Importar Planilha de Tarefas</h2>
          <p className="text-sm text-muted-foreground">Faça upload do CSV ou JSON diário de tarefas</p>
        </div>
        <div className="text-sm">
          Última importação:{" "}
          <b className="text-primary">{lastImport ? timeAgo(lastImport) : "—"}</b>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors bg-card ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary hover:bg-primary-soft"}`}
      >
        <Upload className={`h-10 w-10 mx-auto mb-2 text-primary`} />
        <div className="font-semibold">Clique ou arraste um CSV ou JSON</div>
        <div className="text-xs text-muted-foreground mt-1">
          Colunas: ID Tarefa, Data da Tarefa, Cidade/UF, Empresa, CNPJ, Status da Tarefa, Nome do Chapa, Telefone Chapa, Quantidade de Chapas
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.json,application/json,text/csv" className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />

      <div className="space-y-2">
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-success/10 border border-success/30 text-success text-sm">
          <span>✓</span>
          <span>Progresso preservado — chapas confirmados, validados, contatados ou removidos mantêm seu estado entre importações.</span>
        </div>
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-info/10 border border-info/30 text-info text-sm">
          <span>ℹ</span>
          <span>Tarefas "Em Andamento" ou "Finalizado" são importadas já validadas e subidas no Meu Chapa.</span>
        </div>
      </div>

      {preview.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-border">
            <div className="font-semibold">Preview — {preview.length} linhas</div>
            <Button onClick={doImport}>Confirmar importação</Button>
          </div>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {Object.keys(preview[0]).slice(0, 8).map((k) => (
                    <th key={k} className="text-left px-2 py-2 font-semibold whitespace-nowrap">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {Object.keys(preview[0]).slice(0, 8).map((k) => (
                      <td key={k} className="px-2 py-1.5 whitespace-nowrap">{r[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Cadastro Geral de Chapas ── */}
      <div className="pt-4 border-t border-border space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display font-bold text-2xl">Cadastro Geral de Chapas</h2>
            <p className="text-sm text-muted-foreground">
              Base semanal usada pelo BID Dashboard para recomendar chapas por proximidade e histórico
            </p>
          </div>
          {lastRegImport && (
            <div className="text-sm">
              Última atualização:{" "}
              <b className={regIsStale ? "text-destructive" : "text-primary"}>{timeAgo(lastRegImport)}</b>
            </div>
          )}
        </div>

        {(regIsStale || !lastRegImport) && (
          <div className={`flex items-start gap-2 px-4 py-3 rounded-lg border text-sm ${
            !lastRegImport
              ? "bg-muted/20 border-border text-muted-foreground"
              : "bg-warning/10 border-warning/30 text-warning"
          }`}>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {!lastRegImport
                ? "Cadastro ainda não importado. Importe o arquivo semanal para ativar as recomendações do BID Dashboard."
                : "Cadastro desatualizado — atualize semanalmente com o arquivo mais recente do Meu Chapa."}
            </span>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setRegDragOver(true); }}
          onDragLeave={() => setRegDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setRegDragOver(false); e.dataTransfer.files[0] && onRegFile(e.dataTransfer.files[0]); }}
          onClick={() => regFileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors bg-card ${
            regDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary hover:bg-primary-soft"
          }`}
        >
          <Users className="h-10 w-10 mx-auto mb-2 text-primary" />
          <div className="font-semibold">Clique ou arraste o arquivo de cadastro (.xlsx)</div>
          <div className="text-xs text-muted-foreground mt-1">
            chapas_ativos_x_cadastros___table_AAAA-MM-DD.xlsx · +100k chapas
          </div>
        </div>
        <input ref={regFileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => e.target.files?.[0] && onRegFile(e.target.files[0])} />

        {regParsing && (
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
            <div className="text-sm text-muted-foreground">
              Lendo arquivo… arquivos grandes podem levar alguns segundos.
            </div>
          </div>
        )}

        {regPreview && !regImporting && !regParsing && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="space-y-1">
                <div className="font-semibold text-sm">{regFile?.name}</div>
                <div className="text-sm text-muted-foreground">
                  <b className="text-foreground">{regPreview.count.toLocaleString("pt-BR")}</b> chapas válidos
                  {regPreview.blocked > 0 && (
                    <span className="ml-2 text-destructive/70">
                      · {regPreview.blocked.toLocaleString("pt-BR")} bloqueados em tudo (excluídos do BID)
                    </span>
                  )}
                  {regPreview.semCep > 0 && (
                    <span className="ml-2 text-warning/70">
                      · {regPreview.semCep.toLocaleString("pt-BR")} sem CEP
                    </span>
                  )}
                </div>
              </div>
              <Button onClick={doRegistryImport}>Confirmar importação</Button>
            </div>
          </div>
        )}

        {regImporting && regProgress && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="text-sm font-medium">Importando cadastro…</div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-150"
                    style={{ width: `${regProgress.total > 0 ? (regProgress.done / regProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {regProgress.done.toLocaleString("pt-BR")} / {regProgress.total.toLocaleString("pt-BR")}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
