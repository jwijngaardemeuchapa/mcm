import { useEffect, useRef, useState } from "react"
import { Trash2, RotateCcw, Cpu, Download, CircleCheck, CircleX, CircleDot, RefreshCw, Sheet, FileKey } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { invoke } from "@tauri-apps/api/core"
import { deleteSnapshot, saveConfig } from "../db/queries"
import type { ConfigAnalise, Snapshot } from "../types"
import { DEFAULT_CONFIG } from "../types"
import { isOllamaRunning, isModelAvailable, pullModel } from "../ai/ollama-client"
import { OLLAMA_MODEL } from "../ai/types"
import { getLeoConfig, saveLeoConfig, syncLeo, extractSpreadsheetId } from "../modules/M_leo"

type Props = {
  config: ConfigAnalise
  snapshots: Snapshot[]
  onConfigChange: (c: ConfigAnalise) => void
  onSnapshotsChange: (s: Snapshot[]) => void
  onLoadSnapshot: (id: string) => void
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-xs text-muted-foreground w-52 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 accent-primary"
      />
      <span className="text-xs font-mono font-semibold text-foreground w-14 text-right">
        {step < 1 ? (value * 100).toFixed(0) + "%" : value}{unit && !step < 1 ? ` ${unit}` : ""}
      </span>
    </div>
  )
}

export function Configuracoes({ config, snapshots, onConfigChange, onSnapshotsChange, onLoadSnapshot }: Props) {
  const [draft, setDraft] = useState<ConfigAnalise>(config)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Leo BID state
  const [leoSheetId, setLeoSheetId] = useState("")
  const [leoHasCred, setLeoHasCred] = useState(false)
  const [leoLastSync, setLeoLastSync] = useState<string | null>(null)
  const [leoTotal, setLeoTotal] = useState(0)
  const [leoSyncing, setLeoSyncing] = useState(false)
  const credInputRef = useRef<HTMLInputElement>(null)

  // IA Local state
  const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null)
  const [modelOk, setModelOk] = useState<boolean | null>(null)
  const [startingOllama, setStartingOllama] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState("")

  async function checkOllamaStatus() {
    const running = await isOllamaRunning()
    setOllamaRunning(running)
    if (running) {
      const model = await isModelAvailable(OLLAMA_MODEL)
      setModelOk(model)
    } else {
      setModelOk(false)
    }
  }

  useEffect(() => {
    checkOllamaStatus()
    const iv = setInterval(checkOllamaStatus, 10_000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    getLeoConfig().then((c) => {
      if (c.spreadsheetId) setLeoSheetId(c.spreadsheetId)
      setLeoHasCred(!!c.serviceAccountJson)
      setLeoLastSync(c.lastSync)
      setLeoTotal(c.totalRegistros)
    }).catch(() => {})
  }, [])

  async function handleLeoCredFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      JSON.parse(text) // validate JSON
      await saveLeoConfig("service_account_json", text)
      setLeoHasCred(true)
      toast.success("Credencial salva")
    } catch {
      toast.error("Arquivo inválido — esperado JSON de Service Account")
    }
    e.target.value = ""
  }

  async function handleSaveSheetId() {
    const id = extractSpreadsheetId(leoSheetId)
    if (!id) { toast.error("ID da planilha inválido"); return }
    await saveLeoConfig("spreadsheet_id", id)
    setLeoSheetId(id)
    toast.success("ID da planilha salvo")
  }

  async function handleSyncLeo() {
    const id = extractSpreadsheetId(leoSheetId)
    if (!id) { toast.error("Configure o ID da planilha primeiro"); return }
    const cfg = await getLeoConfig()
    if (!cfg.serviceAccountJson) { toast.error("Configure a credencial JSON primeiro"); return }
    setLeoSyncing(true)
    try {
      const count = await syncLeo(id, cfg.serviceAccountJson)
      const refreshed = await getLeoConfig()
      setLeoLastSync(refreshed.lastSync)
      setLeoTotal(refreshed.totalRegistros)
      toast.success(`${count} registros sincronizados`)
    } catch (e) {
      toast.error(`Erro: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLeoSyncing(false)
    }
  }

  async function handleStartOllama() {
    setStartingOllama(true)
    try {
      await invoke("start_ollama")
      let ready = false
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        if (await isOllamaRunning()) { ready = true; break }
      }
      await checkOllamaStatus()
      if (ready) {
        toast.success("Ollama iniciado e pronto")
      } else {
        toast.warning("Ollama iniciado mas ainda não responde — aguarde alguns segundos")
      }
    } catch (e) {
      toast.error(String(e))
    } finally {
      setStartingOllama(false)
    }
  }

  async function handlePullModel() {
    setPulling(true)
    setPullProgress("Iniciando download…")
    try {
      await pullModel(OLLAMA_MODEL, (status, pct) => {
        setPullProgress(pct > 0 ? `${status} · ${pct}%` : status)
      })
      await checkOllamaStatus()
      toast.success("Modelo baixado com sucesso")
    } catch (e) {
      toast.error(`Erro no download: ${String(e)}`)
    } finally {
      setPulling(false)
      setPullProgress("")
    }
  }

  function update(path: string, value: number) {
    setDraft((prev) => {
      const next = structuredClone(prev)
      const parts = path.split(".")
      let obj: any = next
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]]
      obj[parts[parts.length - 1]] = value
      return next
    })
  }

  async function salvar() {
    try {
      await saveConfig(draft)
      onConfigChange(draft)
      toast.success("Configurações salvas")
    } catch {
      toast.error("Erro ao salvar configurações")
    }
  }

  function resetar() {
    setDraft(DEFAULT_CONFIG)
  }

  async function excluirSnapshot(id: string) {
    setDeleting(id)
    try {
      await deleteSnapshot(id)
      onSnapshotsChange(snapshots.filter((s) => s.id !== id))
      toast.success("Análise removida")
    } catch {
      toast.error("Erro ao remover análise")
    } finally {
      setDeleting(null)
    }
  }

  const l = draft.limiares

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display font-bold text-xl text-foreground">Configurações</h2>
        <p className="text-sm text-muted-foreground mt-1">Ajuste os limiares de classificação e a janela temporal de análise.</p>
      </div>

      {/* Como a classificação funciona */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
        <p className="text-xs font-semibold text-foreground">Como a classificação funciona</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Todo chapa é avaliado por três critérios: <strong className="text-foreground">tarefas no período</strong> (volume), <strong className="text-foreground">recência</strong> (dias desde a última tarefa) e <strong className="text-foreground">fill rate</strong> (vagas preenchidas ÷ vagas recebidas). A combinação define a categoria — e os limiares abaixo controlam onde cada fronteira fica.
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 mt-1">
          {[
            ["Pilar", "muito ativo, fill alto — núcleo da operação"],
            ["Frequente", "regular mas abaixo do pilar"],
            ["Casual", "aparece esporadicamente"],
            ["Em Risco", "era bom e sumiu — ligar hoje"],
            ["Dormente", "parado 30–89 dias com histórico"],
            ["Fantasma", "inativo 90+ dias ou nunca trabalhou"],
            ["Novo", "primeira tarefa há menos de 30 dias"],
          ].map(([cat, desc]) => (
            <div key={cat} className="flex items-baseline gap-1.5 py-0.5">
              <span className="text-[11px] font-semibold text-foreground shrink-0">{cat}:</span>
              <span className="text-[11px] text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Janela temporal */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <p className="text-sm font-semibold text-foreground">Janela de Análise</p>
        <SliderRow
          label="Período analisado"
          value={draft.janela_dias}
          min={30}
          max={180}
          step={15}
          unit="dias"
          onChange={(v) => setDraft((d) => ({ ...d, janela_dias: v }))}
        />
        <SliderRow
          label="Meta semanal (bonificação)"
          value={l.meta_semanal}
          min={2}
          max={12}
          step={1}
          unit="tarefas/sem"
          onChange={(v) => update("limiares.meta_semanal", v)}
        />
      </div>

      {/* Limiares por categoria */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-5">
        <p className="text-sm font-semibold text-foreground">Limiares de Categorização</p>

        {[
          {
            titulo: "Pilar",
            fields: [
              { label: "Mín. tarefas", key: "pilar_min_tarefas", min: 5, max: 30, step: 1 },
              { label: "Máx. recência (dias)", key: "pilar_max_recencia", min: 7, max: 30, step: 1 },
              { label: "Mín. fill rate", key: "pilar_min_fill", min: 0.7, max: 1, step: 0.05 },
            ],
          },
          {
            titulo: "Frequente",
            fields: [
              { label: "Mín. tarefas", key: "frequente_min_tarefas", min: 2, max: 15, step: 1 },
              { label: "Máx. tarefas", key: "frequente_max_tarefas", min: 5, max: 25, step: 1 },
              { label: "Máx. recência (dias)", key: "frequente_max_recencia", min: 14, max: 60, step: 7 },
              { label: "Mín. fill rate", key: "frequente_min_fill", min: 0.6, max: 1, step: 0.05 },
            ],
          },
          {
            titulo: "Casual",
            fields: [
              { label: "Mín. tarefas", key: "casual_min_tarefas", min: 1, max: 5, step: 1 },
              { label: "Máx. tarefas", key: "casual_max_tarefas", min: 3, max: 10, step: 1 },
              { label: "Máx. recência (dias)", key: "casual_max_recencia", min: 30, max: 120, step: 15 },
            ],
          },
          {
            titulo: "Em Risco",
            fields: [
              { label: "Recência mín. (dias)", key: "risco_min_recencia", min: 7, max: 21, step: 1 },
              { label: "Recência máx. (dias)", key: "risco_max_recencia", min: 14, max: 60, step: 7 },
            ],
          },
        ].map(({ titulo, fields }) => (
          <div key={titulo} className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{titulo}</p>
            {fields.map((f) => (
              <SliderRow
                key={f.key}
                label={f.label}
                value={(l as any)[f.key]}
                min={f.min}
                max={f.max}
                step={f.step}
                onChange={(v) => update(`limiares.${f.key}`, v)}
              />
            ))}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Fill rate = vagas preenchidas ÷ vagas recebidas. Recência = dias desde a última tarefa trabalhada. Alterações só afetam análises futuras.
      </p>

      <div className="flex gap-2">
        <Button onClick={salvar}>Salvar configurações</Button>
        <Button variant="outline" onClick={resetar} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
        </Button>
      </div>

      {/* IA Local */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">IA Local (Phi-3 via Ollama)</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          {/* Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              {ollamaRunning === null
                ? <CircleDot className="h-4 w-4 text-muted-foreground animate-pulse" />
                : ollamaRunning
                ? <CircleCheck className="h-4 w-4 text-success" />
                : <CircleX className="h-4 w-4 text-destructive" />
              }
              <span className="text-xs text-foreground">
                Ollama: {ollamaRunning === null ? "verificando…" : ollamaRunning ? "rodando" : "offline"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {modelOk === null
                ? <CircleDot className="h-4 w-4 text-muted-foreground animate-pulse" />
                : modelOk
                ? <CircleCheck className="h-4 w-4 text-success" />
                : <CircleX className="h-4 w-4 text-muted-foreground" />
              }
              <span className="text-xs text-foreground">
                {OLLAMA_MODEL}: {modelOk === null ? "verificando…" : modelOk ? "disponível" : "não instalado"}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {!ollamaRunning && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleStartOllama}
                disabled={startingOllama}
              >
                {startingOllama ? "Iniciando…" : "Iniciar Ollama"}
              </Button>
            )}
            {ollamaRunning && !modelOk && !pulling && (
              <Button size="sm" className="gap-1.5" onClick={handlePullModel}>
                <Download className="h-3.5 w-3.5" /> Baixar modelo (~2.3 GB)
              </Button>
            )}
            {pulling && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                {pullProgress || "Baixando…"}
              </div>
            )}
            <Button size="sm" variant="ghost" onClick={checkOllamaStatus} className="text-xs text-muted-foreground">
              Verificar status
            </Button>
          </div>

          {!ollamaRunning && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              O Ollama precisa estar instalado em <code className="font-mono">%LOCALAPPDATA%\Programs\Ollama</code> ou disponível no PATH.{" "}
              Baixe em <strong>ollama.com</strong> e instale antes de continuar.
            </p>
          )}
        </div>
      </div>

      {/* Planilha Leo (BID) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sheet className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Planilha Leo (BID)</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          {/* Spreadsheet ID */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">ID ou URL da planilha</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={leoSheetId}
                onChange={(e) => setLeoSheetId(e.target.value)}
                placeholder="Cole o ID ou URL completa da planilha"
                className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button size="sm" variant="outline" onClick={handleSaveSheetId} className="h-8 text-xs shrink-0">
                Salvar
              </Button>
            </div>
          </div>

          {/* Credential */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => credInputRef.current?.click()}
            >
              <FileKey className="h-3.5 w-3.5" />
              {leoHasCred ? "Substituir credencial" : "Carregar JSON de credencial"}
            </Button>
            <input
              ref={credInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleLeoCredFile}
            />
            {leoHasCred && (
              <div className="flex items-center gap-1.5 text-xs text-success">
                <CircleCheck className="h-3.5 w-3.5" />
                Credencial configurada
              </div>
            )}
          </div>

          {/* Status + Sync */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSyncLeo}
              disabled={leoSyncing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${leoSyncing ? "animate-spin" : ""}`} />
              {leoSyncing ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
            {leoTotal > 0 && (
              <span className="text-xs text-muted-foreground">
                {leoTotal} números · última sync{" "}
                {leoLastSync ? new Date(leoLastSync).toLocaleString("pt-BR") : "nunca"}
              </span>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Crie um Service Account no Google Cloud Console, compartilhe a planilha com o e-mail do Service Account (leitor), e baixe o JSON de chave privada. A planilha deve ter cabeçalhos com colunas de número (telefone/WhatsApp), ofertas e aceites.
          </p>
        </div>
      </div>

      {/* Snapshots */}
      {snapshots.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">Análises Salvas</p>
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {snapshots.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.cliente}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.periodo_inicio} → {s.periodo_fim} · {s.total_chapas} chapas ·{" "}
                    {new Date(s.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onLoadSnapshot(s.id)}>
                  Carregar
                </Button>
                <button
                  type="button"
                  onClick={() => excluirSnapshot(s.id)}
                  disabled={deleting === s.id}
                  className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
