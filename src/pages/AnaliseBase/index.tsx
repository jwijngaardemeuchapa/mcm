import { useCallback, useEffect, useState } from "react"
import {
  Upload,
  LayoutDashboard,
  List,
  Settings,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Importacao } from "./screens/Importacao"
import { DashboardCliente } from "./screens/DashboardCliente"
import { FichaChapa } from "./screens/FichaChapa"
import { ListaAcionavel } from "./screens/ListaAcionavel"
import { Configuracoes } from "./screens/Configuracoes"
import { listSnapshots, loadSnapshot, getConfig, saveConfig } from "./db/queries"
import type {
  AnaliseResultado,
  ConfigAnalise,
  Snapshot,
  ListaTipo,
} from "./types"
import { DEFAULT_CONFIG } from "./types"

type Screen =
  | { id: "importacao" }
  | { id: "dashboard" }
  | { id: "ficha"; nomeNorm: string }
  | { id: "lista"; tipo: ListaTipo }
  | { id: "configuracoes" }

const NAV_ITEMS = [
  { id: "importacao", label: "Importar", icon: Upload },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "lista", label: "Listas", icon: List },
  { id: "configuracoes", label: "Config.", icon: Settings },
] as const

export default function AnaliseBase() {
  const [screen, setScreen] = useState<Screen>({ id: "importacao" })
  const [resultado, setResultado] = useState<AnaliseResultado | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [config, setConfig] = useState<ConfigAnalise>(DEFAULT_CONFIG)

  useEffect(() => {
    listSnapshots().then(setSnapshots).catch(() => {})
    getConfig().then((c) => { if (c) setConfig(c) }).catch(() => {})
  }, [])

  const handleAnaliseCompleta = useCallback((r: AnaliseResultado) => {
    setResultado(r)
    setScreen({ id: "dashboard" })
  }, [])

  const handleLoadSnapshot = useCallback(async (id: string) => {
    try {
      const data = await loadSnapshot(id)
      if (!data) { toast.error("Análise não encontrada"); return }
      const { snapshot, chapas } = data

      // Reconstruct partial resultado from DB (without full tarefas_raw pipeline)
      const r: AnaliseResultado = {
        snapshot_id: snapshot.id,
        cliente: snapshot.cliente,
        periodo_inicio: new Date(snapshot.periodo_inicio),
        periodo_fim: new Date(snapshot.periodo_fim),
        total_tarefas_unicas: snapshot.total_tarefas,
        total_chapas: snapshot.total_chapas,
        turnos: [],
        chapas,
        concentracao: {
          top5_pct: 0,
          top10_pct: 0,
          top20_pct: 0,
          spof_turnos: [],
          ranking: chapas.slice(0, 30).map((c) => ({
            nome: c.nome,
            pct_total: c.concentracao_pct,
            pct_turno_principal: 0,
          })),
        },
        cohort: {
          cohorts: [],
          churn_mensal: 0,
          churn_trimestral: 0,
          tempo_medio_vida_dias: 0,
          mediana_tarefas_para_casual: 0,
          mediana_tarefas_para_frequente: 0,
        },
        listas: [],
        config: snapshot.configuracoes ? JSON.parse(snapshot.configuracoes) : config,
      }

      setResultado(r)
      setScreen({ id: "dashboard" })
      toast.success(`Análise de ${snapshot.cliente} carregada`)
    } catch (e) {
      toast.error(`Erro ao carregar: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [config])

  const handleVerLista = useCallback((tipo: ListaTipo) => {
    setScreen({ id: "lista", tipo })
  }, [])

  const handleVerFicha = useCallback((nomeNorm: string) => {
    setScreen({ id: "ficha", nomeNorm })
  }, [])

  const handleConfigChange = useCallback((c: ConfigAnalise) => {
    setConfig(c)
    saveConfig(c).catch(() => {})
  }, [])

  const navId =
    screen.id === "ficha" ? "dashboard" :
    screen.id === "lista" ? "lista" :
    screen.id

  return (
    <div className="flex flex-col h-full">
      {/* Top nav */}
      <div className="border-b border-border bg-card px-4 md:px-6">
        <div className="flex items-center gap-1 max-w-5xl mx-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = navId === id
            const disabled = (id === "dashboard" || id === "lista") && !resultado
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (id === "lista" && resultado) setScreen({ id: "lista", tipo: "pilares_conversa" })
                  else setScreen({ id: id as Screen["id"] } as Screen)
                }}
                className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          })}
          {resultado && (
            <div className="ml-auto flex items-center gap-1.5 py-3">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate max-w-[160px]">{resultado.cliente}</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto">
          {screen.id === "importacao" && (
            <Importacao
              config={config}
              snapshots={snapshots}
              onAnaliseCompleta={handleAnaliseCompleta}
              onLoadSnapshot={handleLoadSnapshot}
              onSnapshotsChange={setSnapshots}
            />
          )}
          {screen.id === "dashboard" && resultado && (
            <DashboardCliente
              resultado={resultado}
              onVerLista={handleVerLista}
              onVerFicha={handleVerFicha}
              snapshots={snapshots}
            />
          )}
          {screen.id === "ficha" && resultado && (
            <FichaChapa
              resultado={resultado}
              chapaSearch={screen.nomeNorm}
              onVoltar={() => setScreen({ id: "dashboard" })}
            />
          )}
          {screen.id === "lista" && resultado && (
            <ListaAcionavel
              resultado={resultado}
              tipoAtivo={screen.tipo}
              onVerFicha={handleVerFicha}
              onVoltar={() => setScreen({ id: "dashboard" })}
            />
          )}
          {screen.id === "configuracoes" && (
            <Configuracoes
              config={config}
              snapshots={snapshots}
              onConfigChange={handleConfigChange}
              onSnapshotsChange={setSnapshots}
              onLoadSnapshot={handleLoadSnapshot}
            />
          )}
        </div>
      </div>
    </div>
  )
}
