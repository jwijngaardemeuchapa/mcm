import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Search, X, Download, Phone, ChevronRight, Sparkles, Copy, Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { CategoryBadge } from "../components/CategoryBadge"
import { listFlagsForEmpresa } from "../db/queries"
import type { AnaliseResultado, ListaAcionavel as TLista, ListaTipo, ListaItem, FlagTipo } from "../types"
import { normalize } from "@/lib/normalize"
import { isOllamaRunning, isModelAvailable, generate } from "../ai/ollama-client"
import { SYSTEM_LISTA, buildListaContext } from "../ai/prompts"
import { OLLAMA_MODEL } from "../ai/types"

type ContactStatus = "pendente" | "contatado" | "excluido"

type ContactRecord = {
  status: ContactStatus
  nota: string
  timestamp: string
}

type Props = {
  resultado: AnaliseResultado
  tipoAtivo: ListaTipo
  onVerFicha: (nomeNorm: string) => void
  onVoltar: () => void
}

type FlagFiltro = "todos" | "tem_interesse" | "aguardando" | "em_processo" | "sem_interesse" | "sem_flag"

const FLAG_FILTRO_LABELS: Record<FlagFiltro, string> = {
  todos: "Todos",
  tem_interesse: "Tem interesse",
  aguardando: "Aguardando",
  em_processo: "Em processo",
  sem_interesse: "Sem interesse",
  sem_flag: "Sem flag",
}

export function ListaAcionavel({ resultado, tipoAtivo, onVerFicha, onVoltar }: Props) {
  const [busca, setBusca] = useState("")
  const [contacts, setContacts] = useState<Map<string, ContactRecord>>(new Map())
  const [flagFiltro, setFlagFiltro] = useState<FlagFiltro>("todos")
  const [flagMap, setFlagMap] = useState<Map<string, FlagTipo>>(new Map())
  const [modalChapa, setModalChapa] = useState<string | null>(null)
  const [modalStatus, setModalStatus] = useState<ContactStatus>("pendente")
  const [modalNota, setModalNota] = useState("")
  const buscaRef = useRef<HTMLInputElement>(null)

  // Âncora 02 — IA modal
  const [iaOpen, setIaOpen] = useState(false)
  const [iaText, setIaText] = useState("")
  const [iaLoading, setIaLoading] = useState(false)
  const [iaCopied, setIaCopied] = useState(false)

  useEffect(() => {
    listFlagsForEmpresa(resultado.cliente).then(setFlagMap).catch(() => {})
  }, [resultado.cliente])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (iaOpen) { setIaOpen(false); return }
        if (modalChapa) { setModalChapa(null); return }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") { e.preventDefault(); buscaRef.current?.focus() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [modalChapa, iaOpen])

  async function handleIA() {
    if (!lista) return
    const running = await isOllamaRunning()
    if (!running) { toast.error("Ollama offline — inicie em Configurações"); return }
    const hasModel = await isModelAvailable(OLLAMA_MODEL)
    if (!hasModel) { toast.error(`Modelo ${OLLAMA_MODEL} não encontrado — baixe em Configurações`); return }

    setIaOpen(true)
    setIaText("")
    setIaLoading(true)
    try {
      const ctx = buildListaContext(lista, new Map(), resultado.cliente)
      await generate(ctx, SYSTEM_LISTA, (token) => setIaText((prev) => prev + token))
    } catch {
      setIaText("Erro ao gerar campanha. Verifique se o Ollama está rodando.")
    } finally {
      setIaLoading(false)
    }
  }

  function copyScript() {
    const match = iaText.match(/\[SCRIPT DE ABERTURA\]([\s\S]*?)(?=\[|$)/)
    const text = match ? match[1].trim() : iaText
    navigator.clipboard.writeText(text).then(() => {
      setIaCopied(true)
      setTimeout(() => setIaCopied(false), 2000)
    })
  }

  const lista: TLista | undefined = resultado.listas.find((l) => l.tipo === tipoAtivo)
  if (!lista) return null

  function openModal(nome: string) {
    const rec = contacts.get(nome)
    setModalStatus(rec?.status ?? "pendente")
    setModalNota(rec?.nota ?? "")
    setModalChapa(nome)
  }

  function saveModal() {
    if (!modalChapa) return
    if (modalStatus === "pendente" && !modalNota.trim()) {
      setContacts((prev) => { const next = new Map(prev); next.delete(modalChapa); return next })
    } else {
      setContacts((prev) => new Map(prev).set(modalChapa, {
        status: modalStatus,
        nota: modalNota.trim(),
        timestamp: new Date().toLocaleString("pt-BR"),
      }))
    }
    setModalChapa(null)
  }

  const filtered = lista.chapas.filter((c) => {
    const s = contacts.get(c.nome)?.status
    if (s === "excluido") return false
    if (flagFiltro !== "todos") {
      const f = flagMap.get(c.nome)
      if (flagFiltro === "sem_flag" && f) return false
      if (flagFiltro !== "sem_flag" && f !== flagFiltro) return false
    }
    if (!busca.trim()) return true
    const q = normalize(busca)
    return normalize(c.nome).includes(q) || (c.telefone && c.telefone.includes(busca.replace(/\D/g, "")))
  })

  function exportarCsv() {
    const header = "Nome,Telefone,Categoria,Score,Criterio,Status,Nota,Timestamp"
    const rows = lista!.chapas.map((c) => {
      const rec = contacts.get(c.nome)
      return `"${c.nome}","${c.telefone ?? ""}","${c.categoria}",${c.score},"${c.criterio}","${rec?.status ?? "pendente"}","${rec?.nota ?? ""}","${rec?.timestamp ?? ""}"`
    })
    const csv = [header, ...rows].join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${lista!.tipo}_${resultado.cliente.replace(/\s+/g, "_")}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("CSV exportado")
  }

  function copiarTelefones() {
    const tels = filtered.map((c) => c.telefone).filter(Boolean).join("\n")
    navigator.clipboard.writeText(tels).then(() => toast.success("Telefones copiados"))
  }

  const contatados = [...contacts.values()].filter((r) => r.status === "contatado").length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button type="button" onClick={onVoltar} className="mt-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-lg text-foreground">{lista.titulo}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{lista.descricao}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={copiarTelefones}>
            <Phone className="h-3.5 w-3.5" /> Copiar tel.
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={exportarCsv}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" className="gap-1.5 h-8 bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20" variant="ghost" onClick={handleIA}>
            <Sparkles className="h-3.5 w-3.5" /> Organizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="font-semibold text-foreground">{lista.chapas.length} chapas</span>
        {contatados > 0 && <span className="text-success font-medium">{contatados} contatados</span>}
        <span>{[...contacts.values()].filter((r) => r.status === "excluido").length} excluídos</span>
        <span className="ml-auto flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-primary border-2 border-primary inline-block shrink-0" />Contatado</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-destructive border-2 border-destructive inline-block shrink-0" />Excluído</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full border-2 border-border inline-block shrink-0" />Pendente</span>
        </span>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={buscaRef}
          placeholder="Buscar nome ou telefone… (Ctrl+F)"
          className="pl-8 h-8 text-sm"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filtro de flags */}
      {flagMap.size > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold shrink-0">Flag:</span>
          {(Object.keys(FLAG_FILTRO_LABELS) as FlagFiltro[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFlagFiltro(flagFiltro === f ? "todos" : f)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-all ${
                flagFiltro === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              {FLAG_FILTRO_LABELS[f]}
            </button>
          ))}
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Nome</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Categoria</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground hidden md:table-cell">Critério</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground" title="Score de 0 a 100 — combina fill rate, frequência e recência. Quanto maior, melhor.">Score</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                  {busca ? "Nenhum resultado para a busca." : "Lista vazia."}
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const rec = contacts.get(c.nome)
              const st = rec?.status ?? "pendente"
              const flag = flagMap.get(c.nome)
              return (
                <tr
                  key={c.nome}
                  className={`hover:bg-muted/20 transition-colors ${
                    st === "contatado" ? "bg-success/5" : ""
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-foreground">{c.nome}</p>
                        {flag && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                            flag === "tem_interesse" ? "bg-success/10 text-success border-success/30" :
                            flag === "em_processo"   ? "bg-info/10 text-info border-info/30" :
                            flag === "aguardando"    ? "bg-warning/10 text-warning border-warning/30" :
                                                      "bg-destructive/10 text-destructive border-destructive/30"
                          }`}>
                            {FLAG_FILTRO_LABELS[flag]}
                          </span>
                        )}
                      </div>
                      {c.telefone && (
                        <p className="text-[11px] text-muted-foreground font-mono">{c.telefone}</p>
                      )}
                      {c.pilar_sugerido && (
                        <p className="text-[10px] text-info mt-0.5">Padrinho: {c.pilar_sugerido}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <CategoryBadge categoria={c.categoria} size="sm" />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground hidden md:table-cell max-w-xs">
                    <span className="line-clamp-2">{c.criterio}</span>
                  </td>
                  <td className={`px-3 py-2.5 text-center font-mono text-sm font-semibold ${
                    c.score >= 70 ? "text-success" : c.score >= 40 ? "text-warning" : "text-destructive"
                  }`}>
                    {c.score}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => openModal(c.nome)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-all whitespace-nowrap ${
                        st === "contatado"
                          ? "bg-success/10 text-success border-success/30"
                          : st === "excluido"
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {st === "pendente" ? "Contatar" : st === "contatado" ? "Contatado" : "Excluído"}
                    </button>
                    {rec?.nota && (
                      <p className="text-[9px] text-muted-foreground truncate max-w-[80px] mt-0.5">{rec.nota}</p>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      type="button"
                      onClick={() => onVerFicha(c.nome_norm)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal IA — Âncora 02 */}
      {iaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setIaOpen(false)}>
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="h-1 bg-primary shrink-0" />
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-white">Campanha — {lista.titulo}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyScript}
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-white transition-colors"
                >
                  {iaCopied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                  {iaCopied ? "Copiado" : "Copiar script"}
                </button>
                <button type="button" onClick={() => setIaOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {iaLoading && !iaText && (
                <div className="flex items-center gap-2 text-neutral-500 text-sm">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Gerando plano de campanha…
                </div>
              )}
              {iaText ? (
                <div className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap font-mono">
                  {iaText.split(/(\[SEQUÊNCIA\]|\[SCRIPT DE ABERTURA\]|\[QUEM IGNORAR\])/).map((part, i) => {
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
          </div>
        </div>
      )}

      {/* Modal CONTATAR */}
      {modalChapa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalChapa(null)}>
          <div
            className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <p className="text-sm font-semibold text-foreground truncate">{modalChapa}</p>
              <button type="button" onClick={() => setModalChapa(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                {(["pendente", "contatado", "excluido"] as ContactStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setModalStatus(s)}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-lg border transition-all capitalize ${
                      modalStatus === s
                        ? s === "contatado"
                          ? "bg-success/15 text-success border-success/40"
                          : s === "excluido"
                          ? "bg-destructive/15 text-destructive border-destructive/40"
                          : "bg-primary/15 text-primary border-primary/40"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <textarea
                className="w-full text-xs rounded-lg border border-border bg-muted/30 px-3 py-2 resize-none text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Anotação rápida (opcional)…"
                rows={3}
                value={modalNota}
                onChange={(e) => setModalNota(e.target.value)}
              />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={saveModal}>Salvar</Button>
                <Button variant="outline" onClick={() => setModalChapa(null)}>Cancelar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
