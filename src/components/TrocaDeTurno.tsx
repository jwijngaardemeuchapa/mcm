import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Check, ArrowLeftRight } from "lucide-react";
import { getDb } from "@/lib/db";
import { fmtSP, todayDateISO_SP, toSP, parseTaskDate } from "@/lib/datetime";
import { companyMatches } from "@/lib/company";
import { toast } from "sonner";

const GRUPOS = ["G1", "G2", "G3", "G4", "G5"];
const CORTE_HORARIO = "14:45"; // tasks from this time onwards are included in BID

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
  grupo: string,
  tarefas: TarefaRow[],
  chapas: ChapaRow[],
  agendaItem: AgendaRow | null,
): string {
  const now = toSP(new Date().toISOString());
  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  const nowMs = now.getTime();

  const todayISO = todayDateISO_SP();
  const tomorrowDate = new Date(`${todayISO}T00:00:00-03:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowISO = tomorrowDate.toISOString().slice(0, 10);

  // Header: day-of-week + date + time
  const diaSemana = fmtSP(now.toISOString(), "EEE dd/MM");
  const diaSemanaFmt = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);

  const lines: string[] = [];
  lines.push(`📋 *TROCA DE TURNO${grupo !== "Todos" ? ` — ${grupo}` : ""}* | ${diaSemanaFmt} | ${h}h${m}`);
  lines.push("");

  // ── Validações Pendentes ──
  // Only tasks that have already started today and aren't validated yet
  const pendentes = tarefas.filter(
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

  // ── Confirmações / PréFUPs (unified section) ──
  // All future tasks not 100% confirmed.
  // PréFUP label: tomorrow's tasks OR today's tasks starting at 17h+.
  const upcoming = tarefas.filter(
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
      const isPrefupTask =
        taskDateISO === tomorrowISO ||
        (taskDateISO === todayISO && toSP(t.data_tarefa).getHours() >= 17);
      return { t, confirmed, requested, isPrefupTask, taskDateISO };
    })
    .filter(({ requested, confirmed, requested: r }) => r > 0 && confirmed < requested);

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

  // ── BID — captações em aberto (tarefas de hoje a partir de 14h45) ──
  const [cutH, cutM] = CORTE_HORARIO.split(":").map(Number);
  const cutMinutes = cutH * 60 + cutM;
  const bidTasks = tarefas.filter((t) => {
    const taskDateISO = fmtSP(t.data_tarefa, "yyyy-MM-dd");
    if (taskDateISO !== todayISO) return false;
    const sp = toSP(t.data_tarefa);
    const taskMinutes = sp.getHours() * 60 + sp.getMinutes();
    return (
      taskMinutes >= cutMinutes &&
      t.validacao_status !== "validacao_recebida" &&
      t.validacao_status !== "subido_meu_chapa" &&
      t.status_tarefa !== "Concluído"
    );
  });

  const bidEntries = bidTasks
    .map((t) => {
      const ativos = activeChapas(chapas, t.id_tarefa);
      const confirmed = ativos.filter((c) => c.status_contato === "confirmado").length;
      const requested = t.quantidade_chapas || ativos.length;
      const missing = Math.max(0, requested - confirmed);
      return { t, missing, confirmed, requested };
    })
    .filter(({ missing }) => missing > 0);

  if (bidEntries.length > 0) {
    lines.push("🎯 *BID — CAPTAÇÕES EM ABERTO*");
    for (const { t, missing, confirmed, requested } of bidEntries) {
      const dataFmt = fmtSP(t.data_tarefa, "dd/MM HH:mm");
      lines.push(`• ${t.empresa} — ${dataFmt} — faltam ${missing} chapa${missing > 1 ? "s" : ""} (${confirmed}/${requested})`);
    }
    lines.push("");
  }

  // ── Agenda item ──
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

export function TrocaDeTurno({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [grupo, setGrupo] = useState("Todos");
  const [agendaItems, setAgendaItems] = useState<AgendaRow[]>([]);
  const [selectedAgendaId, setSelectedAgendaId] = useState<string>("__none__");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadAgenda();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    generate();
  }, [open, grupo, selectedAgendaId]);

  async function loadAgenda() {
    try {
      const db = await getDb();
      const rows = await db.select<AgendaRow[]>(
        "SELECT id, titulo, prazo, importancia, status FROM agenda WHERE status != 'concluido' ORDER BY prazo ASC NULLS LAST, titulo ASC",
      );
      setAgendaItems(rows);
    } catch {
      // silently skip
    }
  }

  async function generate() {
    setLoading(true);
    try {
      const db = await getDb();
      const todayISO = todayDateISO_SP();
      const tomorrowDate = new Date(`${todayISO}T00:00:00-03:00`);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowISO = tomorrowDate.toISOString().slice(0, 10);

      const [allTarefas, allChapas, carteira] = await Promise.all([
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
      ]);

      // Filter by carteira membership (same as Dashboard — only show companies in the portfolio)
      const carteiraNames = carteira.map((c) => c.nome_fantasia);
      let tarefas = carteiraNames.length === 0
        ? allTarefas
        : allTarefas.filter((t) => companyMatches(t.empresa, carteiraNames));

      // Filter by grupo on top
      if (grupo !== "Todos") {
        const empresasDoGrupo = carteira
          .filter((c) => c.grupo === grupo)
          .map((c) => c.nome_fantasia);
        if (empresasDoGrupo.length > 0) {
          tarefas = tarefas.filter((t) =>
            companyMatches(t.empresa, empresasDoGrupo),
          );
        }
      }

      const agendaItem = selectedAgendaId !== "__none__"
        ? agendaItems.find((a) => a.id === selectedAgendaId) ?? null
        : null;

      setMessage(buildMessage(grupo, tarefas, allChapas, agendaItem));
    } catch {
      toast.error("Erro ao gerar mensagem");
    } finally {
      setLoading(false);
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Mensagem copiada para a área de transferência");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Erro ao copiar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            Troca de Turno
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-3 border-b border-border flex items-center gap-4 flex-wrap">
          {/* Grupo selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Carteira</span>
            <Select value={grupo} onValueChange={setGrupo}>
              <SelectTrigger className="h-8 w-28 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos</SelectItem>
                {GRUPOS.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Agenda item */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Incluir da Agenda</span>
            <Select value={selectedAgendaId} onValueChange={setSelectedAgendaId}>
              <SelectTrigger className="h-8 w-56 text-sm">
                <SelectValue placeholder="Nenhum item" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum item</SelectItem>
                {agendaItems.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.titulo.length > 36 ? a.titulo.slice(0, 36) + "…" : a.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-8 ml-auto gap-1.5"
            onClick={generate}
            disabled={loading}
          >
            Atualizar
          </Button>
        </div>

        {/* Message preview */}
        <div className="flex-1 overflow-auto px-5 py-4">
          <pre className="whitespace-pre-wrap text-sm font-mono bg-muted/40 rounded-lg p-4 leading-relaxed text-foreground min-h-[200px]">
            {loading ? "Gerando…" : message}
          </pre>
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
          <Button size="sm" className="gap-1.5 min-w-[140px]" onClick={copyMessage} disabled={!message || loading}>
            {copied ? <><Check className="h-4 w-4" /> Copiado!</> : <><Copy className="h-4 w-4" /> Copiar para Teams</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
