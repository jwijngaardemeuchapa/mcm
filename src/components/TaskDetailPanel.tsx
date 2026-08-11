import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Users, Copy, ExternalLink, Check, AlertTriangle, UserMinus, ChevronDown, XCircle,
  MoreHorizontal, Phone, BookUser, Megaphone, MessageSquare, Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConversationPane } from "@/components/ConversationPane";
import { SlideToConfirm } from "@/components/ui/slide-to-confirm";
import { ValidationPanel } from "@/components/ValidationPanel";
import { ObservationsPanel } from "@/components/ObservationsPanel";
import { FillRateBar } from "@/components/FillRateBar";
import { useClienteInfo } from "@/lib/useClienteInfo";
import { useUndo } from "@/lib/undo";
import { getDb, errMsg, placeholders } from "@/lib/db";
import { readSettings } from "@/lib/settings";
import { fmtTime, fmtDateTime, parseTaskDate } from "@/lib/datetime";
import { toast } from "sonner";
import { dispatchQueue, type ChapaSnap, type TaskSnap } from "@/lib/dispatchQueue";
import { useChapaJobState, useTaskCancelState, useMassFupState, useCustomMsgState } from "@/lib/useDispatchJob";
import { type TaskWithChapas } from "@/components/TaskCard";

const WIDTH_KEY = "task_detail_panel_width";
const MIN_WIDTH = 480;
const MAX_WIDTH = 1100;
const DEFAULT_WIDTH = 760;
const CLIENTE_KEY = "__cliente__";

async function clipboardWrite(text: string, successMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMsg);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

const STATUS_LABEL: Record<string, string> = {
  confirmado: "Confirmado",
  pendente: "Pendente",
  nao_respondeu: "Não respondeu",
  cancelado: "Negou FUP",
  removido: "Removido",
};

const CANAL_LABEL: Record<string, string> = {
  whatsapp_web: "WhatsApp",
  umbler_talk: "Umbler",
  ligacao_3c: "Ligação 3C",
  umbler_custom: "Msg personalizada",
  umbler_cancelamento: "Sem resposta (cancelamento)",
  umbler_cancelamento_tarefa: "Cancelamento individual",
  umbler_cancelamento_geral: "Cancelamento geral",
};

type TaskDetailPanelProps = {
  task: TaskWithChapas | null;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
};

// Painel de tarefa — lista de chapas + grupo do cliente à esquerda, conversa
// da pessoa selecionada à direita. Painel lateral fixo, redimensionável,
// não-modal (o resto do dashboard continua clicável) — desenho pedido pelo
// usuário, inspirado no padrão de painel contextual do Amazon Q (MCM-137).
export function TaskDetailPanel({ task, open, onClose, onRefresh }: TaskDetailPanelProps) {
  const navigate = useNavigate();
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(WIDTH_KEY));
      return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH;
    } catch { return DEFAULT_WIDTH; }
  });
  const [resizing, setResizing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [customMsgOpen, setCustomMsgOpen] = useState(false);
  const [customMsgText, setCustomMsgText] = useState("");
  const [customMsgSelected, setCustomMsgSelected] = useState<Set<string>>(new Set());
  const { push } = useUndo();
  const umblerSettings = readSettings().umblerSettings;
  const [clienteInfo, reloadClienteInfo] = useClienteInfo(task?.empresa ?? "");

  const umblerReady = !!(umblerSettings.bearerToken && umblerSettings.fromPhone && umblerSettings.organizationId);
  const cancelTemplateReady = umblerReady && !!umblerSettings.cancelTemplateId;
  const taskCancelTemplateReady = umblerReady && !!umblerSettings.taskCancelTemplateId;

  const taskId = task?.id_tarefa;

  const [taskCancelSent, setTaskCancelSent] = useState(false);
  useEffect(() => {
    if (taskId == null) return;
    try { setTaskCancelSent(!!localStorage.getItem(`umbler_task_cancel_${taskId}`)); } catch { setTaskCancelSent(false); }
  }, [taskId]);
  const taskCancelState = useTaskCancelState(taskId ?? -1);
  const taskCancelPending = taskCancelState?.status === "countdown";
  const taskCancelCountdown = taskCancelState?.status === "countdown" ? taskCancelState.remaining : 0;
  const prevTaskCancelStatus = useRef(taskCancelState?.status);
  useEffect(() => {
    const prev = prevTaskCancelStatus.current;
    prevTaskCancelStatus.current = taskCancelState?.status;
    if (prev === "countdown" && !taskCancelState && taskId != null) {
      try { if (localStorage.getItem(`umbler_task_cancel_${taskId}`)) setTaskCancelSent(true); } catch { /* noop */ }
    }
  }, [taskCancelState, taskId]);

  const [fupAllSent, setFupAllSent] = useState(false);
  useEffect(() => {
    if (taskId == null) return;
    try { setFupAllSent(!!localStorage.getItem(`umbler_fup_all_${taskId}`)); } catch { setFupAllSent(false); }
  }, [taskId]);
  const massFupState = useMassFupState(taskId ?? -1);
  const fupAllPending = massFupState?.status === "sending";
  const fupAllProgress = massFupState?.status === "sending" ? massFupState.progress : null;
  const prevMassFupStatus = useRef(massFupState?.status);
  useEffect(() => {
    const prev = prevMassFupStatus.current;
    prevMassFupStatus.current = massFupState?.status;
    if (prev === "sending" && !massFupState && taskId != null) {
      try { if (localStorage.getItem(`umbler_fup_all_${taskId}`)) setFupAllSent(true); } catch { /* noop */ }
    }
  }, [massFupState, taskId]);

  const customMsgState = useCustomMsgState(taskId ?? -1);
  const customMsgSending = customMsgState?.status === "sending";

  function startTaskCancelCountdown() {
    if (!task) return;
    const chapasWithPhone = task.chapas.filter(
      (c) => c.telefone_chapa && c.nome_chapa && c.status_contato !== "removido",
    ) as ChapaSnap[];
    if (chapasWithPhone.length === 0) {
      toast.error("Nenhum chapa com telefone cadastrado nesta tarefa");
      return;
    }
    const taskSnap: TaskSnap = { id_tarefa: task.id_tarefa, data_tarefa: task.data_tarefa, empresa: task.empresa, cidade_uf: task.cidade_uf ?? null };
    dispatchQueue.startTaskCancel(task.id_tarefa, chapasWithPhone, taskSnap);
  }
  function stopTaskCancelCountdown() {
    if (task) dispatchQueue.abortTaskCancel(task.id_tarefa);
  }

  function startFupAll() {
    if (!task) return;
    const chapasWithPhone = task.chapas.filter(
      (c) => c.telefone_chapa && c.nome_chapa && c.status_contato !== "removido" && c.status_contato !== "confirmado",
    ) as ChapaSnap[];
    if (chapasWithPhone.length === 0) {
      toast.error("Nenhum chapa pendente com telefone cadastrado nesta tarefa");
      return;
    }
    const taskSnap: TaskSnap = { id_tarefa: task.id_tarefa, data_tarefa: task.data_tarefa, empresa: task.empresa, cidade_uf: task.cidade_uf ?? null };
    dispatchQueue.startMassFup(task.id_tarefa, chapasWithPhone, taskSnap);
  }

  function openCustomMsgDialog() {
    if (!task) return;
    const confirmedWithPhone = task.chapas.filter((c) => c.status_contato === "confirmado" && c.telefone_chapa && c.nome_chapa);
    setCustomMsgText("");
    setCustomMsgSelected(new Set(confirmedWithPhone.map((c) => c.id)));
    setCustomMsgOpen(true);
  }
  function startCustomMsgDispatch() {
    if (!task) return;
    const targets = task.chapas.filter((c) => customMsgSelected.has(c.id)) as ChapaSnap[];
    if (targets.length === 0 || !customMsgText.trim()) return;
    dispatchQueue.startCustomMsg(task.id_tarefa, targets, customMsgText.trim(), task.empresa);
    setCustomMsgOpen(false);
  }

  async function confirmAllPendentes() {
    if (!task) return;
    const targets = task.chapas.filter((c) => c.nome_chapa && c.status_contato === "pendente");
    if (targets.length === 0) return;
    const ids = targets.map((c) => c.id);
    const prev = targets.map((c) => ({ id: c.id, status_contato: c.status_contato }));
    try {
      const db = await getDb();
      await db.execute(
        `UPDATE chapas SET status_contato = 'confirmado', data_contato = ? WHERE id IN (${placeholders(ids.length)})`,
        [new Date().toISOString(), ...ids],
      );
    } catch (e) {
      toast.error(errMsg(e));
      return;
    }
    push({
      label: `confirmar ${ids.length} chapas — #${task.id_tarefa}`,
      revert: async () => {
        const db = await getDb();
        for (const p of prev) {
          await db.execute("UPDATE chapas SET status_contato = ? WHERE id = ?", [p.status_contato, p.id]);
        }
      },
      onReverted: onRefresh,
    });
    onRefresh();
  }

  useEffect(() => {
    if (!open) { setSelectedKey(null); return; }
    // Ao abrir, seleciona automaticamente o primeiro chapa com conversa —
    // senão o grupo do cliente, senão nada (fica vazio até o operador clicar).
    if (!task) return;
    const firstWithChat = task.chapas.find((c) =>
      task.fup_log.some((f) => f.chapa_id === c.id && f.umbler_chat_id),
    );
    if (firstWithChat) setSelectedKey(firstWithChat.id);
    else if (clienteInfo?.umbler_group_chat_id) setSelectedKey(CLIENTE_KEY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id_tarefa]);

  useEffect(() => {
    if (!resizing) return;
    function onMove(e: MouseEvent) {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
      setWidth(next);
    }
    function onUp() {
      setResizing(false);
      try { localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* noop */ }
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  const chatEntryByChapa = useMemo(() => {
    if (!task) return new Map<string, { umbler_chat_id: string | null; data_disparo: string }>();
    const map = new Map<string, { umbler_chat_id: string | null; data_disparo: string }>();
    for (const f of task.fup_log) {
      if (!f.chapa_id || !f.umbler_chat_id) continue;
      const cur = map.get(f.chapa_id);
      if (!cur || f.data_disparo > cur.data_disparo) {
        map.set(f.chapa_id, { umbler_chat_id: f.umbler_chat_id, data_disparo: f.data_disparo });
      }
    }
    return map;
  }, [task]);

  const realChapas = task?.chapas.filter((c) => c.nome_chapa) ?? [];
  const selectedChapa = task && selectedKey && selectedKey !== CLIENTE_KEY
    ? realChapas.find((c) => c.id === selectedKey) ?? null
    : null;

  // Hooks continuam antes do early-return abaixo — precisam ser chamados
  // sempre, na mesma ordem, mesmo quando task/selectedChapa são nulos.
  const chapaJobState = useChapaJobState(selectedChapa?.id ?? "");

  if (!task) return null;

  const confirmedCount = task.chapas.filter((c) => c.status_contato === "confirmado").length;
  const requested = task.quantidade_chapas || task.chapas.length;
  const fillPct = requested > 0 ? Math.round((confirmedCount / requested) * 100) : 0;
  const vacantCount = Math.max(0, requested - realChapas.length);
  const minutesUntilStart = (parseTaskDate(task.data_tarefa, task.cidade_uf).getTime() - Date.now()) / 60_000;
  const showApproachAlert = minutesUntilStart > 0 && minutesUntilStart <= 60 && fillPct < 95;
  const allPending = realChapas.length > 0 && realChapas.every((c) => c.status_contato === "pendente");
  const eligibleConfirmAll = allPending && minutesUntilStart <= 120;
  const confirmedWithPhone = task.chapas.filter((c) => c.status_contato === "confirmado" && c.telefone_chapa && c.nome_chapa);

  const selectedChatId = selectedKey === CLIENTE_KEY
    ? clienteInfo?.umbler_group_chat_id ?? null
    : selectedChapa
    ? chatEntryByChapa.get(selectedChapa.id)?.umbler_chat_id ?? null
    : null;
  const selectedName = selectedKey === CLIENTE_KEY
    ? `Grupo — ${clienteInfo?.nome ?? task.empresa}`
    : selectedChapa?.nome_chapa ?? "";
  const selectedTelefone = selectedKey === CLIENTE_KEY
    ? null // envio pro grupo não confirmado ainda — só visualização
    : selectedChapa?.telefone_chapa ?? null;

  const chapaPendingAction = chapaJobState?.action ?? null;
  const chapaCountdown = chapaJobState?.remaining ?? 0;
  const cancelCount = selectedChapa
    ? task.fup_log.filter((f) => f.canal === "umbler_cancelamento" && f.chapa_id === selectedChapa.id).length
    : 0;
  const cancelTaskCount = selectedChapa
    ? task.fup_log.filter((f) => f.canal === "umbler_cancelamento_tarefa" && f.chapa_id === selectedChapa.id).length
    : 0;
  const cancelSent = selectedChapa ? (() => {
    try { return !!localStorage.getItem(`umbler_cancel_${selectedChapa.id}`); } catch { return false; }
  })() : false;
  const cancelTaskSent = selectedChapa ? (() => {
    try { return !!localStorage.getItem(`umbler_cancel_task_${selectedChapa.id}`); } catch { return false; }
  })() : false;
  const everSentCancel = cancelCount > 0 || cancelSent;
  const everSentTask = cancelTaskCount > 0 || cancelTaskSent;

  // Histórico completo — todo nome que passou pela tarefa, com horário.
  // Entradas sem chapa_id (resumo de disparo em massa) ficam de fora daqui,
  // já aparecem contadas nos botões de ação (fupAllCount-like).
  const fupHistory = task.fup_log
    .filter((f) => f.chapa_id)
    .map((f) => ({
      ...f,
      nome: task.chapas.find((c) => c.id === f.chapa_id)?.nome_chapa ?? "Chapa removido",
    }))
    .sort((a, b) => b.data_disparo.localeCompare(a.data_disparo));

  async function updateChapaStatus(chapaId: string, patch: Record<string, unknown>, label: string) {
    const chapa = task!.chapas.find((c) => c.id === chapaId);
    if (!chapa) return;
    const prev: Record<string, unknown> = {};
    Object.keys(patch).forEach((k) => { prev[k] = (chapa as Record<string, unknown>)[k] ?? null; });
    try {
      const db = await getDb();
      const setClauses = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
      await db.execute(`UPDATE chapas SET ${setClauses} WHERE id = ?`, [...Object.values(patch), chapaId]);
    } catch (e) {
      toast.error(errMsg(e));
      return;
    }
    push({
      label,
      revert: async () => {
        const db = await getDb();
        const setClauses = Object.keys(prev).map((k) => `${k} = ?`).join(", ");
        await db.execute(`UPDATE chapas SET ${setClauses} WHERE id = ?`, [...Object.values(prev), chapaId]);
      },
      onReverted: onRefresh,
    });
    onRefresh();
  }

  function copyConfirmedList() {
    const confirmados = task!.chapas.filter((c) => c.status_contato === "confirmado" && c.nome_chapa);
    if (confirmados.length === 0) { toast.error("Nenhum confirmado ainda"); return; }
    const lines = confirmados.map((c) => `${c.nome_chapa}${c.telefone_chapa ? ` - ${c.telefone_chapa}` : ""}`);
    clipboardWrite(lines.join("\n"), `${confirmados.length} confirmado(s) copiado(s)`);
  }

  function copyCpfConfirmados() {
    const confirmados = task!.chapas.filter((c) => c.status_contato === "confirmado" && c.nome_chapa && c.cpf);
    if (confirmados.length === 0) { toast.error("Nenhum CPF de confirmado disponível"); return; }
    const lines = confirmados.map((c) => c.cpf);
    clipboardWrite(lines.join("\n"), `${confirmados.length} CPF(s) copiado(s)`);
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-y-0 right-0 z-40 bg-card border-l border-border shadow-elevated flex flex-col"
          style={{ width, transition: resizing ? "none" : "width 120ms ease-out" }}
        >
          <div
            onMouseDown={() => setResizing(true)}
            className="absolute top-0 bottom-0 left-0 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-primary/30 z-10"
            title="Arraste pra redimensionar"
          />

          {/* Header — informações da tarefa */}
          <div className="shrink-0 border-b border-border p-3">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold text-foreground truncate capitalize">{task.empresa.toLowerCase()}</p>
                  {task.is_overnight && (
                    <span title="Overnight"><Moon className="h-3 w-3 text-overnight shrink-0" /></span>
                  )}
                  {task.continuingFromYesterday && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-overnight/15 text-overnight border border-overnight/30 shrink-0">
                      Ontem
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => clipboardWrite(String(task.id_tarefa), `Código copiado: #${task.id_tarefa}`)}
                    className="text-[10px] text-muted-foreground hover:text-primary shrink-0"
                    title="Copiar código da tarefa"
                  >
                    #{task.id_tarefa}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {fmtTime(task.data_tarefa)} · {task.cidade_uf ?? "—"} · {confirmedCount}/{requested} confirmados ({fillPct}%)
                  {vacantCount > 0 && <> · {vacantCount} vaga{vacantCount !== 1 ? "s" : ""} em aberto</>}
                </p>
              </div>
              <a
                href={`https://app.meu-chapa.com/admin/edit-task/${task.id_tarefa}`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground transition-colors"
                title="Abrir no Meu Chapa"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="mt-2">
              <FillRateBar confirmed={confirmedCount} requested={requested} heightClass="h-1.5" />
            </div>

            {showApproachAlert && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-md px-2 py-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Tarefa em menos de 1h com preenchimento abaixo do esperado
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={copyConfirmedList}>
                <Copy className="h-3 w-3" /> Copiar confirmados
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={copyCpfConfirmados}>
                <Copy className="h-3 w-3" /> Copiar CPFs
              </Button>
              {eligibleConfirmAll && (
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 border-success/40 text-success hover:bg-success/10" onClick={confirmAllPendentes}>
                  <Check className="h-3 w-3" /> Confirmar todos
                </Button>
              )}
              {(umblerReady || fupAllSent) && (
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-[11px] gap-1 ${fupAllPending ? "border-warning/50 bg-warning/10 text-warning" : ""}`}
                  onClick={fupAllPending ? () => dispatchQueue.abortMassFup(task.id_tarefa) : startFupAll}
                >
                  {fupAllPending ? (
                    <><X className="h-3 w-3" /> {fupAllProgress?.phase === "sending" ? `${fupAllProgress.sent}/${task.chapas.length}` : "enviando…"}</>
                  ) : (
                    <><Megaphone className="h-3 w-3" /> FUP Todos{fupAllSent ? " (reenviar)" : ""}</>
                  )}
                </Button>
              )}
              {confirmedWithPhone.length > 0 && (
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={openCustomMsgDialog}>
                  <MessageSquare className="h-3 w-3" /> Mensagem personalizada
                </Button>
              )}
              {taskCancelTemplateReady && (taskCancelPending || taskCancelSent) && (
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-[11px] gap-1 ${
                    taskCancelPending
                      ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                      : "border-muted-foreground/20 text-muted-foreground/50 cursor-default"
                  }`}
                  onClick={taskCancelPending ? stopTaskCancelCountdown : undefined}
                >
                  {taskCancelPending ? (
                    <><X className="h-3 w-3" /><span>{taskCancelCountdown}s</span></>
                  ) : (
                    <><Check className="h-3 w-3" /><span>Cancelamento enviado</span></>
                  )}
                </Button>
              )}
              {taskCancelTemplateReady && !taskCancelPending && !taskCancelSent && (
                <SlideToConfirm
                  onConfirm={startTaskCancelCountdown}
                  label="Cancelar Tarefa"
                  icon={<XCircle className="h-3.5 w-3.5" />}
                  width={170}
                />
              )}
            </div>
          </div>

          {/* Corpo — lista + conversa */}
          <div className="flex-1 flex min-h-0">
            <div className="w-[220px] shrink-0 border-r border-border overflow-y-auto">
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Chapas ({realChapas.length})
              </p>
              {realChapas.map((c) => {
                const hasChat = chatEntryByChapa.has(c.id);
                const selected = selectedKey === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedKey(c.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                      selected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50 border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className={`h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold ${
                      selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {c.nome_chapa!.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] truncate ${selected ? "font-medium" : ""}`}>{c.nome_chapa}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{STATUS_LABEL[c.status_contato] ?? c.status_contato}</p>
                    </div>
                    {c.status_contato === "confirmado" && <Check className="h-3 w-3 text-success shrink-0" />}
                    {c.status_contato === "nao_respondeu" && <AlertTriangle className="h-3 w-3 text-warning shrink-0" />}
                    {!hasChat && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 shrink-0" title="Sem conversa vinculada" />}
                  </button>
                );
              })}

              {clienteInfo && (
                <>
                  <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground border-t border-border mt-1">
                    Cliente
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(CLIENTE_KEY)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                      selectedKey === CLIENTE_KEY ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50 border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="h-6 w-6 rounded-full shrink-0 flex items-center justify-center bg-primary/10">
                      <Users className="h-3 w-3 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] truncate">Grupo — {clienteInfo.nome}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {clienteInfo.umbler_group_chat_id ? "Vinculado" : "Não vinculado"}
                      </p>
                    </div>
                  </button>
                </>
              )}

              <div className="border-t border-border mt-2">
                <ValidationPanel
                  id_tarefa={task.id_tarefa}
                  chapas={task.chapas}
                  validacao_status={(task.validacao_status ?? "aguardando") as import("@/components/ValidationStepper").ValidationStep}
                  data_validacao_recebida={task.data_validacao_recebida ?? null}
                  data_upload_meu_chapa={task.data_upload_meu_chapa ?? null}
                  obs_validacao={task.obs_validacao ?? null}
                  onRefresh={onRefresh}
                />
              </div>
              <div className="border-t border-border">
                <ObservationsPanel
                  id_tarefa={task.id_tarefa}
                  empresa={task.empresa}
                  data_tarefa={task.data_tarefa}
                  observacoes={task.observacoes ?? null}
                  observacoes_updated_at={task.observacoes_updated_at ?? null}
                />
              </div>

              <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="border-t border-border">
                <CollapsibleTrigger asChild>
                  <button className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors">
                    <span>Histórico ({fupHistory.length})</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-2 space-y-1.5">
                  {fupHistory.length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">Nenhum disparo registrado ainda</p>
                  )}
                  {fupHistory.map((f) => (
                    <div key={f.id} className="text-[11px]">
                      <p className="font-medium text-foreground truncate">{f.nome}</p>
                      <p className="text-muted-foreground truncate">
                        {CANAL_LABEL[f.canal] ?? f.canal} · {fmtDateTime(f.data_disparo)}
                      </p>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>

            <div className="flex-1 flex flex-col min-w-0">
              {selectedChapa && (
                <div className="shrink-0 border-b border-border px-3 py-1.5 flex items-center gap-1.5 flex-wrap">
                  <Button
                    size="sm"
                    className="h-6 text-[11px] gap-1 bg-success hover:bg-success/90 text-success-foreground"
                    onClick={() => updateChapaStatus(selectedChapa.id, { status_contato: "confirmado", data_contato: new Date().toISOString() }, `confirmar ${selectedChapa.nome_chapa}`)}
                    disabled={selectedChapa.status_contato === "confirmado"}
                  >
                    <Check className="h-3 w-3" /> Confirmar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] gap-1"
                    onClick={() => updateChapaStatus(selectedChapa.id, { status_contato: "nao_respondeu" }, `não respondeu — ${selectedChapa.nome_chapa}`)}
                    disabled={selectedChapa.status_contato === "nao_respondeu"}
                  >
                    <AlertTriangle className="h-3 w-3" /> Sem resposta
                  </Button>

                  {selectedChapa.telefone_chapa && (cancelTemplateReady || taskCancelTemplateReady || everSentCancel || everSentTask) && (
                    chapaPendingAction === "cancel" || chapaPendingAction === "cancel_task" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] gap-1 border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                        onClick={() => dispatchQueue.abortChapaJob(selectedChapa.id)}
                      >
                        <X className="h-3 w-3" /> {chapaCountdown}s
                      </Button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={chapaPendingAction === "fup"}
                            className={`h-6 text-[11px] gap-1 ${
                              everSentCancel || everSentTask
                                ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                                : ""
                            }`}
                          >
                            {everSentCancel || everSentTask ? <Check className="h-3 w-3" /> : <UserMinus className="h-3 w-3" />}
                            Cancelar <ChevronDown className="h-3 w-3 opacity-60" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {(cancelTemplateReady || everSentCancel) && (
                            <DropdownMenuItem onClick={() => dispatchQueue.startChapaJob(selectedChapa.id, "cancel", selectedChapa as ChapaSnap, { id_tarefa: task.id_tarefa, data_tarefa: task.data_tarefa, empresa: task.empresa, cidade_uf: task.cidade_uf ?? null })}>
                              {everSentCancel ? `Sem resposta${cancelCount > 0 ? ` (${cancelCount}x)` : ""} — reenviar` : "Sem resposta (notificar chapa)"}
                            </DropdownMenuItem>
                          )}
                          {(taskCancelTemplateReady || everSentTask) && (
                            <DropdownMenuItem onClick={() => dispatchQueue.startChapaJob(selectedChapa.id, "cancel_task", selectedChapa as ChapaSnap, { id_tarefa: task.id_tarefa, data_tarefa: task.data_tarefa, empresa: task.empresa, cidade_uf: task.cidade_uf ?? null })}>
                              {everSentTask ? `Cancelar tarefa${cancelTaskCount > 0 ? ` (${cancelTaskCount}x)` : ""} — reenviar` : "Cancelar tarefa (individual)"}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Mais opções"
                        className="ml-auto inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {selectedChapa.status_contato !== "pendente" && (
                        <DropdownMenuItem onClick={() => updateChapaStatus(selectedChapa.id, { status_contato: "pendente", data_contato: null }, `reabrir ${selectedChapa.nome_chapa}`)}>
                          Reabrir / desfazer
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => updateChapaStatus(selectedChapa.id, { canal_contato: "ligacao_3c", data_contato: new Date().toISOString() }, `contato 3C — ${selectedChapa.nome_chapa}`)}>
                        <Phone className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                        Registrar ligação 3C
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/chapas")}>
                        <BookUser className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                        Ver no Caderno de Chapas
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => updateChapaStatus(selectedChapa.id, { status_contato: "removido", data_remocao: new Date().toISOString(), motivo_remocao: null }, `remoção de ${selectedChapa.nome_chapa}`)}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        Sinalizar remoção
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              {selectedKey ? (
                <ConversationPane
                  key={selectedKey}
                  chatId={selectedChatId}
                  personName={selectedName}
                  personTelefone={selectedTelefone}
                  settings={umblerSettings}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-center p-6">
                  <p className="text-xs text-muted-foreground italic">
                    Selecione um chapa ou o grupo do cliente pra ver a conversa.
                  </p>
                </div>
              )}
            </div>
          </div>

          <Dialog open={customMsgOpen} onOpenChange={setCustomMsgOpen}>
            <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh]">
              <DialogHeader className="shrink-0">
                <DialogTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" /> Mensagem personalizada
                </DialogTitle>
                <DialogDescription>
                  Texto livre para os chapas confirmados desta tarefa.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
                <Textarea
                  value={customMsgText}
                  onChange={(e) => setCustomMsgText(e.target.value)}
                  placeholder="Digite a mensagem…"
                  className="min-h-20"
                />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Destinatários ({customMsgSelected.size}/{confirmedWithPhone.length})</p>
                  {confirmedWithPhone.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                      <Checkbox
                        checked={customMsgSelected.has(c.id)}
                        onCheckedChange={(checked) => {
                          setCustomMsgSelected((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(c.id); else next.delete(c.id);
                            return next;
                          });
                        }}
                      />
                      {c.nome_chapa}
                    </label>
                  ))}
                </div>
              </div>
              <DialogFooter className="shrink-0">
                <Button variant="outline" onClick={() => setCustomMsgOpen(false)}>Cancelar</Button>
                <Button onClick={startCustomMsgDispatch} disabled={!customMsgText.trim() || customMsgSelected.size === 0 || customMsgSending}>
                  Enviar pra {customMsgSelected.size} chapa(s)
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </>
  );
}
