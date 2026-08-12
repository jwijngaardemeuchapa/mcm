import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X, Users, Copy, ExternalLink, Check, AlertTriangle, UserMinus, ChevronDown, XCircle,
  MoreHorizontal, Phone, BookUser, Megaphone, MessageSquare, Moon, RefreshCw, Send, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GroupChatPicker } from "@/components/GroupChatPicker";
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

function fmtElapsed(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// Cor/ícone por status — cor conta a história antes de precisar ler o texto:
// verde = resolvido, azul = aguardando resposta (já teve FUP), vermelho =
// precisa de ação (nunca teve contato ou negou), âmbar = sem resposta,
// cinza = removido.
function chapaStatusMeta(status: string, hasDispatch: boolean) {
  if (status === "confirmado") return { dot: "bg-success", text: "text-success", bg: "bg-success/10", border: "border-l-success" };
  if (status === "nao_respondeu") return { dot: "bg-warning", text: "text-warning", bg: "bg-warning/10", border: "border-l-warning" };
  if (status === "cancelado") return { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/10", border: "border-l-destructive" };
  if (status === "removido") return { dot: "bg-muted-foreground/40", text: "text-muted-foreground", bg: "bg-muted/40", border: "border-l-transparent" };
  // pendente
  if (hasDispatch) return { dot: "bg-info", text: "text-info", bg: "bg-info/10", border: "border-l-info" };
  return { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/5", border: "border-l-destructive/60" };
}

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
// da pessoa selecionada à direita. Tela cheia, slide-up ao abrir/slide-down
// ao fechar (Radix Dialog customizado) — desenho pedido pelo usuário.
export function TaskDetailPanel({ task, open, onClose, onRefresh }: TaskDetailPanelProps) {
  const navigate = useNavigate();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
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

  // Disparo mais recente por chapa (qualquer canal, com ou sem chat
  // vinculado) — alimenta o contador "há Xmin" na lista.
  const lastDispatchByChapa = useMemo(() => {
    if (!task) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const f of task.fup_log) {
      if (!f.chapa_id) continue;
      const cur = map.get(f.chapa_id);
      if (!cur || f.data_disparo > cur) map.set(f.chapa_id, f.data_disparo);
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
  const umblerCount = selectedChapa
    ? task.fup_log.filter((f) => f.canal === "umbler_talk" && f.chapa_id === selectedChapa.id).length
    : 0;
  const umblerEverSent = selectedChapa
    ? (selectedChapa.canal_contato === "umbler_talk" || umblerCount > 0)
    : false;
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
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-40 bg-card flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:duration-200 data-[state=open]:duration-300"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Detalhes da tarefa — {task?.empresa ?? ""}</DialogPrimitive.Title>
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
              {eligibleConfirmAll && (
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 border-success/40 text-success hover:bg-success/10" onClick={confirmAllPendentes}>
                  <Check className="h-3 w-3" /> Confirmar todos
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                    <Download className="h-3 w-3" /> Copiar <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={copyConfirmedList}>
                    <Copy className="h-3.5 w-3.5 mr-1.5 opacity-60" /> Nome + telefone dos confirmados
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={copyCpfConfirmados}>
                    <Copy className="h-3.5 w-3.5 mr-1.5 opacity-60" /> CPFs dos confirmados
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
            <div className="w-[300px] shrink-0 border-r border-border overflow-y-auto">
              <div className="px-3 pt-2 pb-1 flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Chapas ({realChapas.length})
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      <span className="w-1.5 h-1.5 rounded-full bg-info" />
                      <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs space-y-0.5">
                    <p><span className="text-success">●</span> Confirmado</p>
                    <p><span className="text-info">●</span> Pendente — FUP já enviado</p>
                    <p><span className="text-warning">●</span> Sem resposta</p>
                    <p><span className="text-destructive">●</span> Sem contato ainda / negou FUP</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {realChapas.map((c) => {
                const lastDispatch = lastDispatchByChapa.get(c.id) ?? null;
                const selected = selectedKey === c.id;
                const meta = chapaStatusMeta(c.status_contato, !!lastDispatch);
                const elapsedMin = lastDispatch ? Math.floor((Date.now() - new Date(lastDispatch).getTime()) / 60_000) : null;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedKey(c.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border-l-2 ${meta.border} ${
                      selected ? "bg-primary/10" : `${meta.bg} hover:opacity-80`
                    } ${c.status_contato === "removido" ? "opacity-50" : ""}`}
                  >
                    <div className={`h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold ${
                      selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {c.nome_chapa!.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] truncate ${selected ? "font-medium" : ""} ${c.status_contato === "removido" ? "line-through" : ""}`}>{c.nome_chapa}</p>
                      <p className={`text-[11px] truncate flex items-center gap-1 ${meta.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                        {STATUS_LABEL[c.status_contato] ?? c.status_contato}
                        {c.status_contato === "pendente" && !lastDispatch && " — sem contato"}
                        {elapsedMin !== null && c.status_contato !== "confirmado" && (
                          <span className="text-muted-foreground">· há {fmtElapsed(elapsedMin)}</span>
                        )}
                      </p>
                    </div>
                  </button>
                );
              })}

              {clienteInfo && (
                <>
                  <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground border-t border-border mt-1">
                    Cliente
                  </p>
                  <div className={`w-full flex items-center gap-2 px-3 py-2 transition-colors ${
                      selectedKey === CLIENTE_KEY ? "bg-primary/10 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (clienteInfo.umbler_group_chat_id) setSelectedKey(CLIENTE_KEY);
                        else setGroupPickerOpen(true);
                      }}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left hover:opacity-80"
                    >
                      <div className="h-6 w-6 rounded-full shrink-0 flex items-center justify-center bg-primary/10">
                        <Users className="h-3 w-3 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] truncate">Grupo — {clienteInfo.nome}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {clienteInfo.umbler_group_chat_id ? "Vinculado — clique pra ver conversa" : "Não vinculado — clique pra buscar"}
                        </p>
                      </div>
                    </button>
                    {clienteInfo.umbler_group_chat_id && (
                      <button
                        type="button"
                        onClick={() => setGroupPickerOpen(true)}
                        className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors"
                        title="Trocar grupo vinculado"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    )}
                  </div>
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

                  {selectedChapa.telefone_chapa && umblerReady && (
                    chapaPendingAction === "fup" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] gap-1 border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                        onClick={() => dispatchQueue.abortChapaJob(selectedChapa.id)}
                      >
                        <X className="h-3 w-3" /> {chapaCountdown}s
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={chapaPendingAction === "cancel" || chapaPendingAction === "cancel_task"}
                        className={`h-6 text-[11px] gap-1 ${
                          umblerEverSent
                            ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
                            : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                        }`}
                        onClick={() => dispatchQueue.startChapaJob(selectedChapa.id, "fup", selectedChapa as ChapaSnap, { id_tarefa: task.id_tarefa, data_tarefa: task.data_tarefa, empresa: task.empresa, cidade_uf: task.cidade_uf ?? null })}
                      >
                        {umblerEverSent ? <Check className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                        {umblerEverSent ? `Enviado${umblerCount > 0 ? ` (${umblerCount}x)` : ""}` : "Enviar Umbler"}
                      </Button>
                    )
                  )}

                  {selectedChapa.telefone_chapa && (chapaPendingAction === "cancel" || chapaPendingAction === "cancel_task") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] gap-1 border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                      onClick={() => dispatchQueue.abortChapaJob(selectedChapa.id)}
                    >
                      <X className="h-3 w-3" /> {chapaCountdown}s
                    </Button>
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
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem
                        onClick={() => updateChapaStatus(selectedChapa.id, { status_contato: "nao_respondeu" }, `não respondeu — ${selectedChapa.nome_chapa}`)}
                        disabled={selectedChapa.status_contato === "nao_respondeu"}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                        Marcar sem resposta
                      </DropdownMenuItem>
                      {selectedChapa.status_contato !== "pendente" && (
                        <DropdownMenuItem onClick={() => updateChapaStatus(selectedChapa.id, { status_contato: "pendente", data_contato: null }, `reabrir ${selectedChapa.nome_chapa}`)}>
                          Reabrir / desfazer
                        </DropdownMenuItem>
                      )}
                      {selectedChapa.telefone_chapa && (cancelTemplateReady || everSentCancel) && (
                        <DropdownMenuItem
                          disabled={chapaPendingAction === "fup"}
                          onClick={() => dispatchQueue.startChapaJob(selectedChapa.id, "cancel", selectedChapa as ChapaSnap, { id_tarefa: task.id_tarefa, data_tarefa: task.data_tarefa, empresa: task.empresa, cidade_uf: task.cidade_uf ?? null })}
                        >
                          <UserMinus className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                          {everSentCancel ? `Notificar sem resposta${cancelCount > 0 ? ` (${cancelCount}x)` : ""} — reenviar` : "Notificar sem resposta"}
                        </DropdownMenuItem>
                      )}
                      {selectedChapa.telefone_chapa && (taskCancelTemplateReady || everSentTask) && (
                        <DropdownMenuItem
                          disabled={chapaPendingAction === "fup"}
                          onClick={() => dispatchQueue.startChapaJob(selectedChapa.id, "cancel_task", selectedChapa as ChapaSnap, { id_tarefa: task.id_tarefa, data_tarefa: task.data_tarefa, empresa: task.empresa, cidade_uf: task.cidade_uf ?? null })}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                          {everSentTask ? `Cancelar tarefa${cancelTaskCount > 0 ? ` (${cancelTaskCount}x)` : ""} — reenviar` : "Cancelar tarefa (individual)"}
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
                  isGroup={selectedKey === CLIENTE_KEY}
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

          {clienteInfo && (
            <GroupChatPicker
              open={groupPickerOpen}
              onOpenChange={setGroupPickerOpen}
              clienteId={clienteInfo.id}
              clienteNome={clienteInfo.nome}
              clienteTelefone={clienteInfo.telefone}
              settings={umblerSettings}
              onLinked={() => { reloadClienteInfo(); setSelectedKey(CLIENTE_KEY); }}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
