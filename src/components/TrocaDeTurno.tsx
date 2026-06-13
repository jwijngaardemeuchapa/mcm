import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Check, ArrowLeftRight, ChevronDown, PartyPopper } from "lucide-react";
import { getDb } from "@/lib/db";
import { fmtSP, todayDateISO_SP, toSP, parseTaskDate } from "@/lib/datetime";
import { companyMatches } from "@/lib/company";
import { toast } from "sonner";
import { Confetti } from "./Confetti";
import { playTeamsCopy } from "@/lib/sound";

type TarefaRow = {
  id_tarefa: number;
  empresa: string;
  data_tarefa: string;
  cidade_uf: string | null;
  status_tarefa: string;
  quantidade_chapas: number;
  validacao_status: string | null;
};

type ChapaRow = {
  id_tarefa: number;
  nome_chapa: string | null;
  status_contato: string;
  data_remocao: string | null;
};

type AgendaRow = {
  id: string;
  titulo: string;
  prazo: string | null;
  importancia: string;
  status: string;
};

type CarteiraRow = {
  nome_fantasia: string;
  grupo: string | null;
};

function activeChapas(chapas: ChapaRow[], id_tarefa: number) {
  return chapas.filter(
    (c) => c.id_tarefa === id_tarefa && !c.data_remocao && c.status_contato !== "removido",
  );
}

function buildMessage(
  grupoLabel: string,
  tarefas: TarefaRow[],
  chapas: ChapaRow[],
  agendaItem: AgendaRow | null,
  bidCorteMinutes: number,
  excludedEmpresas: Set<string>,
): string {
  const now = toSP(new Date().toISOString());
  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  const nowMs = now.getTime();

  const todayISO = todayDateISO_SP();
  const tomorrowDate = new Date(`${todayISO}T00:00:00-03:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowISO = tomorrowDate.toISOString().slice(0, 10);

  // Header
  const diaSemana = fmtSP(now.toISOString(), "EEE dd/MM");
  const diaSemanaFmt = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
  const grupoSuffix = grupoLabel && grupoLabel !== "Geral" ? ` — ${grupoLabel}` : "";

  const lines: string[] = [];
  lines.push(`📋 *TROCA DE TURNO${grupoSuffix}* | ${diaSemanaFmt} | ${h}h${m}`);
  lines.push("");

  // Aplicar exclusão de empresas
  const filtradas = excludedEmpresas.size > 0
    ? tarefas.filter((t) => !excludedEmpresas.has(t.empresa))
    : tarefas;

  // ── Validações Pendentes ──
  const pendentes = filtradas.filter(
    (t) =>
      fmtSP(t.data_tarefa, "yyyy-MM-dd") === todayISO &&
      parseTaskDate(t.data_tarefa, t.cidade_uf).getTime() <= nowMs &&
      t.validacao_status !== "validacao_recebida" &&
      t.validacao_status !== "subido_meu_chapa" &&
      t.status_tarefa !== "Concluído",
  );
  if (pendentes.length > 0) {
    lines.push("⚠️ *VALIDAÇÕES PENDENTES*");
    for (const t of pendentes) {
      const dataFmt = fmtSP(t.data_tarefa, "dd/MM HH:mm");
      const statusLabel = t.validacao_status === "pendente" ? "aguardando cliente" : "sem validação";
      lines.push(`• ${t.empresa} — ${dataFmt} (${statusLabel})`);
    }
    lines.push("");
  }

  // ── Confirmações / PréFUPs ──
  // PréFUP: tarefa inicia em mais de 6h a partir de agora
  const PREFUP_THRESHOLD_MS = 6 * 60 * 60 * 1000;
  const upcoming = filtradas.filter(
    (t) =>
      parseTaskDate(t.data_tarefa, t.cidade_uf).getTime() > nowMs &&
      t.validacao_status !== "validacao_recebida" &&
      t.validacao_status !== "subido_meu_chapa" &&
      t.status_tarefa !== "Concluído",
  );
  const confirmEntries = upcoming
    .map((t) => {
      const ativos = activeChapas(chapas, t.id_tarefa);
      const confirmed = ativos.filter((c) => c.status_contato === "confirmado").length;
      const requested = t.quantidade_chapas || ativos.length;
      const taskDateISO = fmtSP(t.data_tarefa, "yyyy-MM-dd");
      const taskMs = parseTaskDate(t.data_tarefa, t.cidade_uf).getTime();
      const isPrefupTask = taskMs > nowMs + PREFUP_THRESHOLD_MS;
      return { t, confirmed, requested, isPrefupTask, taskDateISO };
    })
    .filter(({ requested, confirmed }) => requested > 0 && confirmed < requested);

  if (confirmEntries.length > 0) {
    lines.push("👷 *CONFIRMAÇÕES*");
    for (const { t, confirmed, requested, isPrefupTask, taskDateISO } of confirmEntries) {
      const datePrefix = taskDateISO === tomorrowISO ? "amanhã " : "";
      const dataFmt = datePrefix + fmtSP(t.data_tarefa, "dd/MM HH:mm");
      const prefupLabel = isPrefupTask ? " [PréFUP]" : "";
      lines.push(`• ${t.empresa} — ${dataFmt} — ${confirmed}/${requested} confirmados${prefupLabel}`);
    }
    lines.push("");
  }

  // ── BID — captações em aberto ──
  // Inclui tarefas de hoje a partir do corte configurável
  // que ainda não iniciaram OU iniciaram há no máximo 30 min
  // e têm linhas VAZIAS (slots sem chapa alguma alocada)
  const TRINTA_MIN_MS = 30 * 60 * 1000;
  const bidTasks = filtradas.filter((t) => {
    const taskDateISO = fmtSP(t.data_tarefa, "yyyy-MM-dd");
    if (taskDateISO !== todayISO) return false;
    const sp = toSP(t.data_tarefa);
    const taskMinutes = sp.getHours() * 60 + sp.getMinutes();
    if (taskMinutes < bidCorteMinutes) return false;
    const taskMs = parseTaskDate(t.data_tarefa, t.cidade_uf).getTime();
    const jaIniciou = taskMs <= nowMs;
    const iniciouRecentemente = jaIniciou && (nowMs - taskMs) <= TRINTA_MIN_MS;
    return (
      (!jaIniciou || iniciouRecentemente) &&
      t.validacao_status !== "validacao_recebida" &&
      t.validacao_status !== "subido_meu_chapa" &&
      t.status_tarefa !== "Concluído"
    );
  });

  const bidEntries = bidTasks
    .map((t) => {
      const ativos = activeChapas(chapas, t.id_tarefa);
      // Linhas vazias = vagas totais minus chapas ativas (independente de confirmação)
      const linhasVazias = Math.max(0, t.quantidade_chapas - ativos.length);
      return { t, linhasVazias };
    })
    .filter(({ linhasVazias }) => linhasVazias > 0);

  if (bidEntries.length > 0) {
    lines.push("🎯 *BID — CAPTAÇÕES EM ABERTO*");
    for (const { t, linhasVazias } of bidEntries) {
      const dataFmt = fmtSP(t.data_tarefa, "dd/MM HH:mm");
      lines.push(`• ${t.empresa} — ${dataFmt} — ${linhasVazias} linha${linhasVazias > 1 ? "s" : ""} vazia${linhasVazias > 1 ? "s" : ""}`);
    }
    lines.push("");
  }

  // ── Agenda ──
  if (agendaItem) {
    lines.push("📅 *AGENDA*");
    const prazoStr = agendaItem.prazo
      ? ` — ${toSP(agendaItem.prazo).getHours().toString().padStart(2, "0")}h${toSP(agendaItem.prazo).getMinutes().toString().padStart(2, "0")}`
      : "";
    lines.push(`• ${agendaItem.titulo}${prazoStr}`);
    lines.push("");
  }

  if (pendentes.length === 0 && confirmEntries.length === 0 && bidEntries.length === 0 && !agendaItem) {
    lines.push("✅ Sem pendências no momento.");
    lines.push("");
  }

  lines.push("_Gerado pelo MCM_");
  return lines.join("\n");
}

// Converte "HH:MM" para total de minutos
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function TrocaDeTurno({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [grupoLabel, setGrupoLabel] = useState("Geral");
  const [gruposDisponiveis, setGruposDisponiveis] = useState<string[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaRow[]>([]);
  const [selectedAgendaId, setSelectedAgendaId] = useState<string>("__none__");
  const [bidCorte, setBidCorte] = useState("14:45");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Dados carregados — para derivar lista de empresas
  const [allTarefas, setAllTarefas] = useState<TarefaRow[]>([]);
  const [allChapas, setAllChapas] = useState<ChapaRow[]>([]);

  // Seleção de empresas (por sessão — reseta ao fechar)
  const [excludedEmpresas, setExcludedEmpresas] = useState<Set<string>>(new Set());
  const [empresasPopoverOpen, setEmpresasPopoverOpen] = useState(false);

  // Lista única de empresas nas tarefas carregadas
  const empresasDisponiveis = useMemo(
    () => [...new Set(allTarefas.map((t) => t.empresa))].sort(),
    [allTarefas],
  );

  // Reset por sessão
  useEffect(() => {
    if (!open) {
      setExcludedEmpresas(new Set());
      setEmpresasPopoverOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    loadStaticData();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, grupoLabel, selectedAgendaId, bidCorte, excludedEmpresas, allTarefas, allChapas]);

  async function loadStaticData() {
    try {
      const db = await getDb();
      const todayISO = todayDateISO_SP();
      const tomorrowDate = new Date(`${todayISO}T00:00:00-03:00`);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowISO = tomorrowDate.toISOString().slice(0, 10);

      const [tarefas, chapas, carteira, agenda] = await Promise.all([
        db.select<TarefaRow[]>(
          `SELECT id_tarefa, empresa, data_tarefa, cidade_uf, status_tarefa, quantidade_chapas, validacao_status
           FROM tarefas
           WHERE ativo = 1
             AND (date(data_tarefa) = ? OR date(data_tarefa) = ?)
             AND status_tarefa NOT LIKE 'Cancel%'
             AND status_tarefa != 'Finalizado'`,
          [todayISO, tomorrowISO],
        ),
        db.select<ChapaRow[]>(
          `SELECT c.id_tarefa, c.nome_chapa, c.status_contato, c.data_remocao
           FROM chapas c
           JOIN tarefas t ON t.id_tarefa = c.id_tarefa
           WHERE t.ativo = 1 AND (date(t.data_tarefa) = ? OR date(t.data_tarefa) = ?)`,
          [todayISO, tomorrowISO],
        ),
        db.select<CarteiraRow[]>("SELECT nome_fantasia, grupo FROM carteira"),
        db.select<AgendaRow[]>(
          "SELECT id, titulo, prazo, importancia, status FROM agenda WHERE status != 'concluido' ORDER BY prazo ASC NULLS LAST, titulo ASC",
        ),
      ]);

      // Filtrar apenas empresas da carteira
      const carteiraNames = carteira.map((c) => c.nome_fantasia);
      const tarefasFiltradas = carteiraNames.length === 0
        ? tarefas
        : tarefas.filter((t) => companyMatches(t.empresa, carteiraNames));

      // Grupos disponíveis — dinâmicos da carteira
      const grupos = [...new Set(carteira.map((c) => c.grupo).filter(Boolean))] as string[];
      setGruposDisponiveis(grupos.sort());

      setAllTarefas(tarefasFiltradas);
      setAllChapas(chapas);
      setAgendaItems(agenda);
    } catch {
      toast.error("Erro ao carregar dados");
    }
  }

  function generate() {
    if (allTarefas.length === 0 && allChapas.length === 0) return;
    setLoading(true);
    try {
      const agendaItem = selectedAgendaId !== "__none__"
        ? agendaItems.find((a) => a.id === selectedAgendaId) ?? null
        : null;
      setMessage(
        buildMessage(
          grupoLabel,
          allTarefas,
          allChapas,
          agendaItem,
          timeToMinutes(bidCorte),
          excludedEmpresas,
        ),
      );
    } catch {
      toast.error("Erro ao gerar mensagem");
    } finally {
      setLoading(false);
    }
  }

  function toggleEmpresa(empresa: string) {
    setExcludedEmpresas((prev) => {
      const next = new Set(prev);
      if (next.has(empresa)) next.delete(empresa);
      else next.add(empresa);
      return next;
    });
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      playTeamsCopy();
      toast.success("Troca de turno copiada! Cole no Teams.", { icon: "🎉", duration: 3000 });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Erro ao copiar");
    }
  }

  const numExcluidas = excludedEmpresas.size;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            Troca de Turno
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-3 border-b border-border shrink-0 flex items-center gap-3 flex-wrap">

          {/* Rótulo da carteira (apenas descritivo) */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Carteira</span>
            <Select value={grupoLabel} onValueChange={setGrupoLabel}>
              <SelectTrigger className="h-8 w-28 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Geral">Geral</SelectItem>
                {gruposDisponiveis.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Corte do BID */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Corte BID</span>
            <input
              type="time"
              value={bidCorte}
              onChange={(e) => setBidCorte(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-24"
            />
          </div>

          {/* Empresas — seleção por sessão */}
          <Popover open={empresasPopoverOpen} onOpenChange={setEmpresasPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm">
                Empresas
                {numExcluidas > 0 && (
                  <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    -{numExcluidas}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Incluir na mensagem</span>
                <button
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setExcludedEmpresas(new Set())}
                >
                  Todas
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {empresasDisponiveis.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma empresa</p>
                ) : (
                  empresasDisponiveis.map((emp) => {
                    const checked = !excludedEmpresas.has(emp);
                    return (
                      <label
                        key={emp}
                        className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleEmpresa(emp)}
                          className="shrink-0"
                        />
                        <span className="text-sm truncate">{emp}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Agenda */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Agenda</span>
            <Select value={selectedAgendaId} onValueChange={setSelectedAgendaId}>
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue placeholder="Nenhum item" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum item</SelectItem>
                {agendaItems.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.titulo.length > 32 ? a.titulo.slice(0, 32) + "…" : a.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-8 ml-auto"
            onClick={loadStaticData}
            disabled={loading}
          >
            Atualizar
          </Button>
        </div>

        {/* Prévia da mensagem */}
        <div className="flex-1 overflow-auto px-5 py-4">
          <pre className="whitespace-pre-wrap text-sm font-mono bg-muted/40 rounded-lg p-4 leading-relaxed text-foreground min-h-[200px]">
            {loading ? "Gerando…" : message}
          </pre>
        </div>

        <div className="relative px-5 py-3 border-t border-border shrink-0 flex justify-end gap-2">
          <Confetti active={copied} className="bottom-auto top-0" />
          <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
          <Button
            size="sm"
            onClick={copyMessage}
            disabled={!message || loading}
            className={`gap-1.5 min-w-[140px] transition-all duration-200 ${copied ? "animate-glow-sweep bg-success text-success-foreground hover:bg-success/90" : ""}`}
          >
            {copied
              ? <><PartyPopper className="h-4 w-4" /> Copiado!</>
              : <><Copy className="h-4 w-4" /> Copiar para Teams</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
