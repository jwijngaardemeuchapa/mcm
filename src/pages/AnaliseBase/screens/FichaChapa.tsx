import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Phone, Hash, Send, TrendingUp, TrendingDown, Minus, Sparkles, X, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { CategoryBadge } from "../components/CategoryBadge"
import { saveAnotacao, loadAnotacoes, getFlag, setFlag, clearFlag, getHistoricoCategoria } from "../db/queries"
import type { ChapaClassificado, AnaliseResultado, FlagTipo, LeoMetrics } from "../types"
import { getLeoByPhone } from "../modules/M_leo"
import { CATEGORIA_LABEL } from "../modules/M4_classificacao"
import { isOllamaRunning, isModelAvailable, generate } from "../ai/ollama-client"
import { SYSTEM_FICHA, buildFichaContext } from "../ai/prompts"
import { OLLAMA_MODEL } from "../ai/types"

type Props = {
  resultado: AnaliseResultado
  chapaSearch: string
  onVoltar: () => void
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

const FLAG_CONFIG: Record<FlagTipo, { label: string; cls: string }> = {
  tem_interesse: { label: "Tem interesse", cls: "border-success/40 bg-success/10 text-success" },
  em_processo:   { label: "Em processo",   cls: "border-info/40 bg-info/10 text-info" },
  aguardando:    { label: "Aguardando",    cls: "border-warning/40 bg-warning/10 text-warning" },
  sem_interesse: { label: "Sem interesse", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
}
const FLAG_ORDER: FlagTipo[] = ["tem_interesse", "em_processo", "aguardando", "sem_interesse"]

const TURNO_PERFIL_DESC: Record<string, string> = {
  mono: "só trabalha em 1 turno fixo",
  duo: "transita entre 2 turnos",
  multi: "flexível — atua em 3 ou mais turnos",
}

function TendenciaIcon({ v }: { v: "subindo" | "estavel" | "caindo" }) {
  if (v === "subindo") return <TrendingUp className="h-3.5 w-3.5 text-success" />
  if (v === "caindo") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

export function FichaChapa({ resultado, chapaSearch, onVoltar }: Props) {
  const chapa: ChapaClassificado | undefined = resultado.chapas.find(
    (c) => c.nome_norm === chapaSearch || c.nome.toLowerCase().includes(chapaSearch.toLowerCase()),
  )

  const [nota, setNota] = useState("")
  const [anotacoes, setAnotacoes] = useState<{ id: string; texto: string; created_at: string }[]>([])
  const [loadingNota, setLoadingNota] = useState(false)
  const [flagAtiva, setFlagAtiva] = useState<FlagTipo | null>(null)
  const [savingFlag, setSavingFlag] = useState(false)
  const [historico, setHistorico] = useState<{ categoria: string; created_at: string; periodo_inicio: string }[]>([])
  const [leoData, setLeoData] = useState<LeoMetrics | null>(null)

  // Âncora 01 — IA panel
  const [iaOpen, setIaOpen] = useState(false)
  const [iaText, setIaText] = useState("")
  const [iaLoading, setIaLoading] = useState(false)
  const [iaCopied, setIaCopied] = useState(false)
  const iaAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!chapa) return
    loadAnotacoes(resultado.snapshot_id, chapa.nome).then(setAnotacoes).catch(() => {})
    getFlag(chapa.nome, resultado.cliente).then((f) => setFlagAtiva(f?.flag ?? null)).catch(() => {})
    getHistoricoCategoria(chapa.nome, resultado.cliente).then(setHistorico).catch(() => {})
    getLeoByPhone(chapa.telefone ?? null).then(setLeoData).catch(() => {})
  }, [chapa?.nome, resultado.snapshot_id, resultado.cliente])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (iaOpen) { setIaOpen(false); iaAbortRef.current?.abort() }
        else onVoltar()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onVoltar, iaOpen])

  async function handleIA() {
    if (!chapa) return
    const running = await isOllamaRunning()
    if (!running) { toast.error("Ollama offline — inicie em Configurações"); return }
    const hasModel = await isModelAvailable(OLLAMA_MODEL)
    if (!hasModel) { toast.error(`Modelo ${OLLAMA_MODEL} não encontrado — baixe em Configurações`); return }

    setIaOpen(true)
    setIaText("")
    setIaLoading(true)
    iaAbortRef.current = new AbortController()

    try {
      const ctx = buildFichaContext(chapa, resultado.cliente)
      await generate(ctx, SYSTEM_FICHA, (token) => setIaText((prev) => prev + token))
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        setIaText("Erro ao gerar análise. Verifique se o Ollama está rodando e o modelo está instalado.")
      }
    } finally {
      setIaLoading(false)
    }
  }

  function copyScript() {
    const scriptMatch = iaText.match(/\[SCRIPT\]([\s\S]*?)(?=\[|$)/)
    const text = scriptMatch ? scriptMatch[1].trim() : iaText
    navigator.clipboard.writeText(text).then(() => {
      setIaCopied(true)
      setTimeout(() => setIaCopied(false), 2000)
    })
  }

  async function toggleFlag(flag: FlagTipo) {
    if (!chapa) return
    setSavingFlag(true)
    try {
      if (flagAtiva === flag) {
        await clearFlag(chapa.nome, resultado.cliente)
        setFlagAtiva(null)
      } else {
        await setFlag(chapa.nome, resultado.cliente, flag)
        setFlagAtiva(flag)
      }
    } catch {
      toast.error("Erro ao salvar flag")
    } finally {
      setSavingFlag(false)
    }
  }

  if (!chapa) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Chapa não encontrada.</p>
        <Button variant="outline" className="mt-4" onClick={onVoltar}>Voltar</Button>
      </div>
    )
  }

  async function salvarNota() {
    if (!nota.trim()) return
    setLoadingNota(true)
    try {
      await saveAnotacao(resultado.snapshot_id, chapa!.nome, nota.trim())
      const updated = await loadAnotacoes(resultado.snapshot_id, chapa!.nome)
      setAnotacoes(updated)
      setNota("")
      toast.success("Anotação salva")
    } catch {
      toast.error("Erro ao salvar anotação")
    } finally {
      setLoadingNota(false)
    }
  }

  const tarefasRecentes = [...chapa.tarefas_raw]
    .sort((a, b) => b.data_tarefa.getTime() - a.data_tarefa.getTime())
    .slice(0, 20)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button type="button" onClick={onVoltar} className="mt-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display font-bold text-xl text-foreground">{chapa.nome}</h2>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {chapa.telefone && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {chapa.telefone}
                  </span>
                )}
                {chapa.cpf && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                    <Hash className="h-3 w-3" /> ***{chapa.cpf.slice(-4)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  Desde {chapa.primeira_tarefa.toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <CategoryBadge categoria={chapa.categoria} size="lg" />
                <button
                  type="button"
                  onClick={handleIA}
                  title="Analisar com IA"
                  className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <Sparkles className="h-3 w-3" /> IA
                </button>
              </div>
              <span className={`text-xs font-mono font-bold ${
                chapa.score >= 70 ? "text-success" : chapa.score >= 40 ? "text-warning" : "text-destructive"
              }`}>
                Score {chapa.score}<span className="text-muted-foreground font-normal">/100</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Flags de interesse */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold shrink-0">Interesse:</span>
        {FLAG_ORDER.map((f) => {
          const cfg = FLAG_CONFIG[f]
          const ativo = flagAtiva === f
          return (
            <button
              key={f}
              type="button"
              disabled={savingFlag}
              onClick={() => toggleFlag(f)}
              className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border transition-all disabled:opacity-60 ${
                ativo ? cfg.cls : "border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              {cfg.label}
            </button>
          )
        })}
        {flagAtiva && (
          <span className="text-[10px] text-muted-foreground ml-1">(clique novamente para remover)</span>
        )}
      </div>

      {/* 3 Cards de métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Métricas 90d */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Métricas (período)</p>
          {[
            { label: "Tarefas no período", value: String(chapa.total_tarefas) },
            { label: "Vagas preenchidas", value: String(chapa.total_finalizado) },
            { label: "Dias sem trabalhar", value: `${chapa.recencia_dias} dias` },
            { label: "Freq. semanal", value: `${chapa.frequencia_semanal.toFixed(1)}/sem` },
            { label: "Confiabilidade (fin/total)", value: `${(chapa.fill_rate_individual * 100).toFixed(0)}%` },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs font-mono font-semibold text-foreground">{value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Tendência (últimas semanas)</span>
            <div className="flex items-center gap-1">
              <TendenciaIcon v={chapa.tendencia} />
              <span className="text-xs font-semibold capitalize text-foreground">{chapa.tendencia}</span>
            </div>
          </div>
        </div>

        {/* Perfil de turno */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Perfil de Turno</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${
              chapa.turno_perfil === "mono"
                ? "bg-warning/15 text-warning border-warning/30"
                : chapa.turno_perfil === "duo"
                ? "bg-info/15 text-info border-info/30"
                : "bg-success/15 text-success border-success/30"
            }`}>
              {chapa.turno_perfil.toUpperCase()}
            </span>
            <span className="text-[10px] text-muted-foreground">{TURNO_PERFIL_DESC[chapa.turno_perfil]}</span>
          </div>
          <div className="space-y-1.5 mt-1">
            {chapa.turno_distribuicao.map((td) => (
              <div key={td.turno_id} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{td.turno_nome}</span>
                  <span className="font-mono text-foreground">{(td.pct * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${td.pct * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
            <span className="text-muted-foreground">Concentração op.</span>
            <span className="font-mono font-semibold text-foreground">{(chapa.concentracao_pct * 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* Padrão semanal */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Padrão Semanal</p>
          <div className="grid grid-cols-7 gap-0.5">
            {[0, 1, 2, 3, 4, 5, 6].map((dia) => {
              const isPref = chapa.dias_preferidos.includes(dia)
              const isEvit = chapa.dias_evitados.includes(dia)
              return (
                <div
                  key={dia}
                  className={`flex flex-col items-center gap-0.5 rounded py-1 ${
                    isPref ? "bg-success/15" : isEvit ? "bg-destructive/10" : "bg-muted/30"
                  }`}
                >
                  <span className="text-[10px] text-muted-foreground">{DIAS[dia].slice(0, 1)}</span>
                  <div className={`h-2 w-2 rounded-full ${
                    isPref ? "bg-success" : isEvit ? "bg-destructive/50" : "bg-muted"
                  }`} />
                </div>
              )
            })}
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            {chapa.dias_preferidos.length > 0 && (
              <p>Prefere: <span className="text-foreground font-medium">{chapa.dias_preferidos.map((d) => DIAS[d]).join(", ")}</span></p>
            )}
            {chapa.dias_evitados.length > 0 && (
              <p>Evita: <span className="text-foreground font-medium">{chapa.dias_evitados.map((d) => DIAS[d]).join(", ")}</span></p>
            )}
          </div>
          <div className="border-t border-border/50 pt-1.5 space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Melhor dia p/ contato</span>
              <span className="font-medium text-foreground">
                {chapa.dias_preferidos.length > 0
                  ? chapa.dias_preferidos.slice(0, 2).map((d) => DIAS[d]).join(" ou ")
                  : "sem padrão claro"}
              </span>
            </div>
            {(() => {
              const fds = [0, 6]
              const diasUtil = [1, 2, 3, 4, 5]
              const prefFds = chapa.dias_preferidos.filter((d) => fds.includes(d)).length
              const evitUtil = chapa.dias_evitados.filter((d) => diasUtil.includes(d)).length
              if (prefFds >= 1 && evitUtil >= 3) return (
                <p className="text-[10px] text-muted-foreground/80">Padrão: possível segundo emprego fixo (prefere fds)</p>
              )
              if (chapa.turno_principal) return (
                <p className="text-[10px] text-muted-foreground/80">Turno principal: {chapa.turno_principal}</p>
              )
              return null
            })()}
          </div>
        </div>
      </div>

      {/* Tarefas recentes + Anotações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Tarefas Recentes</p>
          </div>
          <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
            {tarefasRecentes.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 py-3">Sem tarefas no período.</p>
            ) : tarefasRecentes.map((t, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{t.empresa}</p>
                  <p className="text-[11px] text-muted-foreground">{t.data_tarefa.toLocaleDateString("pt-BR")} · {t.hora}h</p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${
                  t.status_fup.includes("confirm") || t.status_fup.includes("caminho")
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-muted text-muted-foreground border-border"
                }`}>
                  {t.status_fup || t.status_tarefa || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Anotações do Analista</p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border/50 max-h-48">
            {anotacoes.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 py-3">Nenhuma anotação ainda.</p>
            ) : anotacoes.map((a) => (
              <div key={a.id} className="px-4 py-2.5">
                <p className="text-xs text-foreground whitespace-pre-wrap">{a.texto}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(a.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-3 flex gap-2">
            <Textarea
              placeholder="Nova anotação…"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              className="text-xs resize-none flex-1"
            />
            <Button size="sm" className="self-end shrink-0" disabled={!nota.trim() || loadingNota} onClick={salvarNota}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Âncora 01 — Painel IA */}
      {iaOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] flex flex-col bg-neutral-950 border-l border-neutral-800 shadow-2xl">
          <div className="h-1 bg-primary shrink-0" />
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-white">Análise IA — {chapa.nome.split(" ")[0]}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyScript}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
              >
                {iaCopied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                {iaCopied ? "Copiado" : "Copiar script"}
              </button>
              <button
                type="button"
                onClick={() => { setIaOpen(false); iaAbortRef.current?.abort() }}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {iaLoading && !iaText && (
              <div className="flex items-center gap-2 text-neutral-500 text-sm">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Gerando análise…
              </div>
            )}
            {iaText ? (
              <div className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap font-mono">
                {iaText.split(/(\[DIAGNÓSTICO\]|\[ABORDAGEM\]|\[SCRIPT\])/).map((part, i) => {
                  if (/^\[.+\]$/.test(part)) return (
                    <p key={i} className="text-[10px] font-bold text-primary uppercase tracking-widest mt-4 mb-1 first:mt-0">{part.replace(/\[|\]/g, "")}</p>
                  )
                  return <span key={i}>{part}</span>
                })}
                {iaLoading && <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-0.5 align-middle" />}
              </div>
            ) : !iaLoading && (
              <p className="text-neutral-500 text-sm">Sem conteúdo gerado.</p>
            )}
          </div>
          <div className="border-t border-neutral-800 px-5 py-3">
            <button
              type="button"
              onClick={handleIA}
              disabled={iaLoading}
              className="w-full text-xs text-neutral-400 hover:text-white disabled:opacity-40 transition-colors"
            >
              {iaLoading ? "Gerando…" : "Gerar novamente"}
            </button>
          </div>
        </div>
      )}

      {/* Leo BID card */}
      {leoData && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-3">Resposta no BID</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground">Ofertas recebidas</p>
              <p className="text-lg font-bold text-foreground">{leoData.total_ofertas}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground">Aceites (Sim)</p>
              <p className="text-lg font-bold text-foreground">{leoData.total_sim}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground">Taxa de aceite</p>
              <p className={`text-lg font-bold ${leoData.pct_sim >= 0.75 ? "text-success" : leoData.pct_sim >= 0.4 ? "text-warning" : "text-destructive"}`}>
                {(leoData.pct_sim * 100).toFixed(0)}%
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground">Perfil</p>
              <p className="text-sm font-semibold text-foreground">
                {leoData.passa_75pct ? "Alta aceitação" : "Baixa aceitação"}
                {leoData.repete && " · Recorrente"}
              </p>
            </div>
          </div>
          {leoData.pct_sim < 0.3 && leoData.total_ofertas >= 3 && (
            <p className="text-[11px] text-destructive mt-2">Aceite abaixo de 30% — considere pular na campanha de BID.</p>
          )}
        </div>
      )}

      {/* Histórico de categorias */}
      {historico.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-3">Histórico de Categorias</p>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {historico.map((h, i) => (
              <div key={i} className="flex items-center gap-1 shrink-0">
                <div className="flex flex-col items-center gap-1">
                  <CategoryBadge categoria={h.categoria as any} size="sm" />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(h.periodo_inicio).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })}
                  </span>
                </div>
                {i < historico.length - 1 && (
                  <span className="text-muted-foreground/40 text-xs mx-0.5">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
