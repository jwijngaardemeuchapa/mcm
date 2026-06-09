import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { getDb, uuid, placeholders, errMsg } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Upload, Users, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { timeAgo, todayDateISO_SP, fmtSP } from "@/lib/datetime";

function parseDateBR(s: string): string | null {
  if (!s) return null;
  const t = s.trim();
  const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, d, mo, y, h, mi, se] = m;
    return `${y}-${mo}-${d}T${h}:${mi}:${se ?? "00"}-03:00`;
  }
  const m2 = t.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (m2) {
    const [, monStr, d, y, hStr, mi, ampm] = m2;
    const months: Record<string, number> = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    };
    const mo = months[monStr.toLowerCase()];
    if (!mo) return null;
    let h = parseInt(hStr, 10);
    if (ampm) {
      const upper = ampm.toUpperCase();
      if (upper === "PM" && h < 12) h += 12;
      if (upper === "AM" && h === 12) h = 0;
    }
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${y}-${pad(mo)}-${pad(parseInt(d, 10))}T${pad(h)}:${mi}:00-03:00`;
  }
  const dt = new Date(t);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find((x) => x.toLowerCase().trim() === k.toLowerCase());
    if (found && row[found]) return row[found];
  }
  return "";
}

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
    const tarefasMap = new Map<number, Record<string, unknown>>();
    const rowCounts = new Map<number, number>(); // all valid rows per task, including empty-name slots
    const chapas: Record<string, unknown>[] = [];
    let totalParsed = 0;

    for (const row of preview) {
      const id_tarefa = parseInt(pick(row, "ID Tarefa", "id_tarefa"), 10);
      if (!id_tarefa) continue;
      const data_tarefa = parseDateBR(pick(row, "Data da Tarefa", "data_tarefa"));
      if (!data_tarefa) continue;
      totalParsed++;
      const empresa = pick(row, "Empresa", "empresa");

      // Every valid row is one required slot for the task (even if chapa name is blank)
      rowCounts.set(id_tarefa, (rowCounts.get(id_tarefa) ?? 0) + 1);

      if (!tarefasMap.has(id_tarefa)) {
        const spHourStr = new Date(data_tarefa).toLocaleString("en-US", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          hour12: false,
        });
        const spHour = parseInt(spHourStr, 10);
        const is_overnight = Number.isFinite(spHour) && spHour >= 20;
        const qtdCsv = parseInt(pick(row, "Quantidade de Chapas", "quantidade_chapas", "Qtd Chapas", "Qtd. Chapas"), 10) || 0;
        tarefasMap.set(id_tarefa, {
          id_tarefa,
          data_tarefa,
          cidade_uf: pick(row, "Cidade/UF", "cidade_uf") || null,
          empresa,
          cnpj: pick(row, "CNPJ", "cnpj") || null,
          status_tarefa: pick(row, "Status da Tarefa", "status_tarefa") || "Em Aberto",
          quantidade_chapas: 0,
          quantidade_chapas_csv: qtdCsv,
          ativo: 1,
          is_overnight: is_overnight ? 1 : 0,
          importado_em: new Date().toISOString(),
        });
      }
      const nome = pick(row, "Nome do Chapa", "nome_chapa");
      if (nome) {
        const cpf = pick(row, "CPF", "cpf") || null;
        const tel = pick(row, "Telefone Chapa", "telefone_chapa") || null;
        chapas.push({ id_tarefa, nome_chapa: nome, telefone_chapa: tel, cpf });
      }
    }

    // Dedupe chapas — normalização deve espelhar exatamente chapaKey()/norm():
    // CPF sem formatação, nome com espaços internos colapsados
    const seen = new Set<string>();
    const dedupedChapas: Record<string, unknown>[] = [];
    for (const c of chapas) {
      const cpfNorm = ((c.cpf as string | null) ?? "").replace(/\D/g, "");
      const nomeNorm = ((c.nome_chapa as string | null) ?? "").toLowerCase().trim().replace(/\s+/g, " ");
      const key = `${c.id_tarefa}|${cpfNorm || nomeNorm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedChapas.push(c);
    }

    const ids = Array.from(tarefasMap.keys());
    if (ids.length === 0) {
      toast.error("Nenhuma tarefa válida encontrada");
      return;
    }

    // Date sanity check
    const todayISO = todayDateISO_SP();
    const dateBuckets = new Map<string, number>();
    tarefasMap.forEach((t) => {
      const d = fmtSP(t.data_tarefa as string, "yyyy-MM-dd");
      dateBuckets.set(d, (dateBuckets.get(d) ?? 0) + 1);
    });
    const otherDates = Array.from(dateBuckets.entries()).filter(([d]) => d !== todayISO);
    if (otherDates.length > 0) {
      const summary = Array.from(dateBuckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, n]) => `• ${fmtSP(`${d}T12:00:00-03:00`, "dd/MM/yyyy")}: ${n} tarefa(s)${d === todayISO ? " (hoje)" : ""}`)
        .join("\n");
      const ok = window.confirm(
        `Atenção: o arquivo contém tarefas de datas diferentes de hoje.\n\n${summary}\n\nDeseja importar mesmo assim?`,
      );
      if (!ok) return;
    }

    const db = await getDb();

    // Fetch existing state to preserve progress
    const norm = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
    const chapaKey = (id_tarefa: number, cpf: string | null | undefined, nome: string | null | undefined) => {
      const c = (cpf ?? "").replace(/\D/g, "");
      return c ? `${id_tarefa}|cpf:${c}` : `${id_tarefa}|nome:${norm(nome)}`;
    };

    // Fetch existing tarefas in chunks (SQLite limit 999 params)
    const tarefaPrev = new Map<number, Record<string, unknown>>();
    const chapaPrev = new Map<string, Record<string, unknown>>();

    for (let i = 0; i < ids.length; i += 900) {
      const chunk = ids.slice(i, i + 900);
      const ph = placeholders(chunk.length);
      const existingT = await db.select<Record<string, unknown>[]>(
        `SELECT id_tarefa, importado_em, observacoes, observacoes_updated_at, validacao_status, data_validacao_recebida, data_upload_meu_chapa, obs_validacao FROM tarefas WHERE id_tarefa IN (${ph})`,
        chunk,
      );
      existingT.forEach((e) => tarefaPrev.set(e.id_tarefa as number, e));

      const existingC = await db.select<Record<string, unknown>[]>(
        `SELECT id, id_tarefa, nome_chapa, cpf, telefone_chapa, status_contato, validacao_presenca, data_validacao, data_contato, canal_contato, data_remocao, motivo_remocao FROM chapas WHERE id_tarefa IN (${ph})`,
        chunk,
      );
      existingC.forEach((c) =>
        chapaPrev.set(chapaKey(c.id_tarefa as number, c.cpf as string | null, c.nome_chapa as string | null), c),
      );
    }

    // Apply preserved state to tarefas
    tarefasMap.forEach((t, id) => {
      const prev = tarefaPrev.get(id);
      // Prefer explicit CSV column; fall back to counting rows per task
      const csvQty = t.quantidade_chapas_csv as number;
      t.quantidade_chapas = csvQty > 0 ? csvQty : (rowCounts.get(id) ?? 0);
      if (prev?.importado_em) t.importado_em = prev.importado_em as string;
      t.observacoes = prev?.observacoes ?? null;
      t.observacoes_updated_at = prev?.observacoes_updated_at ?? null;
      const status = String(t.status_tarefa ?? "");
      const inProgressOrDone = /em\s*andamento|finalizado|conclu/i.test(status);
      const prevValStatus = prev?.validacao_status as string | undefined;
      if (inProgressOrDone) {
        // Task is running/done in the external system — always mark as uploaded regardless of previous state
        t.validacao_status = "subido_meu_chapa";
        t.data_validacao_recebida = prev?.data_validacao_recebida ?? new Date(t.data_tarefa as string).toISOString();
        t.data_upload_meu_chapa = prev?.data_upload_meu_chapa ?? new Date().toISOString();
        t.obs_validacao = prev?.obs_validacao ?? "Importada já validada";
      } else {
        t.validacao_status = prevValStatus ?? "aguardando";
        t.data_validacao_recebida = prev?.data_validacao_recebida ?? null;
        t.data_upload_meu_chapa = prev?.data_upload_meu_chapa ?? null;
        t.obs_validacao = prev?.obs_validacao ?? null;
      }
    });

    // Build chapas with preserved IDs and progress
    const chapasToInsert = dedupedChapas.map((c) => {
      const prev = chapaPrev.get(
        chapaKey(c.id_tarefa as number, c.cpf as string | null, c.nome_chapa as string | null),
      );
      const taskStatus = String((tarefasMap.get(c.id_tarefa as number)?.status_tarefa) ?? "");
      const taskInProgressOrDone = /em\s*andamento|finalizado/i.test(taskStatus);
      const chapaId = (prev?.id as string | undefined) ?? uuid();
      if (prev) {
        const wasRemoved = prev.status_contato === "removido";
        return {
          ...c,
          id: chapaId,
          status_contato: wasRemoved ? "removido" : (taskInProgressOrDone ? "confirmado" : (prev.status_contato ?? "pendente")),
          validacao_presenca: wasRemoved ? null : (taskInProgressOrDone ? "presente" : (prev.validacao_presenca ?? "pendente")),
          data_validacao: wasRemoved ? null : (taskInProgressOrDone ? (prev.data_validacao ?? new Date().toISOString()) : prev.data_validacao ?? null),
          data_contato: prev.data_contato ?? null,
          canal_contato: prev.canal_contato ?? null,
          data_remocao: prev.data_remocao ?? null,
          motivo_remocao: prev.motivo_remocao ?? null,
          telefone_chapa: c.telefone_chapa ?? prev.telefone_chapa ?? null,
        };
      }
      return {
        ...c,
        id: chapaId,
        status_contato: taskInProgressOrDone ? "confirmado" : "pendente",
        validacao_presenca: taskInProgressOrDone ? "presente" : "pendente",
        data_validacao: taskInProgressOrDone ? new Date().toISOString() : null,
        data_contato: null,
        canal_contato: null,
        data_remocao: null,
        motivo_remocao: null,
      };
    });

    // Proteção final: nunca inserir dois chapas com o mesmo id
    const seenIds = new Set<string>();
    const chapasFinais = chapasToInsert.filter((c) => {
      if (seenIds.has(c.id as string)) return false;
      seenIds.add(c.id as string);
      return true;
    });

    try {
      // Delete chapas for re-imported tasks (chunked)
      for (let i = 0; i < ids.length; i += 900) {
        const chunk = ids.slice(i, i + 900);
        const ph = placeholders(chunk.length);
        await db.execute(`DELETE FROM chapas WHERE id_tarefa IN (${ph})`, chunk);
      }

      // Upsert tarefas (INSERT OR REPLACE handles both new and existing)
      for (const t of tarefasMap.values()) {
        await db.execute(
          "INSERT OR REPLACE INTO tarefas (id_tarefa, data_tarefa, cidade_uf, empresa, cnpj, status_tarefa, quantidade_chapas, ativo, is_overnight, importado_em, observacoes, observacoes_updated_at, validacao_status, data_validacao_recebida, data_upload_meu_chapa, obs_validacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            t.id_tarefa, t.data_tarefa, t.cidade_uf ?? null, t.empresa, t.cnpj ?? null,
            t.status_tarefa, t.quantidade_chapas, t.ativo, t.is_overnight, t.importado_em,
            t.observacoes ?? null, t.observacoes_updated_at ?? null,
            t.validacao_status, t.data_validacao_recebida ?? null,
            t.data_upload_meu_chapa ?? null, t.obs_validacao ?? null,
          ],
        );
      }

      // Insert chapas
      for (const c of chapasFinais) {
        await db.execute(
          "INSERT INTO chapas (id, id_tarefa, nome_chapa, telefone_chapa, cpf, status_contato, validacao_presenca, data_validacao, data_contato, canal_contato, data_remocao, motivo_remocao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            c.id, c.id_tarefa, c.nome_chapa ?? null, c.telefone_chapa ?? null, c.cpf ?? null,
            c.status_contato, c.validacao_presenca ?? null, c.data_validacao ?? null,
            c.data_contato ?? null, c.canal_contato ?? null, c.data_remocao ?? null, c.motivo_remocao ?? null,
          ],
        );
      }
    } catch (e) {
      toast.error("Erro ao importar: " + errMsg(e));
      return;
    }

    toast.success(`✓ ${tarefasMap.size} tarefas · ${chapasFinais.length} chapas`);
    setPreview([]);
    loadLast();
    navigate("/dashboard");
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
