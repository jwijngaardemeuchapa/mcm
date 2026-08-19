import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as XLSX from "xlsx";
import {
  X, Users, Copy, ExternalLink, Check, AlertTriangle, UserMinus, ChevronDown, XCircle,
  MoreHorizontal, Phone, BookUser, Megaphone, MessageSquare, Moon, RefreshCw, Send, Download,
  Clock, MapPin, UserCheck, History, ClipboardList, Receipt, ArrowLeft, Pencil, Plus,
  ChevronLeft, ChevronRight,
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConversationPane } from "@/components/ConversationPane";
import { SlideToConfirm } from "@/components/ui/slide-to-confirm";
import { ValidationPanel } from "@/components/ValidationPanel";
import { ObservationsPanel } from "@/components/ObservationsPanel";
import { FillRateBar } from "@/components/FillRateBar";
import { useClienteInfo } from "@/lib/useClienteInfo";
import { pushChapaStatusToCentral, pushPaymentRequestToCentral } from "@/lib/central";
import { useUndo } from "@/lib/undo";
import { getDb, errMsg, placeholders } from "@/lib/db";
import { readSettings, writeSettings } from "@/lib/settings";
import { fmtTime, fmtDateTime, fmtSP, parseTaskDate } from "@/lib/datetime";
import { toast } from "sonner";
import { dispatchQueue, type ChapaSnap, type TaskSnap } from "@/lib/dispatchQueue";
import { useChapaJobState, useTaskCancelState, useMassFupState, useCustomMsgState } from "@/lib/useDispatchJob";
import { type TaskWithChapas, UnreadDot, AndamentoJustificationBadge } from "@/components/TaskCard";
import { last11Digits } from "@/lib/umbler";
import { useWatcherLog } from "@/lib/WatcherContext";
import { setActiveTaskNav } from "@/lib/taskNav";
import { needsAndamentoJustification } from "@/lib/taskState";
import { findChatLinkForChapa } from "@/lib/chatLinks";

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

// Lista de Presença (CSV/XLSX) — mesma lógica do TaskCard (Cards), portada
// pra cá porque Panorama/Timeline não tinham essa exportação (só existia
// nos Cards).
function companyFilenameSlug(empresa: string): string {
  const cleaned = (empresa || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const pick = words.slice(0, 2).join("");
  return (pick || "tarefa").toLowerCase();
}

function csvExportKey(id: number) {
  return `csv_exported_task_${id}`;
}

function getCsvExportedAt(id: number): string | null {
  try {
    return localStorage.getItem(csvExportKey(id));
  } catch {
    return null;
  }
}

// Cor/ícone por status — cor conta a história antes de precisar ler o texto:
// verde = resolvido, azul = aguardando resposta (já teve FUP), vermelho =
// precisa de ação (nunca teve contato ou negou), âmbar = sem resposta,
// cinza = removido.
function chapaStatusMeta(status: string, hasDispatch: boolean) {
  if (status === "confirmado") return { dot: "bg-success", text: "text-success", bg: "bg-success/[0.07]", border: "border-l-success", avatar: "from-success to-success/70" };
  if (status === "nao_respondeu") return { dot: "bg-warning", text: "text-warning", bg: "bg-warning/[0.07]", border: "border-l-warning", avatar: "from-warning to-warning/70" };
  if (status === "cancelado") return { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/[0.07]", border: "border-l-destructive", avatar: "from-destructive to-destructive/70" };
  if (status === "removido") return { dot: "bg-muted-foreground/40", text: "text-muted-foreground", bg: "bg-muted/40", border: "border-l-transparent", avatar: "from-muted-foreground/50 to-muted-foreground/30" };
  // pendente
  if (hasDispatch) return { dot: "bg-info", text: "text-info", bg: "bg-info/[0.07]", border: "border-l-info", avatar: "from-info to-info/70" };
  return { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/[0.05]", border: "border-l-destructive/60", avatar: "from-destructive/80 to-destructive/50" };
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
  // Navegação prev/next entre tarefas — ordem "visível" (já filtrada/
  // ordenada) de quem chama (Panorama ou Dashboard/Timeline). Opcional: sem
  // isso o painel funciona exatamente como antes, sem setas de navegação.
  orderedIds?: number[];
  onNavigateTask?: (id: number) => void;
};

// Painel de tarefa — lista de chapas + grupo do cliente à esquerda, conversa
// da pessoa selecionada à direita. Tela cheia, slide-up ao abrir/slide-down
// ao fechar (Radix Dialog customizado) — desenho pedido pelo usuário.
export function TaskDetailPanel({ task, open, onClose, onRefresh, orderedIds, onNavigateTask }: TaskDetailPanelProps) {
  const navigate = useNavigate();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [customMsgOpen, setCustomMsgOpen] = useState(false);
  const [customMsgText, setCustomMsgText] = useState("");
  const [customMsgSelected, setCustomMsgSelected] = useState<Set<string>>(new Set());
  // Atalhos de mensagem salvos — mesma settings global (customMsgTemplates)
  // já usada em TaskCard.tsx (Cards) e ConversationPane.tsx; faltava aqui.
  const [msgTemplates, setMsgTemplates] = useState<string[]>(() => readSettings().customMsgTemplates);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [editingTplIdx, setEditingTplIdx] = useState<number | null>(null);
  const [editingTplText, setEditingTplText] = useState("");
  function persistTemplates(next: string[]) {
    setMsgTemplates(next);
    writeSettings({ customMsgTemplates: next });
  }
  // Solicitar pagamento (empurra pra Central) fica só na build beta.
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSelected, setPaymentSelected] = useState<Set<string>>(new Set());
  const [paymentValores, setPaymentValores] = useState<Record<string, string>>({});
  const [paymentMotivo, setPaymentMotivo] = useState("");
  const [paymentSending, setPaymentSending] = useState(false);
  const { push } = useUndo();
  const umblerSettings = readSettings().umblerSettings;
  const [clienteInfo, reloadClienteInfo] = useClienteInfo(task?.empresa ?? "");
  const { unreadPhones, unreadChatIds } = useWatcherLog();

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

  // Lista de Presença (CSV) — ver função exportCSV mais abaixo.
  const [csvExportedAt, setCsvExportedAt] = useState<string | null>(null);
  useEffect(() => {
    if (taskId == null) { setCsvExportedAt(null); return; }
    setCsvExportedAt(getCsvExportedAt(taskId));
  }, [taskId]);

  // Segue o mesmo modelo "Lista de Presença" do TaskCard (Cards) — título
  // mesclado A1:F1, campos Data/Empresa/Local/Responsável nas linhas 2-3,
  // cabeçalho na linha 5, chapas numeradas a partir da 6.
  function exportCSV() {
    if (!task) return;
    const chapasValidas = task.chapas.filter((c) => c.status_contato !== "removido" && c.nome_chapa);
    const { operadorNome } = readSettings();

    const wsData: (string | number)[][] = [
      ["LISTA DE PRESENÇA", "", "", "", "", ""],
      ["Data:", fmtSP(task.data_tarefa, "dd/MM/yyyy"), "Empresa:", task.empresa, "", ""],
      ["Local da operação:", task.cidade_uf ?? "", "", "Responsável:", operadorNome || "", ""],
      [],
      ["Nº", "Nome", "CPF", "Horário de Entrada", "Horário de Saída", "Assinatura"],
      ...chapasValidas.map((c, i) => [i + 1, c.nome_chapa ?? "", c.cpf ?? "", "", "", ""]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    ws["!cols"] = [{ wch: 6 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 30 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lista de Presença");

    const slug = companyFilenameSlug(task.empresa);
    const time = fmtSP(task.data_tarefa, "HHmm");
    const filename = `${slug}_${time}.xlsx`;
    XLSX.writeFile(wb, filename);

    try {
      localStorage.setItem(csvExportKey(task.id_tarefa), new Date().toISOString());
    } catch {
      /* noop */
    }
    setCsvExportedAt(new Date().toISOString());
    toast.success(`Lista de presença exportada: ${filename}`);
  }

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
    for (const c of targets) {
      pushChapaStatusToCentral({
        id_tarefa: task.id_tarefa,
        telefone_chapa: c.telefone_chapa,
        cpf: c.cpf,
        nome_chapa: c.nome_chapa,
        status_contato: "confirmado",
      });
    }
    onRefresh();
  }

  useEffect(() => {
    // Abre sempre na lista compacta (nenhuma conversa pré-selecionada) — o
    // painel cresce e a conversa desliza da direita só quando o operador
    // clica explicitamente em "abrir conversa" de um chapa ou do cliente.
    setSelectedKey(null);
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
    // Mescla com chat_links (podem ter vindo de OUTRO analista via Central,
    // ver findChatLinkForChapa em chatLinks.ts) — vale o mais recente entre
    // o disparo local (fup_log) e o vínculo sincronizado (chat_links).
    for (const c of task.chapas) {
      const link = findChatLinkForChapa(task.chat_links, c);
      if (!link) continue;
      const cur = map.get(c.id);
      if (!cur || link.atualizado_em > cur.data_disparo) {
        map.set(c.id, { umbler_chat_id: link.umbler_chat_id, data_disparo: link.atualizado_em });
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

  // Navegação prev/next — respeita a ordem "visível" já filtrada/ordenada
  // recebida do chamador (Panorama tem sua própria lista; Dashboard passa a
  // da Timeline). Sem orderedIds/onNavigateTask o painel funciona como
  // antes, sem setas.
  const orderedIdsKey = orderedIds ? orderedIds.join(",") : "";
  const navInfo = useMemo(() => {
    if (!orderedIds || !onNavigateTask || taskId == null) return null;
    const idx = orderedIds.indexOf(taskId);
    if (idx === -1) return null;
    return {
      hasPrev: idx > 0,
      hasNext: idx < orderedIds.length - 1,
      prevId: idx > 0 ? orderedIds[idx - 1] : null,
      nextId: idx < orderedIds.length - 1 ? orderedIds[idx + 1] : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedIdsKey, onNavigateTask, taskId]);

  // Enquanto aberto, registra prev/next no singleton global — o keydown
  // handler do Dashboard consulta isso pra saber se ←/→ deve navegar entre
  // tarefas em vez de trocar o dia selecionado (MCM: navegação de tarefa).
  useEffect(() => {
    if (!open || !navInfo || !onNavigateTask) {
      setActiveTaskNav(null);
      return;
    }
    setActiveTaskNav({
      hasPrev: navInfo.hasPrev,
      hasNext: navInfo.hasNext,
      onNavigate: (direction) => {
        const id = direction === "prev" ? navInfo.prevId : navInfo.nextId;
        if (id != null) onNavigateTask(id);
      },
    });
    return () => setActiveTaskNav(null);
  }, [open, navInfo, onNavigateTask]);

  if (!task) return null;

  // Timer de FUP no header — só aparece enquanto a tarefa teve apenas
  // disparos em massa (FUP Todos, chapa_id nulo). No momento em que existir
  // QUALQUER disparo individual/manual (chapa_id preenchido), esse agregado
  // some daqui e cada chapa passa a mostrar o próprio "há Xmin" na lista
  // (CompactChapaRow / lastDispatchByChapa, já filtra só chapa_id != null).
  const hasIndividualDispatch = task.fup_log.some((f) => !!f.chapa_id);
  const lastFupLog = task.fup_log.length > 0
    ? task.fup_log.reduce((a, b) => (a.data_disparo > b.data_disparo ? a : b))
    : null;
  const lastFupAt = lastFupLog?.data_disparo ?? csvExportedAt ?? null;
  const minutesSinceFup = lastFupAt ? Math.floor((Date.now() - new Date(lastFupAt).getTime()) / 60_000) : null;
  const fupDispatched = task.fup_log.length > 0 || !!csvExportedAt;

  const confirmedCount = task.chapas.filter((c) => c.status_contato === "confirmado").length;
  const requested = task.quantidade_chapas || task.chapas.length;
  const needsAndamentoMotivo = needsAndamentoJustification(task);
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
    ? null // grupo não tem telefone — ConversationPane envia por chatId (isGroup) quando é null aqui
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
    // Espelha na Central quando é confirmação/cancelamento manual — pra
    // outros analistas e a liderança verem sem depender de olhar o WhatsApp.
    if (patch.status_contato === "confirmado" || patch.status_contato === "cancelado") {
      pushChapaStatusToCentral({
        id_tarefa: task!.id_tarefa,
        telefone_chapa: chapa.telefone_chapa,
        cpf: chapa.cpf,
        nome_chapa: chapa.nome_chapa,
        status_contato: patch.status_contato,
      });
    }
    onRefresh();
  }

  function copyConfirmedList() {
    const confirmados = task!.chapas.filter((c) => c.status_contato === "confirmado" && c.nome_chapa);
    if (confirmados.length === 0) { toast.error("Nenhum confirmado ainda"); return; }
    const lines = confirmados.map((c) => `${c.nome_chapa}${c.telefone_chapa ? ` - ${c.telefone_chapa}` : ""}`);
    clipboardWrite(lines.join("\n"), `${confirmados.length} confirmado(s) copiado(s)`);
  }

  // Todos os ajudantes da tarefa (não só confirmados) — existia no TaskCard
  // antigo espalhado em variantes (nome+CPF, só nomes), faltava nome+telefone
  // de todos no painel novo.
  function copyAllList() {
    const ativos = task!.chapas.filter((c) => c.status_contato !== "removido" && c.nome_chapa);
    if (ativos.length === 0) { toast.error("Nenhum ajudante nesta tarefa"); return; }
    const lines = ativos.map((c) => `${c.nome_chapa}${c.telefone_chapa ? ` - ${c.telefone_chapa}` : ""}`);
    clipboardWrite(lines.join("\n"), `${ativos.length} ajudante(s) copiado(s)`);
  }

  // A Question "tarefas do dia" do Metabase nem sempre traz CPF por linha —
  // quando falta, busca no cadastro geral (chapa_registry) por telefone,
  // mesmo fallback que já existia no TaskCard (Cards). Sem isso, essa ação
  // funcionava nos Cards e falhava aqui (Panorama/Timeline), mesma tarefa.
  async function copyCpfConfirmados() {
    const confirmados = task!.chapas.filter((c) => c.status_contato === "confirmado" && c.nome_chapa);
    if (confirmados.length === 0) { toast.error("Nenhum confirmado ainda"); return; }
    const semCpf = confirmados.filter((c) => !c.cpf && c.telefone_chapa);
    const phoneToCpf: Record<string, string> = {};
    if (semCpf.length > 0) {
      try {
        const db = await getDb();
        const phones = semCpf.map((c) => c.telefone_chapa!.replace(/\D/g, ""));
        const rows = await db.select<{ cpf: string; telefone: string }[]>(
          `SELECT cpf, REPLACE(REPLACE(REPLACE(REPLACE(telefone,' ',''),'-',''),'(',''),')','') as telefone
           FROM chapa_registry
           WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefone,' ',''),'-',''),'(',''),')','') IN (${phones.map(() => "?").join(",")})
             AND cpf IS NOT NULL`,
          phones,
        );
        for (const r of rows) phoneToCpf[r.telefone] = r.cpf;
      } catch { /* silencioso — segue só com o que já tinha */ }
    }
    const comCpf = confirmados
      .map((c) => c.cpf ?? phoneToCpf[(c.telefone_chapa ?? "").replace(/\D/g, "")] ?? null)
      .filter((cpf): cpf is string => !!cpf);
    if (comCpf.length === 0) { toast.error("Nenhum CPF de confirmado disponível"); return; }
    clipboardWrite(comCpf.join("\n"), `${comCpf.length} CPF(s) copiado(s)`);
  }

  // Painel abre compacto (só lista) e cresce quando uma conversa é aberta —
  // largura e slide-in do pane direito reagem a esse booleano.
  const hasSelection = !!selectedKey;

  // Só nomes, sem telefone e sem CPF — pedido explícito do usuário.
  function copyNamesOnly() {
    const ativos = task!.chapas.filter((c) => c.status_contato !== "removido" && c.nome_chapa);
    if (ativos.length === 0) { toast.error("Nenhum ajudante nesta tarefa"); return; }
    const lines = ativos.map((c) => c.nome_chapa);
    clipboardWrite(lines.join("\n"), `${ativos.length} nome(s) copiado(s)`);
  }

  // Ajudantes elegíveis pra solicitação de pagamento — mesmo critério do
  // copyAllList (ativos, com nome), o pagamento é sobre quem participou,
  // não só quem confirmou presença antes.
  const paymentEligible = task!.chapas.filter((c) => c.status_contato !== "removido" && c.nome_chapa);

  function openPaymentDialog() {
    setPaymentSelected(new Set());
    setPaymentValores({});
    setPaymentMotivo("");
    setPaymentOpen(true);
  }

  async function submitPaymentRequest() {
    const itens = paymentEligible
      .filter((c) => paymentSelected.has(c.id))
      .map((c) => ({
        nome: c.nome_chapa ?? "",
        telefone: c.telefone_chapa ?? "",
        valor: Number((paymentValores[c.id] ?? "0").replace(",", ".")) || 0,
      }));
    if (itens.length === 0) { toast.error("Selecione ao menos um ajudante"); return; }
    if (itens.some((i) => i.valor <= 0)) { toast.error("Informe o valor de cada ajudante selecionado"); return; }
    if (!paymentMotivo.trim()) { toast.error("Informe o motivo da solicitação"); return; }
    setPaymentSending(true);
    try {
      await pushPaymentRequestToCentral({
        id_tarefa: task!.id_tarefa,
        empresa: task!.empresa ?? null,
        motivo: paymentMotivo.trim(),
        itens,
      });
      toast.success(`Solicitação enviada — ${itens.length} ajudante(s)`);
      setPaymentOpen(false);
    } catch (e) {
      toast.error(errMsg(e) || "Falha ao enviar solicitação pra Central");
    } finally {
      setPaymentSending(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        {/* Wrapper flex centraliza o Content e dá espaço pras setas
            prev/next fora do card — substitui o antigo posicionamento
            fixed+translate por centralização via flexbox, que acomoda os
            botões como irmãos sem precisar medir a largura do dialog. */}
        <div className="fixed inset-0 z-40 flex items-center justify-center gap-3 px-3 pointer-events-none">
          {navInfo && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => navInfo.hasPrev && navInfo.prevId != null && onNavigateTask?.(navInfo.prevId)}
                  disabled={!navInfo.hasPrev}
                  className="pointer-events-auto shrink-0 h-10 w-10 rounded-full bg-card border border-border shadow-elevated flex items-center justify-center text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-card"
                  aria-label="Tarefa anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Tarefa anterior [←]</TooltipContent>
            </Tooltip>
          )}
        <DialogPrimitive.Content
          className={`pointer-events-auto shrink-0 relative z-40 h-[min(840px,90vh)] rounded-2xl shadow-2xl overflow-hidden bg-card flex flex-col transition-[width] duration-300 ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:duration-150 data-[state=open]:duration-200 ${
            hasSelection ? "w-[min(1180px,94vw)]" : "w-[min(640px,94vw)]"
          }`}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Detalhes da tarefa — {task?.empresa ?? ""}</DialogPrimitive.Title>
          {/* Header — informações da tarefa */}
          <div className="shrink-0 border-b border-border">
            <div className="bg-gradient-primary text-primary-foreground px-4 pt-3.5 pb-3.5">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg hover:bg-white/15 text-white/90 transition-colors"
                  aria-label="Fechar"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
                <div className="h-10 w-10 shrink-0 rounded-xl bg-white/20 backdrop-blur-sm text-white flex items-center justify-center text-base font-bold uppercase shadow-elevated">
                  {task.empresa.trim().charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[17px] font-display font-bold text-white truncate capitalize">{task.empresa.toLowerCase()}</p>
                    {needsAndamentoMotivo && <AndamentoJustificationBadge />}
                    {task.is_overnight && (
                      <span title="Overnight"><Moon className="h-3.5 w-3.5 text-white/90 shrink-0" /></span>
                    )}
                    {task.continuingFromYesterday && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 text-white border border-white/30 shrink-0">
                        Ontem
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => clipboardWrite(String(task.id_tarefa), `Código copiado: #${task.id_tarefa}`)}
                      className="text-[11px] font-mono text-white/75 hover:text-white shrink-0 transition-colors bg-white/10 rounded px-1.5 py-0.5"
                      title="Copiar código da tarefa"
                    >
                      #{task.id_tarefa}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs text-white/85">
                      <Clock className="h-3 w-3 shrink-0" /> {fmtTime(task.data_tarefa)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-white/85">
                      <MapPin className="h-3 w-3 shrink-0" /> {task.cidade_uf ?? "—"}
                    </span>
                    {vacantCount > 0 && (
                      <span className="text-xs text-white font-medium bg-white/15 rounded-full px-2 py-0.5">{vacantCount} vaga{vacantCount !== 1 ? "s" : ""} em aberto</span>
                    )}
                    {!hasIndividualDispatch && fupDispatched && minutesSinceFup !== null && confirmedCount < requested && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 text-xs text-white font-medium bg-white/15 rounded-full px-2 py-0.5">
                            <Clock className="h-3 w-3" /> FUP há {fmtElapsed(minutesSinceFup)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          Último disparo (FUP Todos): {fmtDateTime(lastFupAt!)}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[26px] font-display font-bold text-white leading-none tabular-nums">{fillPct}%</div>
                  <div className="text-[10.5px] text-white/80 mt-0.5 flex items-center gap-1 justify-end">
                    <UserCheck className="h-3 w-3 shrink-0" /> {confirmedCount}/{requested} confirmados
                  </div>
                </div>
                <a
                  href={`https://app.meu-chapa.com/admin/edit-task/${task.id_tarefa}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg hover:bg-white/15 text-white/90 transition-colors"
                  title="Abrir no Meu Chapa"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-3">
                <FillRateBar confirmed={confirmedCount} requested={requested} heightClass="h-1.5" />
              </div>
            </div>

            <div className="px-4 pt-3 pb-3">
              {showApproachAlert && (
                <div className="mb-2.5 flex items-center gap-1.5 text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-md px-2.5 py-1.5">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Tarefa em menos de 1h com preenchimento abaixo do esperado
                </div>
              )}

              <div className="flex items-center gap-1.5 flex-wrap">
              {(umblerReady || fupAllSent) && (
                <Button
                  size="sm"
                  variant={fupAllPending ? "outline" : "default"}
                  className={`h-7 text-[11px] gap-1 ${fupAllPending ? "border-warning/50 bg-warning/10 text-warning" : "shadow-elevated"}`}
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
                  <MessageSquare className="h-3 w-3" /> Mensagem a todos
                </Button>
              )}
              {eligibleConfirmAll && (
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 border-success/40 text-success hover:bg-success/10" onClick={confirmAllPendentes}>
                  <Check className="h-3 w-3" /> Confirmar todos
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className={`h-7 text-[11px] gap-1 ${
                  csvExportedAt
                    ? "border-success/40 text-success hover:bg-success/10"
                    : "border-warning/60 text-warning bg-warning/10 hover:bg-warning/20"
                }`}
                onClick={exportCSV}
                title={csvExportedAt ? `Exportado em ${fmtDateTime(csvExportedAt)} — clique para exportar novamente` : "Exporta a lista de presença (nome e CPF dos alocados) para impressão e validação do cliente"}
              >
                {csvExportedAt ? <Check className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                Lista de Presença
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                    <Download className="h-3 w-3" /> Copiar <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={copyNamesOnly}>
                    <Copy className="h-3.5 w-3.5 mr-1.5 opacity-60" /> Só nomes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={copyAllList}>
                    <Copy className="h-3.5 w-3.5 mr-1.5 opacity-60" /> Nome + telefone de todos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={copyConfirmedList}>
                    <Copy className="h-3.5 w-3.5 mr-1.5 opacity-60" /> Nome + telefone dos confirmados
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={copyCpfConfirmados}>
                    <Copy className="h-3.5 w-3.5 mr-1.5 opacity-60" /> CPFs dos confirmados
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {paymentEligible.length > 0 && (
                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={openPaymentDialog}>
                  <Receipt className="h-3 w-3" /> Solicitar pagamento
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
          </div>

          {/* Corpo — lista + conversa */}
          <div className="flex-1 flex min-h-0">
            <div
              className={`shrink-0 overflow-y-auto transition-[width] duration-300 ease-out ${
                hasSelection ? "w-[300px] border-r border-border" : "w-full"
              }`}
            >
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
              {realChapas.map((c) => (
                <CompactChapaRow
                  key={c.id}
                  c={c}
                  selected={selectedKey === c.id}
                  setSelectedKey={setSelectedKey}
                  lastDispatch={lastDispatchByChapa.get(c.id) ?? null}
                  fupLog={task.fup_log}
                  taskSnap={{ id_tarefa: task.id_tarefa, data_tarefa: task.data_tarefa, empresa: task.empresa, cidade_uf: task.cidade_uf ?? null }}
                  cancelTemplateReady={cancelTemplateReady}
                  taskCancelTemplateReady={taskCancelTemplateReady}
                  unreadPhones={unreadPhones}
                  updateChapaStatus={updateChapaStatus}
                />
              ))}

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
                        <p className="text-[13px] truncate flex items-center gap-1.5">
                          {!!clienteInfo.umbler_group_chat_id && unreadChatIds.has(clienteInfo.umbler_group_chat_id) && (
                            <UnreadDot title="Mensagem nova no Umbler" />
                          )}
                          <span className="truncate">Grupo — {clienteInfo.nome}</span>
                        </p>
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

            {hasSelection && (
            <div className="flex-1 flex flex-col min-w-0 animate-in slide-in-from-right-8 fade-in duration-300 ease-out">
              <div className="shrink-0 border-b border-border px-2 py-1.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedKey(null)}
                  className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Voltar pra lista"
                  title="Voltar pra lista"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[11px] text-muted-foreground">Voltar pra lista</span>
              </div>
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
                        onClick={() => {
                          const phone = (selectedChapa.telefone_chapa ?? "").replace(/\D/g, "");
                          clipboardWrite(`${selectedChapa.nome_chapa}${phone ? ` - ${phone}` : ""}`, "Nome e telefone copiados");
                        }}
                      >
                        <ClipboardList className="h-3.5 w-3.5 mr-1.5 opacity-60" />
                        Copiar nome + telefone
                      </DropdownMenuItem>
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
              <ConversationPane
                key={selectedKey}
                chatId={selectedChatId}
                personName={selectedName}
                personTelefone={selectedTelefone}
                settings={umblerSettings}
                isGroup={selectedKey === CLIENTE_KEY}
              />
            </div>
            )}
          </div>

          <Dialog open={customMsgOpen} onOpenChange={setCustomMsgOpen}>
            <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh]">
              <DialogHeader className="shrink-0">
                <DialogTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" /> Mensagem a todos
                </DialogTitle>
                <DialogDescription>
                  Texto livre para os chapas confirmados desta tarefa.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
                {msgTemplates.length > 0 && (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setShortcutsOpen((o) => !o)}
                      className="flex items-center gap-1.5 w-full text-left"
                    >
                      <span className="text-xs font-medium text-muted-foreground">Atalhos</span>
                      <span className="text-[10px] text-muted-foreground/60 bg-muted rounded-full px-1.5 py-0.5 leading-none tabular-nums">
                        {msgTemplates.length}
                      </span>
                      <ChevronDown
                        className={`h-3 w-3 text-muted-foreground/50 ml-auto transition-transform duration-150 ${shortcutsOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    {shortcutsOpen && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {msgTemplates.map((tpl, idx) =>
                          editingTplIdx === idx ? (
                            <div key={idx} className="flex items-center gap-1.5 w-full">
                              <Input
                                value={editingTplText}
                                onChange={(e) => setEditingTplText(e.target.value)}
                                className="h-7 text-xs flex-1"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && editingTplText.trim()) {
                                    persistTemplates(msgTemplates.map((t, i) => (i === idx ? editingTplText.trim() : t)));
                                    setEditingTplIdx(null);
                                  }
                                  if (e.key === "Escape") setEditingTplIdx(null);
                                }}
                              />
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-success"
                                disabled={!editingTplText.trim()}
                                onClick={() => {
                                  persistTemplates(msgTemplates.map((t, i) => (i === idx ? editingTplText.trim() : t)));
                                  setEditingTplIdx(null);
                                }}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={() => setEditingTplIdx(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div key={idx} className="group relative inline-flex items-center max-w-[calc(50%-4px)]">
                              <button
                                type="button"
                                onClick={() => { setCustomMsgText(tpl); setShortcutsOpen(false); }}
                                title={tpl}
                                className="inline-flex items-center rounded-full border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 pl-2.5 pr-7 py-1 text-xs transition-colors w-full truncate"
                              >
                                {tpl}
                              </button>
                              <div className="absolute right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  title="Editar"
                                  className="text-muted-foreground/50 hover:text-primary transition-colors"
                                  onClick={(e) => { e.stopPropagation(); setEditingTplIdx(idx); setEditingTplText(tpl); }}
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Excluir"
                                  className="text-muted-foreground/50 hover:text-destructive transition-colors"
                                  onClick={(e) => { e.stopPropagation(); persistTemplates(msgTemplates.filter((_, i) => i !== idx)); }}
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
                <Textarea
                  value={customMsgText}
                  onChange={(e) => setCustomMsgText(e.target.value)}
                  placeholder="Digite a mensagem…"
                  className="min-h-20"
                />
                <button
                  type="button"
                  disabled={!customMsgText.trim() || msgTemplates.includes(customMsgText.trim())}
                  className="text-[11px] text-primary hover:underline disabled:opacity-40 disabled:no-underline flex items-center gap-1"
                  onClick={() => persistTemplates([...msgTemplates, customMsgText.trim()])}
                >
                  <Plus className="h-3 w-3" /> Salvar como atalho
                </button>
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

          <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
            <DialogContent className="sm:max-w-md flex flex-col max-h-[90vh]">
              <DialogHeader className="shrink-0">
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" /> Solicitar pagamento
                </DialogTitle>
                <DialogDescription>
                  Registra a solicitação na Central pra liderança acompanhar. O envio de fato ao
                  banco continua no sistema oficial do Meu Chapa.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      Ajudantes ({paymentSelected.size}/{paymentEligible.length})
                    </p>
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline"
                      onClick={() =>
                        setPaymentSelected(
                          paymentSelected.size === paymentEligible.length
                            ? new Set()
                            : new Set(paymentEligible.map((c) => c.id)),
                        )
                      }
                    >
                      {paymentSelected.size === paymentEligible.length ? "Limpar seleção" : "Selecionar todos"}
                    </button>
                  </div>
                  {paymentEligible.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 py-1">
                      <Checkbox
                        checked={paymentSelected.has(c.id)}
                        onCheckedChange={(checked) => {
                          setPaymentSelected((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(c.id); else next.delete(c.id);
                            return next;
                          });
                        }}
                      />
                      <span className="text-sm flex-1 truncate">{c.nome_chapa}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="R$ 0,00"
                        disabled={!paymentSelected.has(c.id)}
                        value={paymentValores[c.id] ?? ""}
                        onChange={(e) =>
                          setPaymentValores((prev) => ({ ...prev, [c.id]: e.target.value }))
                        }
                        className="h-7 w-24 rounded-md border border-input bg-background px-2 text-xs text-right disabled:opacity-40"
                      />
                    </div>
                  ))}
                </div>
                <Textarea
                  value={paymentMotivo}
                  onChange={(e) => setPaymentMotivo(e.target.value)}
                  placeholder="Motivo da solicitação…"
                  className="min-h-16"
                />
              </div>
              <DialogFooter className="shrink-0">
                <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancelar</Button>
                <Button onClick={submitPaymentRequest} disabled={paymentSelected.size === 0 || paymentSending}>
                  {paymentSending ? "Enviando…" : `Solicitar pagamento (${paymentSelected.size})`}
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
          {navInfo && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => navInfo.hasNext && navInfo.nextId != null && onNavigateTask?.(navInfo.nextId)}
                  disabled={!navInfo.hasNext}
                  className="pointer-events-auto shrink-0 h-10 w-10 rounded-full bg-card border border-border shadow-elevated flex items-center justify-center text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-card"
                  aria-label="Próxima tarefa"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Próxima tarefa [→]</TooltipContent>
            </Tooltip>
          )}
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type CompactChapaRowProps = {
  c: TaskWithChapas["chapas"][number];
  selected: boolean;
  setSelectedKey: (k: string | null) => void;
  lastDispatch: string | null;
  fupLog: TaskWithChapas["fup_log"];
  taskSnap: TaskSnap;
  cancelTemplateReady: boolean;
  taskCancelTemplateReady: boolean;
  unreadPhones: Set<string>;
  updateChapaStatus: (chapaId: string, patch: Record<string, unknown>, label: string) => Promise<void>;
};

// Linha compacta da lista de chapas — extraída em componente próprio porque
// precisa do estado de disparo (countdown/abort) POR chapa via
// useChapaJobState, e hooks não podem ser chamados dentro de um .map() no
// componente pai (regra dos hooks). Mesmo motivo/estrutura do ChapaRowView
// em TaskCard.tsx (Cards) — segue o mesmo padrão aqui.
function CompactChapaRow({
  c,
  selected,
  setSelectedKey,
  lastDispatch,
  fupLog,
  taskSnap,
  cancelTemplateReady,
  taskCancelTemplateReady,
  unreadPhones,
  updateChapaStatus,
}: CompactChapaRowProps) {
  const chapaJobState = useChapaJobState(c.id);
  const pendingAction = chapaJobState?.action ?? null;
  const countdown = chapaJobState?.remaining ?? 0;

  const meta = chapaStatusMeta(c.status_contato, !!lastDispatch);
  const elapsedMin = lastDispatch ? Math.floor((Date.now() - new Date(lastDispatch).getTime()) / 60_000) : null;
  // MCM-159: some sozinho no próximo poll (~40s) quando a
  // conversa é aberta e o totalUnread zera no servidor.
  const chapaHasUnread = !!c.telefone_chapa && unreadPhones.has(last11Digits(c.telefone_chapa));

  const cancelCount = fupLog.filter((f) => f.canal === "umbler_cancelamento" && f.chapa_id === c.id).length;
  const cancelTaskCount = fupLog.filter((f) => f.canal === "umbler_cancelamento_tarefa" && f.chapa_id === c.id).length;
  const cancelSent = (() => {
    try { return !!localStorage.getItem(`umbler_cancel_${c.id}`); } catch { return false; }
  })();
  const cancelTaskSent = (() => {
    try { return !!localStorage.getItem(`umbler_cancel_task_${c.id}`); } catch { return false; }
  })();
  const everSentCancel = cancelCount > 0 || cancelSent;
  const everSentTask = cancelTaskCount > 0 || cancelTaskSent;
  const cancelPending = pendingAction === "cancel" || pendingAction === "cancel_task";

  return (
    <div
      className={`w-full flex items-center gap-1 pr-1.5 text-left transition-colors border-l-[3px] group ${meta.border} ${
        selected ? "bg-primary/10" : `${meta.bg} hover:opacity-80`
      } ${c.status_contato === "removido" ? "opacity-50" : ""}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setSelectedKey(c.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedKey(c.id); } }}
        className="flex-1 min-w-0 flex items-center gap-2.5 pl-3 py-2.5 text-left cursor-pointer"
      >
        <div className={`h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white bg-gradient-to-br ${meta.avatar} shadow-sm`}>
          {c.nome_chapa!.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] truncate flex items-center gap-1.5 ${selected ? "font-semibold" : "font-medium"} ${c.status_contato === "removido" ? "line-through" : ""}`}>
            {chapaHasUnread && <UnreadDot title="Mensagem nova no Umbler" />}
            <span className="truncate">{c.nome_chapa}</span>
          </p>
          <p className={`text-[11px] truncate flex items-center gap-1 font-medium ${meta.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
            {STATUS_LABEL[c.status_contato] ?? c.status_contato}
            {c.status_contato === "pendente" && !lastDispatch && " — sem contato"}
            {elapsedMin !== null && c.status_contato !== "confirmado" && (
              <span className="text-muted-foreground font-normal">· há {fmtElapsed(elapsedMin)}</span>
            )}
          </p>
          {c.telefone_chapa && (
            <p className="text-[10.5px] text-muted-foreground/70 truncate">{c.telefone_chapa}</p>
          )}
        </div>
      </div>

      {/* Confirmação manual — hover-only, some quando já confirmado (o
          status acima já mostra "Confirmado"). Pedido do usuário: deixar
          a ação de confirmar acessível direto na lista, sem precisar abrir
          a conversa. */}
      {c.status_contato !== "confirmado" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateChapaStatus(c.id, { status_contato: "confirmado", data_contato: new Date().toISOString() }, `confirmar ${c.nome_chapa}`);
              }}
              className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:!text-success hover:!bg-success/10 transition-colors"
              aria-label="Confirmar"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Confirmar</TooltipContent>
        </Tooltip>
      )}

      {/* Disparo de cancelamento por falta de resposta — mesmo mecanismo
          (countdown + abort) do painel expandido, agora por linha. Enquanto
          pendente, fica visível mesmo sem hover (não pode sumir uma ação em
          andamento debaixo do mouse — mesma exceção do ChapaRowView em
          TaskCard.tsx). */}
      {c.telefone_chapa && (cancelTemplateReady || everSentCancel) && (
        cancelPending ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); dispatchQueue.abortChapaJob(c.id); }}
                className="shrink-0 h-6 px-1.5 inline-flex items-center justify-center gap-0.5 rounded text-[10px] font-semibold border border-warning/50 bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                aria-label="Cancelar envio"
              >
                <X className="h-3 w-3" /><span>{countdown}s</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">Clique para cancelar o envio</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={pendingAction === "fup"}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatchQueue.startChapaJob(c.id, "cancel", c as ChapaSnap, taskSnap);
                }}
                className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:!text-warning hover:!bg-warning/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Notificar sem resposta"
              >
                <UserMinus className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">{everSentCancel ? `Notificar sem resposta${cancelCount > 0 ? ` (${cancelCount}x)` : ""} — reenviar` : "Notificar sem resposta"}</TooltipContent>
          </Tooltip>
        )
      )}

      {/* Ação explícita "abrir conversa" — separada do clique
          na linha (que também seleciona) porque agora
          selecionar expande o painel e desliza a conversa;
          um alvo dedicado deixa essa intenção clara. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSelectedKey(c.id); }}
            className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:!text-primary hover:!bg-primary/10 transition-colors"
            aria-label="Abrir conversa"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">Abrir conversa</TooltipContent>
      </Tooltip>
      {/* "..." com cópia + cancelamento de tarefa individual (esse último
          gated igual ao painel expandido: template configurado ou já
          disparado antes pra este chapa). */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:!text-foreground hover:bg-muted transition-colors data-[state=open]:!text-foreground data-[state=open]:!bg-muted"
            aria-label="Mais opções"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => clipboardWrite(c.nome_chapa!, `Nome copiado: ${c.nome_chapa}`)}>
            <Copy className="h-3.5 w-3.5 mr-1.5 opacity-60" /> Copiar nome
          </DropdownMenuItem>
          {c.telefone_chapa && (
            <DropdownMenuItem onClick={() => clipboardWrite((c.telefone_chapa ?? "").replace(/\D/g, ""), "Telefone copiado")}>
              <Phone className="h-3.5 w-3.5 mr-1.5 opacity-60" /> Copiar telefone
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              const phone = (c.telefone_chapa ?? "").replace(/\D/g, "");
              clipboardWrite(`${c.nome_chapa}${phone ? ` - ${phone}` : ""}`, "Nome e telefone copiados");
            }}
          >
            <ClipboardList className="h-3.5 w-3.5 mr-1.5 opacity-60" /> Copiar nome + telefone
          </DropdownMenuItem>
          {c.telefone_chapa && (taskCancelTemplateReady || everSentTask) && (
            <DropdownMenuItem
              disabled={pendingAction === "fup"}
              onClick={() => dispatchQueue.startChapaJob(c.id, "cancel_task", c as ChapaSnap, taskSnap)}
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5 opacity-60" />
              {everSentTask ? `Cancelar tarefa${cancelTaskCount > 0 ? ` (${cancelTaskCount}x)` : ""} — reenviar` : "Cancelar tarefa (individual)"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
