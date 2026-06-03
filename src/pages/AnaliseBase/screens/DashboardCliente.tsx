import { useState } from "react"
import { AlertTriangle, TrendingUp, Users, Activity, ChevronDown, ChevronUp, Calendar, X, Sparkles, Copy, Check } from "lucide-react"
import { KpiCard } from "../components/KpiCard"
import { SparklineFillRate } from "../components/SparklineFillRate"
import { HeatmapTurnos } from "../components/HeatmapTurnos"
import { CategoryBadge } from "../components/CategoryBadge"
import type { AnaliseResultado, ListaTipo, Categoria, Snapshot } from "../types"
import { CATEGORIA_LABEL } from "../modules/M4_classificacao"
import { isOllamaRunning, isModelAvailable, generate } from "../ai/ollama-client"
import { SYSTEM_DASHBOARD, SYSTEM_COMPARACAO, buildDashboardContext, buildComparacaoContext } from "../ai/prompts"
import { OLLAMA_MODEL } from "../ai/types"

type Props = {
  resultado: AnaliseResultado
  onVerLista: (tipo: ListaTipo) => void
  onVerFicha: (nomeNorm: string) => void
  snapshots?: Snapshot[]
}

const LISTA_BUTTONS: { tipo: ListaTipo; label: string; emoji: string; hint: string }[] = [
  { tipo: "pilares_conversa", label: "Pilares", emoji: "🏆", hint: "Chapas de alto desempenho — agendar conversa 1:1 para reter" },
  { tipo: "em_risco_ligar", label: "Em Risco", emoji: "⚠️", hint: "Eram bons e sumiram — ligar hoje antes de virarem dormentes" },
  { tipo: "dormentes_recuperaveis", label: "Dormentes", emoji: "💤", hint: "Parados há 30–60 dias com histórico — janela de reativação" },
  { tipo: "novos_padrinho", label: "Novos", emoji: "🌱", hint: "Entraram há menos de 30 dias — indicar um padrinho para fixar" },
  { tipo: "fantasmas_limpeza", label: "Fantasmas", emoji: "👻", hint: "Inativos há 3+ meses — candidatos a limpeza de cadastro" },
  { tipo: "mono_orfaos", label: "Mono-Turno", emoji: "⚡", hint: "Só trabalham em 1 turno — migrar antes de o turno ser cortado" },
  { tipo: "candidatos_bonificacao", label: "Bonificação", emoji: "🎯", hint: "Estão na borda da meta semanal — empurrão de incentivo resolve" },
]

const CATEGORIAS_ORDER: Categoria[] = ["pilar", "frequente", "casual", "novo", "em_risco", "dormente", "fantasma"]

const CATEGORIA_DESC: Record<Categoria, string> = {
  pilar: "trabalha toda semana, fill rate alto — o núcleo da operação",
  frequente: "regular, mas abaixo do ritmo de pilar",
  casual: "aparece esporadicamente, poucos dias no mês",
  novo: "primeira tarefa há menos de 30 dias",
  em_risco: "era bom, mas sumiu recentemente — janela de recuperação",
  dormente: "parou há 30–89 dias, tem histórico positivo",
  fantasma: "inativo há 3+ meses ou nunca trabalhou de fato",
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

export function DashboardCliente({ resultado, onVerLista, onVerFicha, snapshots = [] }: Props) {
  const [expandConc, setExpandConc] = useState(false)
  const [showEscala, setShowEscala] = useState(false)

  // Âncoras 03 + 04 — IA
  const [ia03Open, setIa03Open] = useState(false)
  const [ia03Text, setIa03Text] = useState("")
  const [ia03Loading, setIa03Loading] = useState(false)
  const [ia04Text, setIa04Text] = useState("")
  const [ia04Loading, setIa04Loading] = useState(false)
  const [iaCopied, setIaCopied] = useState(false)

  // Previous snapshot of same client for Âncora 04
  const prevSnapshot = snapshots
    .filter((s) => s.cliente === resultado.cliente && s.id !== resultado.snapshot_id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  async function checkIA() {
    const running = await isOllamaRunning()
    if (!running) { throw new Error("Ollama offline — inicie em Configurações") }
    const hasModel = await isModelAvailable(OLLAMA_MODEL)
    if (!hasModel) { throw new Error(`Modelo ${OLLAMA_MODEL} não encontrado — baixe em Configurações`) }
  }

  async function handleIA03() {
    try {
      await checkIA()
    } catch (e) {
      alert(String(e))
      return
    }
    setIa03Open(true)
    setIa03Text("")
    setIa03Loading(true)
    try {
      const ctx = buildDashboardContext(resultado)
      await generate(ctx, SYSTEM_DASHBOARD, (token) => setIa03Text((prev) => prev + token))
    } catch {
      setIa03Text("Erro ao gerar briefing. Verifique se o Ollama está rodando.")
    } finally {
      setIa03Loading(false)
    }
  }

  async function handleIA04() {
    if (!prevSnapshot) return
    try {
      await checkIA()
    } catch (e) {
      alert(String(e))
      return
    }
    setIa04Text("Gerando…")
    setIa04Loading(true)
    try {
      const anteriorCats: Record<string, number> = {}
      const configPrev = prevSnapshot.configuracoes ? JSON.parse(prevSnapshot.configuracoes) : {}
      const ctx = buildComparacaoContext(resultado, anteriorCats, prevSnapshot.periodo_fim)
      let full = ""
      await generate(ctx, SYSTEM_COMPARACAO, (token) => {
        full += token
        setIa04Text(full)
      })
    } catch {
      setIa04Text("Erro ao gerar comparação.")
    } finally {
      setIa04Loading(false)
    }
  }

  function copyIA03() {
    navigator.clipboard.writeText(ia03Text).then(() => {
      setIaCopied(true)
      setTimeout(() => setIaCopied(false), 2000)
    })
  }

  const { chapas, concentracao, cohort, listas, turnos } = resultado

  // KPIs
  const totalFinalizado = chapas.reduce((s, c) => s + c.total_finalizado, 0)
  const totalTarefas = chapas.reduce((s, c) => s + c.total_tarefas, 0)
  // Prefer CSV-based operational fill rate (vagas solicitadas × atendidas por tarefa).
  // Fall back to individual average (tarefas finalizadas / tarefas no período por chapa).
  const fillRateOperacionalCsv = resultado.fill_rate_operacional != null ? resultado.fill_rate_operacional * 100 : null
  const fillRateIndividual = totalTarefas > 0 ? (totalFinalizado / totalTarefas) * 100 : 0
  const fillRateGeral = fillRateOperacionalCsv ?? fillRateIndividual
  const fillRateFonte = fillRateOperacionalCsv != null ? "via CSV Fill Rate" : "via FUP — carregue o CSV de Fill Rate para maior precisão"

  const pilares = chapas.filter((c) => c.categoria === "pilar").length
  const emRisco = chapas.filter((c) => c.categoria === "em_risco").length

  // Severity
  const fillSeverity =
    fillRateGeral >= 85 ? "ok" : fillRateGeral >= 70 ? "warning" : "danger"
  const concentSeverity =
    concentracao.top5_pct < 0.4 ? "ok" : concentracao.top5_pct < 0.6 ? "warning" : "danger"
  const churnSeverity =
    cohort.churn_mensal < 0.15 ? "ok" : cohort.churn_mensal < 0.3 ? "warning" : "danger"

  // Category distribution
  const catCounts = new Map<Categoria, number>()
  for (const c of chapas) catCounts.set(c.categoria, (catCounts.get(c.categoria) ?? 0) + 1)

  // SPOF alerts
  const spofs = concentracao.spof_turnos.slice(0, 3)

  // Escala de contato — agrega dias_preferidos de Em Risco + Dormentes
  const escalaChapas = chapas.filter((c) => c.categoria === "em_risco" || c.categoria === "dormente")
  const escalaDias: { dia: number; label: string; total: number; categorias: Record<string, number> }[] = [0, 1, 2, 3, 4, 5, 6]
    .map((dia) => {
      const match = escalaChapas.filter((c) => c.dias_preferidos.includes(dia))
      const cats: Record<string, number> = {}
      for (const c of match) cats[c.categoria] = (cats[c.categoria] ?? 0) + 1
      return { dia, label: DIAS_SEMANA[dia], total: match.length, categorias: cats }
    })
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-xl text-foreground">{resultado.cliente}</h2>
          <p className="text-sm text-muted-foreground">
            {resultado.periodo_inicio.toLocaleDateString("pt-BR")} — {resultado.periodo_fim.toLocaleDateString("pt-BR")} ·{" "}
            {resultado.total_chapas} chapas · {resultado.total_tarefas_unicas} tarefas
          </p>
        </div>
        <button
          type="button"
          onClick={handleIA03}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5" /> Foco da semana
        </button>
      </div>

      {/* Âncora 04 — Comparação semanal */}
      {prevSnapshot && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              {ia04Text && !ia04Loading ? (
                <p className="text-sm text-foreground leading-snug">{ia04Text}</p>
              ) : ia04Loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  {ia04Text || "Gerando comparação…"}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Snapshot anterior: {prevSnapshot.periodo_fim} · comparar mudanças desta semana
                </p>
              )}
            </div>
            {!ia04Text && !ia04Loading && (
              <button
                type="button"
                onClick={handleIA04}
                className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
              >
                Comparar
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Fill Rate Operacional"
          value={`${fillRateGeral.toFixed(1)}%`}
          caption={`vagas preenchidas ÷ vagas solicitadas · ${fillRateFonte}`}
          severity={fillSeverity}
        />
        <KpiCard
          label="Chapas Pilares"
          value={pilares}
          caption={`de ${chapas.length} chapas · pilares trabalham toda semana com fill rate alto`}
          severity={pilares > 0 ? "ok" : "danger"}
        />
        <KpiCard
          label="Concentração Top 5"
          value={`${(concentracao.top5_pct * 100).toFixed(0)}%`}
          caption="da operação nas mãos dos 5 principais chapas — risco se algum sair"
          severity={concentSeverity}
        />
        <KpiCard
          label="Churn Mensal"
          value={`${(cohort.churn_mensal * 100).toFixed(0)}%`}
          caption={`dos chapas ativos que não voltam no mês seguinte · vida média ${cohort.tempo_medio_vida_dias} dias`}
          severity={churnSeverity}
        />
      </div>

      {/* Alerts */}
      {(emRisco > 0 || spofs.length > 0) && (
        <div className="space-y-2">
          {emRisco > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <p className="text-sm text-warning font-medium">
                {emRisco} chapa{emRisco > 1 ? "s" : ""} Em Risco —{" "}
                <button type="button" onClick={() => onVerLista("em_risco_ligar")} className="underline hover:no-underline">
                  ver lista
                </button>
              </p>
            </div>
          )}
          {spofs.map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">
                <strong>Ponto crítico:</strong> {s.chapa_nome} cobre {(s.pct_turno * 100).toFixed(0)}% das vagas do turno {s.turno_nome} — se sair, o turno perde capacidade de imediato
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Visualizações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribuição de categorias */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Distribuição de Categorias</p>
          </div>
          <div className="space-y-2">
            {CATEGORIAS_ORDER.map((cat) => {
              const cnt = catCounts.get(cat) ?? 0
              if (cnt === 0) return null
              const pct = (cnt / chapas.length) * 100
              return (
                <div key={cat} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <CategoryBadge categoria={cat} size="sm" />
                    <span className="text-muted-foreground font-mono">{cnt} ({pct.toFixed(0)}%)</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 leading-tight pl-0.5">{CATEGORIA_DESC[cat]}</p>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-0.5">
                    <div
                      className="h-full rounded-full bg-primary/70 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Heatmap */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Volume por Turno e Dia</p>
            </div>
            <span className="text-[10px] text-muted-foreground">cor mais forte = mais tarefas</span>
          </div>
          <HeatmapTurnos tarefas={chapas.flatMap((c) => c.tarefas_raw)} turnos={turnos} />
        </div>
      </div>

      {/* Sparkline */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Fill Rate por Mês</p>
          </div>
          <span className="text-[10px] text-muted-foreground">% de vagas preenchidas · linha tracejada = meta (85%)</span>
        </div>
        <SparklineFillRate tarefas={chapas.flatMap((c) => c.tarefas_raw)} />
      </div>

      {/* Concentração expandível */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandConc(!expandConc)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <p className="text-sm font-semibold text-foreground">
            Concentração — Top {concentracao.ranking.length} Chapas
          </p>
          {expandConc ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {expandConc && (
          <div className="border-t border-border">
            <div className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-border/50 text-xs text-muted-foreground font-medium">
              <span>Top 5</span><span>Top 10</span><span>Top 20</span>
            </div>
            <div className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-border/50">
              {[concentracao.top5_pct, concentracao.top10_pct, concentracao.top20_pct].map((p, i) => (
                <span key={i} className="text-lg font-display font-bold tabular-nums text-foreground">
                  {(p * 100).toFixed(0)}%
                </span>
              ))}
            </div>
            <div className="divide-y divide-border/50">
              {concentracao.ranking.slice(0, 10).map((r, i) => (
                <button
                  key={r.nome}
                  type="button"
                  onClick={() => onVerFicha(r.nome.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim())}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors text-left"
                >
                  <span className="text-xs text-muted-foreground font-mono w-4">{i + 1}</span>
                  <span className="flex-1 text-sm text-foreground truncate">{r.nome}</span>
                  <span className="text-xs font-mono text-muted-foreground">{(r.pct_total * 100).toFixed(1)}%</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal IA — Âncora 03 */}
      {ia03Open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setIa03Open(false)}>
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="h-1 bg-primary shrink-0" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-white">Foco da Semana — {resultado.cliente}</p>
              </div>
              <div className="flex items-center gap-2">
                {ia03Text && (
                  <button
                    type="button"
                    onClick={copyIA03}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
                  >
                    {iaCopied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                    {iaCopied ? "Copiado" : "Copiar"}
                  </button>
                )}
                <button type="button" onClick={() => setIa03Open(false)} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {ia03Loading && !ia03Text && (
                <div className="flex items-center gap-2 text-neutral-500 text-sm">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Gerando briefing…
                </div>
              )}
              {ia03Text ? (
                <div className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap font-mono">
                  {ia03Text.split(/(\[PANORAMA\]|\[PRIORIDADE\]|\[RISCOS\])/).map((part, i) => {
                    if (/^\[.+\]$/.test(part)) return (
                      <p key={i} className="text-[10px] font-bold text-primary uppercase tracking-widest mt-4 mb-1 first:mt-0">{part.replace(/\[|\]/g, "")}</p>
                    )
                    return <span key={i}>{part}</span>
                  })}
                  {ia03Loading && <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-0.5 align-middle" />}
                </div>
              ) : !ia03Loading && (
                <p className="text-neutral-500 text-sm">Sem conteúdo gerado.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal — Sugestão de escala */}
      {showEscala && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-sm font-semibold text-foreground">Sugestão de Escala de Contato</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Baseado nos dias preferidos de {escalaChapas.length} chapas Em Risco e Dormentes
                </p>
              </div>
              <button type="button" onClick={() => setShowEscala(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              {escalaDias.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Sem padrão de dias identificado nos chapas Em Risco e Dormentes.
                </p>
              ) : (
                <div className="space-y-2">
                  {escalaDias.map((d) => (
                    <div key={d.dia} className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-foreground w-8 shrink-0">{d.label}</span>
                      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full flex items-center px-2"
                          style={{ width: `${Math.max(20, (d.total / (escalaDias[0]?.total || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground font-mono w-24 shrink-0 text-right">
                        {d.total} chapa{d.total > 1 ? "s" : ""}
                        {d.categorias["em_risco"] ? ` · ${d.categorias["em_risco"]} risco` : ""}
                      </span>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground/70 pt-2 border-t border-border/50">
                    Dias ordenados por quantidade de chapas responsivos. Priorize os primeiros.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Listas acionáveis */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Listas Acionáveis</p>
          {escalaChapas.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEscala(true)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1 hover:bg-muted/40 transition-colors"
            >
              <Calendar className="h-3 w-3" /> Sugestão de escala
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {LISTA_BUTTONS.map(({ tipo, label, emoji, hint }) => {
            const lista = listas.find((l) => l.tipo === tipo)
            const count = lista?.chapas.length ?? 0
            return (
              <button
                key={tipo}
                type="button"
                onClick={() => onVerLista(tipo)}
                disabled={count === 0}
                title={hint}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-4 hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="text-xl">{emoji}</span>
                <span className="text-xs font-medium text-foreground text-center leading-tight">{label}</span>
                <span className="text-lg font-display font-bold tabular-nums text-foreground">{count}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
