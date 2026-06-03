import Papa from "papaparse"
import type { TarefaRaw, PoolChapa, ImportPreview } from "../types"

const STATUS_FINALIZADO = new Set([
  "finalizado",
  "concluido",
  "concluído",
  "fup confirmado",
  "chapa a caminho",
  "confirmado",
])

function normStr(s: unknown): string {
  return String(s ?? "").trim().toLowerCase()
}

function findCol(headers: string[], ...keywords: string[]): string | null {
  for (const h of headers) {
    const n = normStr(h)
    if (keywords.every((k) => n.includes(k))) return h
  }
  return null
}

export function parseDate(raw: string): Date | null {
  if (!raw) return null
  const s = raw.trim()

  // Try native parse first (handles ISO and English like "May 25, 2026, 10:00 PM")
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d

  // DD/MM/YYYY HH:mm or DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[, T]+(\d{1,2}):(\d{2}))?/)
  if (m1) {
    const [, dd, mm, yyyy, hh = "0", mi = "0"] = m1
    return new Date(+yyyy, +mm - 1, +dd, +hh, +mi)
  }

  return null
}

function parseNum(v: unknown): number {
  const s = String(v ?? "").replace(/[^\d,.-]/g, "").replace(",", ".")
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export function parseFupCsv(csv: string): {
  tarefas: TarefaRaw[]
  erros: string[]
  colunas: ImportPreview["colunas_detectadas"]
} {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const headers = result.meta.fields ?? []
  const erros: string[] = result.errors.slice(0, 5).map((e) => e.message)

  const colIdTarefa = findCol(headers, "id", "tarefa") ?? findCol(headers, "tarefa")
  const colData = findCol(headers, "data")
  const colEmpresa = findCol(headers, "empresa")
  const colStatusTarefa =
    findCol(headers, "status", "tarefa") ??
    findCol(headers, "status da tarefa") ??
    findCol(headers, "status")
  const colNomeChapa =
    findCol(headers, "nome", "chapa") ??
    findCol(headers, "nome chapa") ??
    findCol(headers, "nome")
  const colTelefone =
    findCol(headers, "telefone", "chapa") ??
    findCol(headers, "telefone")
  const colQtd =
    findCol(headers, "quantidade", "chapa") ??
    findCol(headers, "quantidade") ??
    findCol(headers, "qtd")
  const colStatusFup =
    findCol(headers, "status", "fup") ??
    findCol(headers, "fup") ??
    findCol(headers, "status fup")
  const colCidade = findCol(headers, "cidade") ?? findCol(headers, "uf")

  const colunas: ImportPreview["colunas_detectadas"] = {
    id_tarefa: colIdTarefa,
    data_tarefa: colData,
    empresa: colEmpresa,
    status_tarefa: colStatusTarefa,
    nome_chapa: colNomeChapa,
    telefone_chapa: colTelefone,
    quantidade_chapas: colQtd,
    status_fup: colStatusFup,
  }

  if (!colData || !colNomeChapa || !colEmpresa) {
    erros.push("Colunas obrigatórias não encontradas: Data, Nome do Chapa, Empresa")
    return { tarefas: [], erros, colunas }
  }

  const tarefas: TarefaRaw[] = []

  for (const row of result.data) {
    const nome = (colNomeChapa ? row[colNomeChapa] : "").trim()
    if (!nome || nome.length < 2) continue

    const rawData = colData ? row[colData] : ""
    const data = parseDate(rawData)
    if (!data) continue

    const statusFup = colStatusFup ? normStr(row[colStatusFup]) : ""
    const statusTarefa = colStatusTarefa ? normStr(row[colStatusTarefa]) : ""

    tarefas.push({
      id_tarefa: colIdTarefa ? String(row[colIdTarefa] ?? "").trim() : "",
      data_tarefa: data,
      hora: data.getHours(),
      dia_semana: data.getDay(),
      cidade_uf: colCidade ? String(row[colCidade] ?? "").trim() : "",
      empresa: colEmpresa ? String(row[colEmpresa] ?? "").trim() : "",
      status_tarefa: statusTarefa,
      nome_chapa: nome,
      nome_chapa_norm: nome
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
      telefone_chapa: colTelefone ? String(row[colTelefone] ?? "").replace(/\D/g, "") : "",
      quantidade_chapas: colQtd ? parseNum(row[colQtd]) : 0,
      status_fup: statusFup,
    })
  }

  return { tarefas, erros, colunas }
}

export function parsePoolCsv(csv: string): PoolChapa[] {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    delimiter: ";",
    transformHeader: (h) => h.trim(),
  })

  const headers = result.meta.fields ?? []
  const colNome = findCol(headers, "nome")
  const colSobrenome = findCol(headers, "sobrenome")
  const colCpf = findCol(headers, "cpf")
  const colTel = findCol(headers, "telefone") ?? findCol(headers, "tel")

  return result.data.map((row) => {
    const nome = colNome ? String(row[colNome] ?? "").trim() : ""
    const sobrenome = colSobrenome ? String(row[colSobrenome] ?? "").trim() : ""
    const cpf = colCpf ? String(row[colCpf] ?? "").replace(/\D/g, "") : ""
    const telefone = colTel ? String(row[colTel] ?? "").replace(/\D/g, "") : ""
    return {
      nome_completo: [nome, sobrenome].filter(Boolean).join(" "),
      cpf,
      telefone,
    } as PoolChapa
  }).filter((p) => p.nome_completo.length > 1)
}

export function buildPreview(
  tarefas: TarefaRaw[],
  erros: string[],
  colunas: ImportPreview["colunas_detectadas"],
): ImportPreview {
  if (tarefas.length === 0) {
    return {
      empresas: [],
      periodo_inicio: new Date(),
      periodo_fim: new Date(),
      total_linhas: 0,
      total_chapas_unicos: 0,
      colunas_detectadas: colunas,
      erros,
    }
  }

  const empresasSet = new Set(tarefas.map((t) => t.empresa).filter(Boolean))
  const datas = tarefas.map((t) => t.data_tarefa.getTime())
  const nomes = new Set(tarefas.map((t) => t.nome_chapa_norm))

  return {
    empresas: [...empresasSet],
    periodo_inicio: new Date(Math.min(...datas)),
    periodo_fim: new Date(Math.max(...datas)),
    total_linhas: tarefas.length,
    total_chapas_unicos: nomes.size,
    colunas_detectadas: colunas,
    erros,
  }
}

export type FillRateEntry = { solicitados: number; atendidos: number }

export function parseFillRateCsv(csv: string): Map<string, FillRateEntry> {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const headers = result.meta.fields ?? []
  const colId = findCol(headers, "tarefa")
  const colEmpresa = findCol(headers, "nome", "fantasia") ?? findCol(headers, "empresa")
  const colData = findCol(headers, "data")
  const colSolicit = findCol(headers, "solicitado")
  const colAtend = findCol(headers, "atendido")

  const map = new Map<string, FillRateEntry>()

  for (const row of result.data) {
    const solicitados = colSolicit ? parseInt(String(row[colSolicit] ?? "0").replace(/[^\d]/g, "") || "0", 10) : 0
    const atendidos = colAtend ? parseInt(String(row[colAtend] ?? "0").replace(/[^\d]/g, "") || "0", 10) : 0
    if (solicitados === 0) continue

    // Primary key: id_tarefa
    if (colId) {
      const id = String(row[colId] ?? "").trim()
      if (id) { map.set(id, { solicitados, atendidos }); continue }
    }
    // Fallback key: empresa+data
    if (colEmpresa && colData) {
      const empresa = String(row[colEmpresa] ?? "").trim().toLowerCase()
      const data = parseDate(String(row[colData] ?? ""))
      if (empresa && data) {
        const key = `${empresa}::${data.toISOString().slice(0, 10)}`
        // Accumulate if same empresa+data
        const prev = map.get(key)
        if (prev) {
          map.set(key, { solicitados: prev.solicitados + solicitados, atendidos: prev.atendidos + atendidos })
        } else {
          map.set(key, { solicitados, atendidos })
        }
      }
    }
  }

  return map
}

// Computes overall operational fill rate from the fill rate CSV.
// This is a task-level metric (total vagas delivered / total vagas requested),
// not an individual chapa metric.
export function calcularFillRateOperacional(fillRateMap: Map<string, FillRateEntry>): number | null {
  if (fillRateMap.size === 0) return null
  let totalSolicitados = 0
  let totalAtendidos = 0
  for (const entry of fillRateMap.values()) {
    totalSolicitados += entry.solicitados
    totalAtendidos += entry.atendidos
  }
  return totalSolicitados > 0 ? totalAtendidos / totalSolicitados : null
}

export function enrichWithFillRate(tarefas: TarefaRaw[], fillRateMap: Map<string, FillRateEntry>): TarefaRaw[] {
  return tarefas.map((t) => {
    const byId = t.id_tarefa ? fillRateMap.get(t.id_tarefa) : undefined
    const byKey = fillRateMap.get(`${t.empresa.toLowerCase()}::${t.data_tarefa.toISOString().slice(0, 10)}`)
    const entry = byId ?? byKey
    if (!entry) return t
    return { ...t, quantidade_chapas: entry.solicitados }
  })
}

export function enrichWithPool(tarefas: TarefaRaw[], pool: PoolChapa[]): Map<string, string> {
  // Returns norm_nome → cpf mapping from pool
  const normToPool = new Map<string, string>()

  const norm = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()

  for (const p of pool) {
    if (p.cpf) normToPool.set(norm(p.nome_completo), p.cpf)
  }

  // Also map by phone
  const telToCpf = new Map<string, string>()
  for (const p of pool) {
    if (p.cpf && p.telefone) telToCpf.set(p.telefone, p.cpf)
  }

  const result = new Map<string, string>() // norm_nome → cpf
  const chapas = new Set(tarefas.map((t) => t.nome_chapa_norm))

  for (const nome_norm of chapas) {
    const cpfByName = normToPool.get(nome_norm)
    if (cpfByName) {
      result.set(nome_norm, cpfByName)
      continue
    }
    // Try phone match
    const tel = tarefas.find((t) => t.nome_chapa_norm === nome_norm)?.telefone_chapa
    if (tel) {
      const cpfByTel = telToCpf.get(tel)
      if (cpfByTel) result.set(nome_norm, cpfByTel)
    }
  }

  return result
}
