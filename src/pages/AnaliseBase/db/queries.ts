import { getDb, uuid } from "@/lib/db"
import type {
  Snapshot,
  ChapaClassificado,
  AnaliseResultado,
  ConfigAnalise,
  Categoria,
  FlagTipo,
} from "../types"

export async function listSnapshots(): Promise<Snapshot[]> {
  const db = await getDb()
  return db.select<Snapshot[]>(
    "SELECT * FROM analise_snapshots ORDER BY created_at DESC",
  )
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await getDb()
  await db.execute("DELETE FROM analise_snapshots WHERE id = ?", [id])
}

export async function saveResultado(resultado: AnaliseResultado): Promise<string> {
  const db = await getDb()
  const id = resultado.snapshot_id

  await db.execute(
    `INSERT OR REPLACE INTO analise_snapshots
     (id, cliente, periodo_inicio, periodo_fim, total_tarefas, total_chapas, configuracoes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      resultado.cliente,
      resultado.periodo_inicio.toISOString().slice(0, 10),
      resultado.periodo_fim.toISOString().slice(0, 10),
      resultado.total_tarefas_unicas,
      resultado.total_chapas,
      JSON.stringify(resultado.config),
      new Date().toISOString(),
    ],
  )

  // Insert chapas in batches of 50
  const batches: ChapaClassificado[][] = []
  for (let i = 0; i < resultado.chapas.length; i += 50) {
    batches.push(resultado.chapas.slice(i, i + 50))
  }
  for (const batch of batches) {
    for (const c of batch) {
      await db.execute(
        `INSERT OR REPLACE INTO analise_chapas
         (id, snapshot_id, nome, telefone, cpf, categoria, score,
          total_finalizado, total_cancelado, recencia_dias, frequencia_semanal,
          fill_rate_individual, turno_perfil, tendencia, metricas_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          id,
          c.nome,
          c.telefone ?? null,
          c.cpf ?? null,
          c.categoria,
          c.score,
          c.total_finalizado,
          c.total_cancelado,
          c.recencia_dias,
          c.frequencia_semanal,
          c.fill_rate_individual,
          c.turno_perfil,
          c.tendencia,
          JSON.stringify({
            turno_distribuicao: c.turno_distribuicao,
            turno_principal: c.turno_principal,
            dias_preferidos: c.dias_preferidos,
            concentracao_pct: c.concentracao_pct,
          }),
        ],
      )
    }
  }

  return id
}

export async function loadSnapshot(snapshotId: string): Promise<{
  snapshot: Snapshot
  chapas: ChapaClassificado[]
} | null> {
  const db = await getDb()

  const [snapshot] = await db.select<Snapshot[]>(
    "SELECT * FROM analise_snapshots WHERE id = ?",
    [snapshotId],
  )
  if (!snapshot) return null

  const rows = await db.select<{
    nome: string; telefone: string | null; cpf: string | null
    categoria: string; score: number; total_finalizado: number; total_cancelado: number
    recencia_dias: number; frequencia_semanal: number; fill_rate_individual: number
    turno_perfil: string; tendencia: string; metricas_json: string | null
  }[]>(
    "SELECT * FROM analise_chapas WHERE snapshot_id = ? ORDER BY score DESC",
    [snapshotId],
  )

  const chapas = rows.map((r) => {
    let extra: any = {}
    try { extra = r.metricas_json ? JSON.parse(r.metricas_json) : {} } catch { /* */ }
    return {
      nome: r.nome,
      nome_norm: r.nome.toLowerCase(),
      telefone: r.telefone,
      cpf: r.cpf,
      categoria: r.categoria as ChapaClassificado["categoria"],
      score: r.score,
      total_finalizado: r.total_finalizado,
      total_cancelado: r.total_cancelado,
      total_tarefas: r.total_finalizado + r.total_cancelado,
      recencia_dias: r.recencia_dias,
      frequencia_semanal: r.frequencia_semanal,
      fill_rate_individual: r.fill_rate_individual,
      turno_perfil: r.turno_perfil as ChapaClassificado["turno_perfil"],
      tendencia: r.tendencia as ChapaClassificado["tendencia"],
      turno_distribuicao: extra.turno_distribuicao ?? [],
      turno_principal: extra.turno_principal ?? null,
      dias_preferidos: extra.dias_preferidos ?? [],
      dias_evitados: [],
      concentracao_pct: extra.concentracao_pct ?? 0,
      era_pilar_60d: false,
      era_frequente_60d: false,
      primeira_tarefa: new Date(snapshot.periodo_inicio),
      ultima_tarefa: new Date(snapshot.periodo_fim),
      tarefas_raw: [],
    } as ChapaClassificado
  })

  return { snapshot, chapas }
}

export async function saveAnotacao(
  snapshotId: string,
  chapaNome: string,
  texto: string,
): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO analise_anotacoes (id, chapa_nome, snapshot_id, texto, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [uuid(), chapaNome, snapshotId, texto, new Date().toISOString()],
  )
}

export async function loadAnotacoes(snapshotId: string, chapaNome: string) {
  const db = await getDb()
  return db.select<{ id: string; texto: string; created_at: string }[]>(
    "SELECT id, texto, created_at FROM analise_anotacoes WHERE snapshot_id = ? AND chapa_nome = ? ORDER BY created_at DESC",
    [snapshotId, chapaNome],
  )
}

export async function getConfig(): Promise<ConfigAnalise | null> {
  try {
    const db = await getDb()
    const [row] = await db.select<{ valor: string }[]>(
      "SELECT valor FROM analise_config WHERE chave = 'default'",
    )
    return row ? JSON.parse(row.valor) : null
  } catch {
    return null
  }
}

export async function saveConfig(config: ConfigAnalise): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT OR REPLACE INTO analise_config (chave, valor) VALUES ('default', ?)`,
    [JSON.stringify(config)],
  )
}

export async function getFlag(
  chapaNome: string,
  empresa: string,
): Promise<{ id: string; flag: FlagTipo; nota: string | null } | null> {
  const db = await getDb()
  const [row] = await db.select<{ id: string; flag: string; nota: string | null }[]>(
    "SELECT id, flag, nota FROM analise_flags WHERE chapa_nome = ? AND empresa = ? ORDER BY created_at DESC LIMIT 1",
    [chapaNome, empresa],
  )
  return row ? { id: row.id, flag: row.flag as FlagTipo, nota: row.nota } : null
}

export async function setFlag(
  chapaNome: string,
  empresa: string,
  flag: FlagTipo,
  nota?: string,
): Promise<void> {
  const db = await getDb()
  await db.execute("DELETE FROM analise_flags WHERE chapa_nome = ? AND empresa = ?", [chapaNome, empresa])
  await db.execute(
    "INSERT INTO analise_flags (id, chapa_nome, empresa, flag, nota, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [uuid(), chapaNome, empresa, flag, nota ?? null, new Date().toISOString()],
  )
}

export async function clearFlag(chapaNome: string, empresa: string): Promise<void> {
  const db = await getDb()
  await db.execute("DELETE FROM analise_flags WHERE chapa_nome = ? AND empresa = ?", [chapaNome, empresa])
}

export async function getHistoricoCategoria(
  chapaNome: string,
  cliente: string,
): Promise<{ categoria: string; created_at: string; periodo_inicio: string }[]> {
  const db = await getDb()
  return db.select<{ categoria: string; created_at: string; periodo_inicio: string }[]>(
    `SELECT ac.categoria, s.created_at, s.periodo_inicio
     FROM analise_chapas ac
     JOIN analise_snapshots s ON s.id = ac.snapshot_id
     WHERE ac.nome = ? AND s.cliente = ?
     ORDER BY s.created_at ASC`,
    [chapaNome, cliente],
  )
}

export async function listFlagsForEmpresa(empresa: string): Promise<Map<string, FlagTipo>> {
  const db = await getDb()
  const rows = await db.select<{ chapa_nome: string; flag: string }[]>(
    "SELECT chapa_nome, flag FROM analise_flags WHERE empresa = ?",
    [empresa],
  )
  return new Map(rows.map((r) => [r.chapa_nome, r.flag as FlagTipo]))
}
