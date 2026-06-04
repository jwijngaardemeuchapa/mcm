import { useCallback, useRef, useState } from "react"
import { Upload, CheckCircle, AlertTriangle, X, FileText, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { uuid } from "@/lib/db"
import * as XLSX from "xlsx"
import { parseFupCsv, parsePoolCsv, parsePoolXlsx, parseFillRateCsv, enrichWithFillRate, calcularFillRateOperacional, buildPreview, enrichWithPool } from "../modules/M1_import"
import type { PoolChapa } from "../types"
import { detectarTurnos } from "../modules/M2_turnos"
import { calcularMetricas } from "../modules/M3_metricas"
import { classificar } from "../modules/M4_classificacao"
import { calcularConcentracao } from "../modules/M5_concentracao"
import { calcularCohort } from "../modules/M6_cohort"
import { gerarListas } from "../modules/M7_listas"
import { saveResultado, listSnapshots } from "../db/queries"
import type { ImportPreview, Snapshot, ConfigAnalise, AnaliseResultado, BidExterno } from "../types"
import { DEFAULT_CONFIG } from "../types"
import { parseRespostasBidCsv, parseRespostasBidCsvToMap, normalizePhone } from "../modules/M_leo"

type Props = {
  config: ConfigAnalise
  snapshots: Snapshot[]
  onAnaliseCompleta: (resultado: AnaliseResultado) => void
  onLoadSnapshot: (id: string) => void
  onSnapshotsChange: (snaps: Snapshot[]) => void
}

type FileState = {
  name: string
  content: string
  size: number
}

const STEPS = [
  "Lendo e validando o arquivo",
  "Detectando turnos de trabalho",
  "Calculando métricas por chapa",
  "Classificando chapas (Pilar, Frequente…)",
  "Analisando concentração da operação",
  "Calculando retenção e churn da base",
  "Gerando listas de ação",
]

function DropZone({
  label,
  sublabel,
  accept,
  file,
  onFile,
  onClear,
  optional,
}: {
  label: string
  sublabel: string
  accept: string
  file: FileState | null
  onFile: (f: FileState) => void
  onClear: () => void
  optional?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(
    (f: File) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        onFile({ name: f.name, content: String(e.target?.result ?? ""), size: f.size })
      }
      reader.readAsText(f, "utf-8")
    },
    [onFile],
  )

  return (
    <div
      className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
        dragging
          ? "border-primary bg-primary/5"
          : file
          ? "border-success bg-success/5"
          : "border-border hover:border-primary/50"
      }`}
      onClick={() => !file && ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
      }}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      <div className="p-5 flex items-center gap-4">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
          file ? "bg-success/15" : "bg-muted"
        }`}>
          {file ? (
            <CheckCircle className="h-5 w-5 text-success" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm text-foreground">{label}</p>
            {optional && (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                opcional
              </span>
            )}
          </div>
          {file ? (
            <p className="text-xs text-success truncate">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>
          ) : (
            <p className="text-xs text-muted-foreground">{sublabel}</p>
          )}
        </div>
        {file && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear() }}
            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

export function Importacao({ config, snapshots, onAnaliseCompleta, onLoadSnapshot, onSnapshotsChange }: Props) {
  const [fupFile, setFupFile] = useState<FileState | null>(null)
  const [poolFile, setPoolFile] = useState<FileState | null>(null)
  const [poolParsed, setPoolParsed] = useState<PoolChapa[] | null>(null) // set when xlsx is uploaded
  const [fillRateFile, setFillRateFile] = useState<FileState | null>(null)
  const [respostasBidFile, setRespostasBidFile] = useState<FileState | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [processing, setProcessing] = useState(false)
  const [stepAtual, setStepAtual] = useState(-1)

  const handleFupFile = useCallback((f: FileState) => {
    setFupFile(f)
    const { tarefas, erros, colunas } = parseFupCsv(f.content)
    const prev = buildPreview(tarefas, erros, colunas)
    setPreview(prev)
  }, [])

  // Custom handler for Pool that supports both CSV text and XLSX binary
  const poolInputRef = useRef<HTMLInputElement>(null)
  const handlePoolFileRaw = useCallback((f: File) => {
    const isXlsx = /\.(xlsx|xls)$/i.test(f.name)
    if (isXlsx) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: "array" })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
          const parsed = parsePoolXlsx(rows)
          setPoolFile({ name: f.name, content: "", size: f.size })
          setPoolParsed(parsed)
        } catch {
          toast.error("Erro ao ler arquivo xlsx do Pool.")
        }
      }
      reader.readAsArrayBuffer(f)
    } else {
      const reader = new FileReader()
      reader.onload = (e) => {
        setPoolFile({ name: f.name, content: String(e.target?.result ?? ""), size: f.size })
        setPoolParsed(null)
      }
      reader.readAsText(f, "utf-8")
    }
  }, [])

  const handleAnalisar = useCallback(async () => {
    if (!fupFile) return
    setProcessing(true)
    setStepAtual(0)
    await new Promise((r) => setTimeout(r, 50))

    try {
      // M1
      const { tarefas: tarefasRaw, erros } = parseFupCsv(fupFile.content)
      const pool = poolParsed ?? (poolFile ? parsePoolCsv(poolFile.content) : [])
      if (tarefasRaw.length === 0) {
        toast.error("Nenhuma tarefa válida encontrada no CSV.")
        return
      }
      const fillRateMap = fillRateFile ? parseFillRateCsv(fillRateFile.content) : undefined
      if (fillRateFile && fillRateMap && fillRateMap.size === 0) {
        toast.warning("CSV de Fill Rate carregado mas nenhuma linha foi interpretada — verifique os cabeçalhos (esperado: ID Tarefa, Solicitado, Atendido)")
      }
      const tarefas = fillRateMap ? enrichWithFillRate(tarefasRaw, fillRateMap) : tarefasRaw

      // BID response history — persist to leo_cache + build in-memory map for enrichment
      let bidCount = 0
      let bidMatchCount = 0
      let leoMap: ReturnType<typeof parseRespostasBidCsvToMap> | undefined
      let bidExternas: BidExterno[] = []
      if (respostasBidFile) {
        try {
          bidCount = await parseRespostasBidCsv(respostasBidFile.content)
          leoMap = parseRespostasBidCsvToMap(respostasBidFile.content)
          for (const t of tarefasRaw) {
            const tel = normalizePhone(t.telefone_chapa)
            if (tel && leoMap.has(tel)) bidMatchCount++
          }

        } catch (e) {
          toast.warning(`Respostas BID: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      // Pool × BID × FUP — chapas aprovadas que não aparecem no FUP do período
      if (pool.length > 0) {
        const telefonesNormFup = new Set(tarefasRaw.map((t) => normalizePhone(t.telefone_chapa)).filter(Boolean))
        for (const poolChapa of pool) {
          const telNorm = normalizePhone(poolChapa.telefone)
          if (!telNorm || telNorm.length < 8) continue
          if (telefonesNormFup.has(telNorm)) continue // já capturado na análise principal com leo

          const leo = leoMap?.get(telNorm)
          let grupo: BidExterno["grupo"]

          if (!leo || leo.total_ofertas < 2) {
            grupo = "nunca_contatado"
          } else if (leo.pct_sim >= 0.75) {
            grupo = "alto_aceite"
          } else if (leo.total_ofertas >= 3 && leo.pct_sim < 0.25) {
            grupo = "sem_resposta"
          } else {
            continue // taxa intermediária — sem ação clara
          }

          bidExternas.push({
            nome: poolChapa.nome_completo,
            cpf: poolChapa.cpf || null,
            telefone: telNorm,
            grupo,
            total_ofertas: leo?.total_ofertas ?? 0,
            total_sim: leo?.total_sim ?? 0,
            pct_sim: leo?.pct_sim ?? 0,
            passa_75pct: leo?.passa_75pct ?? false,
          })
        }
        bidExternas.sort((a, b) => {
          const order: Record<BidExterno["grupo"], number> = { alto_aceite: 0, sem_resposta: 1, nunca_contatado: 2 }
          return order[a.grupo] - order[b.grupo] || b.total_ofertas - a.total_ofertas
        })
      }

      const cpfMap = enrichWithPool(tarefas, pool)
      const cliente = [...new Set(tarefas.map((t) => t.empresa))].join(", ") || "Desconhecido"

      // M2
      setStepAtual(1)
      await new Promise((r) => setTimeout(r, 50))
      const turnos = detectarTurnos(tarefas)

      // M3
      setStepAtual(2)
      await new Promise((r) => setTimeout(r, 50))
      const hoje = new Date()
      const metricas = calcularMetricas(tarefas, turnos, cpfMap, hoje, config.janela_dias, leoMap)

      // M4
      setStepAtual(3)
      await new Promise((r) => setTimeout(r, 50))
      const classificados = classificar(metricas, config.limiares, hoje)

      // M5
      setStepAtual(4)
      await new Promise((r) => setTimeout(r, 50))
      const { chapas: chapasComConc, concentracao } = calcularConcentracao(classificados)

      // M6
      setStepAtual(5)
      await new Promise((r) => setTimeout(r, 50))
      const cohort = calcularCohort(chapasComConc)

      // M7
      setStepAtual(6)
      await new Promise((r) => setTimeout(r, 50))
      const listas = gerarListas(chapasComConc, turnos, config.limiares.meta_semanal)

      const datas = tarefas.map((t) => t.data_tarefa.getTime())
      const resultado: AnaliseResultado = {
        snapshot_id: uuid(),
        cliente,
        periodo_inicio: new Date(Math.min(...datas)),
        periodo_fim: new Date(Math.max(...datas)),
        total_tarefas_unicas: new Set(tarefas.map((t) => t.id_tarefa)).size,
        total_chapas: chapasComConc.length,
        turnos,
        chapas: chapasComConc,
        concentracao,
        cohort,
        listas,
        config,
        fill_rate_operacional: fillRateMap ? calcularFillRateOperacional(fillRateMap) : null,
        bid_externos: bidExternas.length > 0 ? bidExternas : undefined,
      }

      await saveResultado(resultado)
      const newSnaps = await listSnapshots()
      onSnapshotsChange(newSnaps)

      if (erros.length > 0) {
        toast.warning(`Análise concluída com ${erros.length} aviso(s)`)
      } else {
        toast.success("Análise concluída com sucesso")
      }
      if (bidCount > 0) {
        toast.info(`${bidCount} números do BID carregados · ${bidMatchCount} chapas cruzados`)
      }

      onAnaliseCompleta(resultado)
    } catch (e) {
      toast.error(`Erro ao processar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setProcessing(false)
      setStepAtual(-1)
    }
  }, [fupFile, poolFile, fillRateFile, respostasBidFile, config, onAnaliseCompleta, onSnapshotsChange])

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="font-display font-bold text-xl text-foreground">Importar dados</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Arraste ou selecione o CSV exportado do MetaBase. A análise classifica cada chapa por frequência, recência e fill rate — e gera listas de ação por perfil.
        </p>
      </div>

      <div className="space-y-3">
        <DropZone
          label="CSV de FUP (obrigatório)"
          sublabel="Exportação do MetaBase — 1 linha por chapa por tarefa"
          accept=".csv,.txt"
          file={fupFile}
          onFile={handleFupFile}
          onClear={() => { setFupFile(null); setPreview(null) }}
        />
        {/* Pool — custom zone supports both CSV and XLSX (chapasDisponiveis.xlsx) */}
        <div
          className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
            poolFile ? "border-success bg-success/5" : "border-border hover:border-primary/50"
          }`}
          onClick={() => !poolFile && poolInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePoolFileRaw(f) }}
        >
          <input
            ref={poolInputRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePoolFileRaw(f) }}
          />
          <div className="p-5 flex items-center gap-4">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${poolFile ? "bg-success/15" : "bg-muted"}`}>
              {poolFile ? <CheckCircle className="h-5 w-5 text-success" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm text-foreground">Pool de Aprovados</p>
                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">opcional</span>
              </div>
              {poolFile ? (
                <p className="text-xs text-success truncate">
                  {poolFile.name} · {(poolFile.size / 1024).toFixed(0)} KB
                  {poolParsed && <span className="ml-1 text-success/70">· {poolParsed.length} chapas (xlsx)</span>}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">CSV (sep. ;) com Nome, CPF, Telefone — ou chapasDisponiveis.xlsx</p>
              )}
            </div>
            {poolFile && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPoolFile(null); setPoolParsed(null) }}
                className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <DropZone
          label="Fill Rate CSV (fonte confiável)"
          sublabel="Mesmo CSV da tela Fill Rate 2.0 — colunas: ID Tarefa, Chapas Solicitados, Chapas Atendidos"
          accept=".csv,.txt"
          file={fillRateFile}
          onFile={setFillRateFile}
          onClear={() => setFillRateFile(null)}
          optional
        />
        <DropZone
          label="Respostas BID CSV"
          sublabel="Histórico de respostas — colunas: Número, total vezes, total SIM, % SIM, APROVADO"
          accept=".csv,.txt"
          file={respostasBidFile}
          onFile={setRespostasBidFile}
          onClear={() => setRespostasBidFile(null)}
          optional
        />
      </div>

      {/* Preview */}
      {preview && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview</p>
          {preview.erros.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs text-destructive space-y-0.5">
                {preview.erros.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              { label: "Empresa(s)", value: preview.empresas.join(", ") || "—" },
              { label: "Período", value: `${preview.periodo_inicio.toLocaleDateString("pt-BR")} – ${preview.periodo_fim.toLocaleDateString("pt-BR")}` },
              { label: "Linhas", value: preview.total_linhas.toLocaleString("pt-BR") },
              { label: "Chapas únicos", value: preview.total_chapas_unicos.toLocaleString("pt-BR") },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted/30 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
                <p className="font-medium text-foreground mt-0.5 truncate">{value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Colunas detectadas</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(preview.colunas_detectadas).map(([k, v]) => (
                <span
                  key={k}
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
                    v ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"
                  }`}
                >
                  {k}: {v ?? "não encontrado"}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {processing && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">Processando…</p>
          <div className="space-y-1.5">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full shrink-0 ${
                  i < stepAtual ? "bg-success" : i === stepAtual ? "bg-primary animate-pulse" : "bg-muted"
                }`} />
                <span className={`text-xs ${
                  i === stepAtual ? "text-primary font-medium" : i < stepAtual ? "text-success" : "text-muted-foreground"
                }`}>
                  {step}
                </span>
                {i < stepAtual && <CheckCircle className="h-3 w-3 text-success ml-auto" />}
              </div>
            ))}
          </div>
        </div>
      )}

      <Button
        className="w-full"
        disabled={!fupFile || processing || (preview?.erros.length ?? 0) > 0}
        onClick={handleAnalisar}
      >
        {processing ? "Analisando…" : "Analisar Base"}
      </Button>

      {/* Snapshots anteriores */}
      {snapshots.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Análises anteriores</p>
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {snapshots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onLoadSnapshot(s.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.cliente}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.periodo_inicio} → {s.periodo_fim} · {s.total_chapas} chapas
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(s.created_at).toLocaleDateString("pt-BR")}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
