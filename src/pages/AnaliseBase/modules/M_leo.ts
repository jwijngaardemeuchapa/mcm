import { SignJWT, importPKCS8 } from "jose"
import Papa from "papaparse"
import { getDb } from "@/lib/db"
import { fmtSP, todayDateISO_SP } from "@/lib/datetime"
import { normalize } from "@/lib/normalize"
import type { LeoMetrics } from "../types"

type ServiceAccount = {
  private_key: string
  client_email: string
  token_uri: string
}

// ── Phone normalization ───────────────────────────────────────────────────

export function normalizePhone(s: string): string {
  const digits = s.replace(/\D/g, "")
  if (digits.startsWith("55") && digits.length === 13) return digits.slice(2)
  if (digits.startsWith("55") && digits.length === 12) return digits.slice(2)
  return digits
}

// ── Google OAuth ──────────────────────────────────────────────────────────

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const privateKey = await importPKCS8(sa.private_key, "RS256")
  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setIssuer(sa.client_email)
    .setAudience(sa.token_uri)
    .sign(privateKey)

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Auth falhou (${res.status}): ${body}`)
  }
  const data = await res.json()
  return data.access_token as string
}

// ── Config persistence ────────────────────────────────────────────────────

export async function getLeoConfig(): Promise<{
  spreadsheetId: string | null
  serviceAccountJson: string | null
  lastSync: string | null
  totalRegistros: number
}> {
  const db = await getDb()
  const rows = await db.select<{ chave: string; valor: string }[]>(
    "SELECT chave, valor FROM leo_config",
  )
  const map = new Map(rows.map((r) => [r.chave, r.valor]))

  const [countRow] = await db.select<{ n: number }[]>("SELECT COUNT(*) as n FROM leo_cache")
  const [lastRow] = await db.select<{ atualizado_em: string }[]>(
    "SELECT atualizado_em FROM leo_cache ORDER BY atualizado_em DESC LIMIT 1",
  )

  return {
    spreadsheetId: map.get("spreadsheet_id") ?? null,
    serviceAccountJson: map.get("service_account_json") ?? null,
    lastSync: lastRow?.atualizado_em ?? null,
    totalRegistros: countRow?.n ?? 0,
  }
}

export async function saveLeoConfig(chave: string, valor: string): Promise<void> {
  const db = await getDb()
  await db.execute("INSERT OR REPLACE INTO leo_config (chave, valor) VALUES (?, ?)", [chave, valor])
}

// ── Sync from Google Sheets ───────────────────────────────────────────────

export async function syncLeo(spreadsheetId: string, serviceAccountJson: string): Promise<number> {
  const sa: ServiceAccount = JSON.parse(serviceAccountJson)
  const token = await getAccessToken(sa)

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/A:H`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Sheets API ${res.status}: ${body}`)
  }

  const data = await res.json()
  const rows: string[][] = data.values ?? []
  if (rows.length < 2) return 0

  // normalize() tira acento (NFD + strip de marcas) — sem isso "Número" (com
  // acento, cabeçalho real visto em produção) nunca batia com o termo de
  // busca "numero" (sem acento) e o sync falhava com "coluna não encontrada"
  // mesmo com a planilha 100% correta.
  const headers = rows[0].map((h) => normalize(h).trim())

  const findCol = (...names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex((h) => h.includes(n))
      if (i !== -1) return i
    }
    return -1
  }

  const iNumero = findCol("numero", "telefone", "whatsapp", "fone", "cel")
  const iOfertas = findCol("oferta", "total_ofert", "enviado", "disparo", "vezes", "aparece")
  const iSim = findCol("sim", "aceite", "aceit", "positivo", "respondeu")
  const iPct = findCol("%", "pct", "percentual", "taxa")
  const iRepete = findCol("repete", "repeat", "recorrente", "voltou")

  if (iNumero === -1) throw new Error("Coluna de número/telefone não encontrada. Verifique os cabeçalhos da planilha.")

  // Collect all rows in memory before writing to DB
  type Entry = [string, number, number, number, number, number]
  const entries: Entry[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const numero = normalizePhone(row[iNumero] ?? "")
    if (!numero || numero.length < 8) continue

    const totalOfertas = parseInt(row[iOfertas] ?? "0") || 0
    const totalSim = parseInt(row[iSim] ?? "0") || 0
    const pctRaw = iPct !== -1 ? row[iPct] ?? "" : ""
    const pctSim = pctRaw
      ? parseFloat(pctRaw.replace(",", ".").replace("%", "")) / (pctRaw.includes("%") ? 100 : 1)
      : totalOfertas > 0 ? totalSim / totalOfertas : 0
    const passa = pctSim >= 0.75 ? 1 : 0
    const repete = iRepete !== -1 && (row[iRepete] ?? "").toLowerCase().startsWith("s") ? 1 : 0
    entries.push([numero, totalOfertas, totalSim, pctSim, passa, repete])
  }

  const db = await getDb()
  await db.execute("DELETE FROM leo_cache")

  const now = new Date().toISOString()
  const COLS = "(numero, total_ofertas, total_sim, pct_sim, passa_75pct, repete, atualizado_em)"
  const BATCH = 100
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH)
    const rowPlaceholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")
    const values = chunk.flatMap((e) => [...e, now])
    await db.execute(
      `INSERT OR REPLACE INTO leo_cache ${COLS} VALUES ${rowPlaceholders}`,
      values,
    )
  }

  return entries.length
}

// ── Sync automático (gate diário no boot) ─────────────────────────────────

/**
 * Sincroniza o leo_cache a partir do Google Sheets configurado, SEM interação.
 * Retorna a contagem de registros, ou null se não configurado (não é erro —
 * simplesmente não há planilha pra puxar). Reaproveita syncLeo/getLeoConfig.
 */
export async function sincronizarLeoAuto(): Promise<number | null> {
  const { spreadsheetId, serviceAccountJson } = await getLeoConfig()
  if (!spreadsheetId || !serviceAccountJson) return null
  return await syncLeo(spreadsheetId, serviceAccountJson)
}

/**
 * Gate diário: só sincroniza se estiver configurado E a última sync não foi
 * hoje (fuso SP). O timestamp de referência é leo_cache.atualizado_em — mesma
 * fonte que a UI mostra como "última sync", então bate com o que o usuário vê.
 */
export async function devesSincronizarLeo(): Promise<boolean> {
  const { spreadsheetId, serviceAccountJson, lastSync } = await getLeoConfig()
  if (!spreadsheetId || !serviceAccountJson) return false
  if (!lastSync) return true
  return fmtSP(lastSync, "yyyy-MM-dd") !== todayDateISO_SP()
}

// ── Direct CSV import ("Respostas BID.csv" format) ───────────────────────

function parseBidRow(row: Record<string, string>, cols: {
  iNumero: number; iOfertas: number; iSim: number; iPct: number; iAprovado: number
}, headers: string[]): LeoMetrics | null {
  const vals = Object.values(row)
  const get = (i: number) => (i !== -1 ? vals[i] ?? "" : "")

  const numero = normalizePhone(get(cols.iNumero))
  if (!numero || numero.length < 8) return null

  const totalOfertas = parseInt(get(cols.iOfertas).replace(/\D/g, "") || "0", 10) || 0
  const totalSim = parseInt(get(cols.iSim).replace(/\D/g, "") || "0", 10) || 0

  const pctRaw = get(cols.iPct).trim()
  const pctSim = pctRaw
    ? parseFloat(pctRaw.replace(",", ".").replace("%", "")) / (pctRaw.includes("%") ? 100 : 1)
    : totalOfertas > 0 ? totalSim / totalOfertas : 0

  // "APROVADO" = respondeu SIM em >75% das ofertas (pré-calculado no CSV)
  const aprovadoVal = get(cols.iAprovado).trim().toUpperCase()
  const passa_75pct = aprovadoVal === "APROVADO" || pctSim > 0.75
  const repete = totalOfertas > 1

  return { numero, total_ofertas: totalOfertas, total_sim: totalSim, pct_sim: pctSim, passa_75pct, repete }
}

function detectBidCols(headers: string[]): {
  iNumero: number; iOfertas: number; iSim: number; iPct: number; iAprovado: number
} {
  // normalize() (mesmo helper usado no sync via Sheets acima) tira acento —
  // "número"/"numero" batem os dois, sem depender de listar as duas grafias.
  const h = headers.map((s) => normalize(s).trim())
  const find = (...kw: string[]) => {
    for (const k of kw) {
      const i = h.findIndex((s) => s.includes(k))
      if (i !== -1) return i
    }
    return -1
  }

  return {
    iNumero: find("numero", "telefone", "whatsapp", "fone"),
    // "total de vezes que o número aparece" — must NOT include "sim"
    iOfertas: (() => {
      for (let i = 0; i < h.length; i++) {
        if ((h[i].includes("vezes") || h[i].includes("aparece") || h[i].includes("oferta") || h[i].includes("disparo"))
          && !h[i].includes("sim")) return i
      }
      return -1
    })(),
    iSim: find("total de \"sim\"", "sim", "aceite"),
    iPct: find("percentual", "%", "pct", "taxa"),
    // Last column or header with "aprovado"/"repete"/"marca" — often has no header
    iAprovado: (() => {
      const explicit = find("aprovado", "repete", "marca")
      if (explicit !== -1) return explicit
      return headers.length - 1 // last column by convention
    })(),
  }
}

// parseRespostasBidCsvToMap — in-memory, no DB access (for pipeline use)
export function parseRespostasBidCsvToMap(csv: string): Map<string, LeoMetrics> {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  const headers = result.meta.fields ?? []
  const cols = detectBidCols(headers)
  if (cols.iNumero === -1) return new Map()

  const map = new Map<string, LeoMetrics>()
  for (const row of result.data) {
    const m = parseBidRow(row, cols, headers)
    if (m) map.set(m.numero, m)
  }
  return map
}

// parseRespostasBidCsv — persists to leo_cache SQLite, returns count
// Uses batch multi-row INSERT (chunks of 100) to avoid N IPC roundtrips
// without manual BEGIN/COMMIT (tauri-plugin-sql wraps each execute implicitly)
export async function parseRespostasBidCsv(csv: string): Promise<number> {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  const headers = result.meta.fields ?? []
  const cols = detectBidCols(headers)
  if (cols.iNumero === -1) throw new Error("Coluna de número/telefone não encontrada no CSV de Respostas BID")

  // Parse all rows in memory first — no DB access during parsing
  const metrics: LeoMetrics[] = []
  for (const row of result.data) {
    const m = parseBidRow(row, cols, headers)
    if (m) metrics.push(m)
  }

  const db = await getDb()
  await db.execute("DELETE FROM leo_cache")

  const now = new Date().toISOString()
  const COLS = "(numero, total_ofertas, total_sim, pct_sim, passa_75pct, repete, atualizado_em)"
  const BATCH = 100 // 100 rows × 7 cols = 700 params, well under SQLite's 999 limit

  for (let i = 0; i < metrics.length; i += BATCH) {
    const chunk = metrics.slice(i, i + BATCH)
    const rowPlaceholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")
    const values = chunk.flatMap((m) => [
      m.numero, m.total_ofertas, m.total_sim, m.pct_sim,
      m.passa_75pct ? 1 : 0, m.repete ? 1 : 0, now,
    ])
    await db.execute(
      `INSERT OR REPLACE INTO leo_cache ${COLS} VALUES ${rowPlaceholders}`,
      values,
    )
  }

  return metrics.length
}

// ── Cache read ────────────────────────────────────────────────────────────

export async function getLeoCache(): Promise<Map<string, LeoMetrics>> {
  const db = await getDb()
  const rows = await db.select<{
    numero: string
    total_ofertas: number
    total_sim: number
    pct_sim: number
    passa_75pct: number
    repete: number
  }[]>("SELECT * FROM leo_cache")

  const map = new Map<string, LeoMetrics>()
  for (const r of rows) {
    map.set(r.numero, {
      numero: r.numero,
      total_ofertas: r.total_ofertas,
      total_sim: r.total_sim,
      pct_sim: r.pct_sim,
      passa_75pct: r.passa_75pct === 1,
      repete: r.repete === 1,
    })
  }
  return map
}

export async function getLeoByPhone(telefone: string | null): Promise<LeoMetrics | null> {
  if (!telefone) return null
  const numero = normalizePhone(telefone)
  if (!numero) return null
  const db = await getDb()
  const [row] = await db.select<{
    numero: string; total_ofertas: number; total_sim: number
    pct_sim: number; passa_75pct: number; repete: number
  }[]>("SELECT * FROM leo_cache WHERE numero = ?", [numero])
  if (!row) return null
  return {
    numero: row.numero,
    total_ofertas: row.total_ofertas,
    total_sim: row.total_sim,
    pct_sim: row.pct_sim,
    passa_75pct: row.passa_75pct === 1,
    repete: row.repete === 1,
  }
}

// ── Extract spreadsheet ID from URL ──────────────────────────────────────

export function extractSpreadsheetId(urlOrId: string): string {
  const m = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : urlOrId.trim()
}
