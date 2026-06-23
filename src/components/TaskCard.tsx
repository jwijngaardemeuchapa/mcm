import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle,
  MessageSquare,
  Phone,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  Download,
  Copy,
  ClipboardList,
  Plus,
  Moon,
  Clock,
  StickyNote,
  BadgeCheck,
  ExternalLink,
  MoreHorizontal,
  AlertTriangle,
  BookUser,
  Send,
  Loader2,
  X,
  UserMinus,
  XCircle,
  Megaphone,
  RefreshCw,
  BookMarked,
  AlertCircle,
  Pencil,
  Star,
  Bell,
  UserX,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { getDb, uuid, placeholders, errMsg } from "@/lib/db";
import { StatusBadge } from "./StatusBadge";
import { FillRateBar } from "./FillRateBar";
import { Confetti } from "./Confetti";
import { playSuccessChime } from "@/lib/sound";
import { OvernightBadge } from "./OvernightBadge";
import { ValidationStepper, type ValidationStep } from "./ValidationStepper";
import { ValidationPanel } from "./ValidationPanel";
import { ObservationsPanel } from "./ObservationsPanel";
import { fmtTime, fmtDateTime, fmtSP, parseTaskDate, taskTzLabel, minutesUntil } from "@/lib/datetime";
import { isPrefup } from "@/lib/prefup";
import { useUndo } from "@/lib/undo";
import { readSettings, writeSettings } from "@/lib/settings";
import { normalize } from "@/lib/normalize";
import { normalizeCompany } from "@/lib/company";
import { dispatchQueue, type ChapaSnap, type TaskSnap } from "@/lib/dispatchQueue";
import { lookupConfiabilidade, CONFIABILIDADE_MIN_PARTICIPACOES, type ConfiabilidadeStats } from "@/lib/confiabilidade";
import { useMassFupState, useTaskCancelState, useChapaJobState, useCustomMsgState } from "@/lib/useDispatchJob";
import { Checkbox } from "@/components/ui/checkbox";

function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

async function clipboardWrite(text: string, successMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMsg);
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success(successMsg);
    } catch {
      toast.error("Não foi possível copiar. Verifique as permissões do navegador.");
    }
  }
}

export type TaskWithChapas = {
  id_tarefa: number;
  data_tarefa: string;
  empresa: string;
  cidade_uf: string | null;
  status_tarefa: string;
  quantidade_chapas: number;
  is_overnight?: boolean | null;
  validacao_status?: string | null;
  data_validacao_recebida?: string | null;
  data_upload_meu_chapa?: string | null;
  obs_validacao?: string | null;
  observacoes?: string | null;
  observacoes_updated_at?: string | null;
  importado_em?: string | null;
  chapas: Array<{
    id: string;
    nome_chapa: string | null;
    telefone_chapa: string | null;
    cpf: string | null;
    status_contato: string;
    canal_contato?: string | null;
    validacao_presenca?: string | null;
    data_validacao?: string | null;
  }>;
  fup_log: Array<{ id: string; data_disparo: string; canal: string; observacao: string | null; chapa_id?: string | null }>;
  urgent: boolean;
  continuingFromYesterday?: boolean;
};

const canalLabel: Record<string, string> = {
  whatsapp_web: "WhatsApp",
  umbler_talk: "Umbler",
  ligacao_3c: "3C",
  umbler_custom: "Msg",
};
const canalLabelLong: Record<string, string> = {
  whatsapp_web: "WhatsApp Web",
  umbler_talk: "Umbler Talk",
  ligacao_3c: "Ligação 3C",
  umbler_custom: "Mensagem personalizada",
};

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

type ClienteInfo = {
  id: string;
  nome: string;
  status_cliente: string;
  particularidades: string | null;
  exigencias: string | null;
  pedidos: string | null;
  observacoes: string | null;
  contato_nome: string | null;
  segmento: string | null;
};

function fmtElapsed(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatPhone(s: string | null): string {
  if (!s) return "";
  const d = s.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
}

export function TaskCard({
  task,
  onRefresh,
  forceCollapse,
  matchHighlight,
  newChapaKeys,
  autoRemoveChapaName,
  confiabilidade,
}: {
  task: TaskWithChapas;
  onRefresh: () => void;
  forceCollapse?: boolean | null;
  matchHighlight?: boolean;
  newChapaKeys?: Set<string>;
  autoRemoveChapaName?: string;
  confiabilidade?: Map<string, ConfiabilidadeStats>;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!autoRemoveChapaName) return;
    const norm = (s: string | null | undefined) =>
      (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
    const match = task.chapas.find(
      (c) => c.nome_chapa && norm(c.nome_chapa) === norm(autoRemoveChapaName),
    );
    if (!match) return;
    getDb().then((db) =>
      db.execute(
        "UPDATE chapas SET status_contato = ?, data_remocao = ? WHERE id = ?",
        ["removido", new Date().toISOString(), match.id],
      ),
    ).then(() => onRefresh()).catch(() => {});
  }, [autoRemoveChapaName]); // eslint-disable-line
  const [editPhoneTarget, setEditPhoneTarget] = useState<(typeof task.chapas)[number] | null>(null);
  const [editPhoneValue, setEditPhoneValue] = useState("");
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [fupOpen, setFupOpen] = useState(false);
  const [newFupCanal, setNewFupCanal] = useState("whatsapp_web");
  const [newFupObs, setNewFupObs] = useState("");
  const { push, undo } = useUndo();
  const [csvExportedAt, setCsvExportedAt] = useState<string | null>(() => getCsvExportedAt(task.id_tarefa));
  const [taskCancelSent, setTaskCancelSent] = useState(() => {
    try { return !!localStorage.getItem(`umbler_task_cancel_${task.id_tarefa}`); } catch { return false; }
  });
  const [fupAllSent, setFupAllSent] = useState(() => {
    try { return !!localStorage.getItem(`umbler_fup_all_${task.id_tarefa}`); } catch { return false; }
  });
  const [fupEmpresaOvr, setFupEmpresaOvrState] = useState(() => {
    try { return localStorage.getItem(`fup_empresa_ovr_${task.id_tarefa}`) ?? ""; } catch { return ""; }
  });
  function setFupEmpresaOvr(v: string) {
    setFupEmpresaOvrState(v);
    try {
      if (v.trim()) localStorage.setItem(`fup_empresa_ovr_${task.id_tarefa}`, v);
      else localStorage.removeItem(`fup_empresa_ovr_${task.id_tarefa}`);
    } catch { /* noop */ }
  }
  const fupEmpresa = fupEmpresaOvr.trim() || task.empresa;
  const [customMsgOpen, setCustomMsgOpen] = useState(false);
  const [customMsgText, setCustomMsgText] = useState("");
  const [customMsgSelected, setCustomMsgSelected] = useState<Set<string>>(new Set());
  const [msgTemplates, setMsgTemplates] = useState<string[]>(() => readSettings().customMsgTemplates);
  const [editingTplIdx, setEditingTplIdx] = useState<number | null>(null);
  const [editingTplText, setEditingTplText] = useState("");
  const customMsgState = useCustomMsgState(task.id_tarefa);

  function persistTemplates(next: string[]) {
    setMsgTemplates(next);
    writeSettings({ customMsgTemplates: next });
  }
  const [nowTs, setNowTs] = useState(() => Date.now());
  const massFupState = useMassFupState(task.id_tarefa);
  const taskCancelState = useTaskCancelState(task.id_tarefa);
  const fupAllPending = massFupState?.status === "countdown";
  const fupAllCountdown = massFupState?.status === "countdown" ? massFupState.remaining : 0;
  const fupAllSending = massFupState?.status === "sending";
  const fupAllProgress = massFupState?.status === "sending" ? massFupState.progress : null;
  const taskCancelPending = taskCancelState?.status === "countdown";
  const taskCancelCountdown = taskCancelState?.status === "countdown" ? taskCancelState.remaining : 0;
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);

  const confirmed = task.chapas.filter((c) => c.status_contato === "confirmado").length;

  type ChapaRow = (typeof task.chapas)[number] & {
    canal_contato?: string | null;
    data_contato?: string | null;
    data_remocao?: string | null;
    motivo_remocao?: string | null;
  };

  async function updateChapaWithUndo(chapa: ChapaRow, patch: Record<string, unknown>, label: string) {
    const prev: Record<string, unknown> = {};
    Object.keys(patch).forEach((k) => {
      prev[k] = (chapa as Record<string, unknown>)[k] ?? null;
    });
    try {
      const db = await getDb();
      const setClauses = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
      await db.execute(`UPDATE chapas SET ${setClauses} WHERE id = ?`, [...Object.values(patch), chapa.id]);
    } catch (e) {
      toast.error(errMsg(e));
      return;
    }
    push({
      label,
      revert: async () => {
        const db = await getDb();
        const setClauses = Object.keys(prev).map((k) => `${k} = ?`).join(", ");
        await db.execute(`UPDATE chapas SET ${setClauses} WHERE id = ?`, [...Object.values(prev), chapa.id]);
      },
      onReverted: onRefresh,
    });
    onRefresh();
  }

  function markContact(chapa: ChapaRow, canal: string) {
    updateChapaWithUndo(
      chapa,
      { canal_contato: canal, data_contato: new Date().toISOString() },
      `contato ${canalLabelLong[canal]} — ${chapa.nome_chapa ?? "chapa"}`,
    );
    toast.success(`Contato registrado: ${canalLabelLong[canal]}`);
  }

  async function removeChapa(chapa: ChapaRow) {
    const prevStatus = chapa.status_contato;
    const prevRemocao = (chapa as Record<string, unknown>).data_remocao as string | null ?? null;
    const prevMotivo = (chapa as Record<string, unknown>).motivo_remocao as string | null ?? null;
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE chapas SET status_contato = ?, data_remocao = ?, motivo_remocao = ? WHERE id = ?",
        ["removido", new Date().toISOString(), null, chapa.id],
      );
    } catch (e) { toast.error(errMsg(e)); return; }
    push({
      label: `remoção de ${chapa.nome_chapa ?? "chapa"}`,
      revert: async () => {
        const db = await getDb();
        await db.execute(
          "UPDATE chapas SET status_contato = ?, data_remocao = ?, motivo_remocao = ? WHERE id = ?",
          [prevStatus, prevRemocao, prevMotivo, chapa.id],
        );
      },
      onReverted: onRefresh,
    });
    onRefresh();
    const msg = `⚠️ Remoção sinalizada — Tarefa #${task.id_tarefa} | ${task.empresa} | ${fmtTime(task.data_tarefa)}
Chapa removido: ${chapa.nome_chapa ?? "(sem nome)"} | Tel: ${chapa.telefone_chapa ?? "-"}
Precisamos de 1 substituto para esta tarefa.`;
    toast(`${chapa.nome_chapa ?? "Chapa"} removido`, {
      duration: 6000,
      action: { label: "Desfazer", onClick: () => undo() },
      cancel: { label: "Copiar mensagem", onClick: () => clipboardWrite(msg, "Mensagem copiada") },
    });
  }

  async function savePhone() {
    if (!editPhoneTarget) return;
    await updateChapaWithUndo(
      editPhoneTarget as ChapaRow,
      { telefone_chapa: editPhoneValue || null },
      `telefone de ${editPhoneTarget.nome_chapa ?? "chapa"}`,
    );
    setEditPhoneTarget(null);
    setEditPhoneValue("");
    toast.success("Telefone atualizado");
  }

  async function confirmAll() {
    const targets = task.chapas.filter(
      (c) => c.nome_chapa && c.status_contato === "pendente",
    );
    if (targets.length === 0) {
      setConfirmAllOpen(false);
      return;
    }
    const ids = targets.map((c) => c.id);
    const prev = targets.map((c) => ({ id: c.id, status_contato: c.status_contato }));
    try {
      const db = await getDb();
      const ph = placeholders(ids.length);
      await db.execute(
        `UPDATE chapas SET status_contato = 'confirmado', data_contato = ? WHERE id IN (${ph})`,
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
    setConfirmAllOpen(false);
    toast.success(`${ids.length} chapa(s) confirmado(s)`);
    onRefresh();
  }

  function exportCSV() {
    const rows = task.chapas
      .filter((c) => c.status_contato !== "removido" && c.nome_chapa)
      .map((c) => `${c.nome_chapa};${c.telefone_chapa ?? ""}`);
    const csv = "Nome;Telefone\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = companyFilenameSlug(task.empresa);
    const time = fmtSP(task.data_tarefa, "HHmm");
    a.download = `${slug}_${time}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    try {
      localStorage.setItem(csvExportKey(task.id_tarefa), new Date().toISOString());
    } catch {
      /* noop */
    }
    setCsvExportedAt(new Date().toISOString());
    toast.success(`CSV exportado: ${a.download}`);
  }

  async function copyCpfConfirmados() {
    const confirmados = task.chapas.filter(
      (c) => c.status_contato === "confirmado" && c.nome_chapa,
    );
    if (confirmados.length === 0) {
      toast.info("Nenhum chapa confirmado");
      return;
    }
    const comTelefone = confirmados.filter((c) => c.telefone_chapa);
    let phoneToCpf: Record<string, string> = {};
    if (comTelefone.length > 0) {
      try {
        const db = await getDb();
        const phones = comTelefone.map((c) => c.telefone_chapa!.replace(/\D/g, ""));
        const rows = await db.select<{ cpf: string; telefone: string }[]>(
          `SELECT cpf, REPLACE(REPLACE(REPLACE(REPLACE(telefone,' ',''),'-',''),'(',''),')','') as telefone
           FROM chapa_registry
           WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefone,' ',''),'-',''),'(',''),')','') IN (${phones.map(() => "?").join(",")})
             AND cpf IS NOT NULL`,
          phones,
        );
        for (const r of rows) phoneToCpf[r.telefone] = r.cpf;
      } catch { /* silencioso */ }
    }
    const lines = confirmados.map((c) => {
      const cpf = c.cpf
        ?? phoneToCpf[c.telefone_chapa?.replace(/\D/g, "") ?? ""]
        ?? "(não encontrado)";
      return `${c.nome_chapa} — ${formatCpf(cpf)}`;
    });
    clipboardWrite(lines.join("\n"), `${confirmados.length} CPF(s) de confirmados copiados`);
  }

  async function copyList() {
    const active = task.chapas.filter((c) => c.status_contato !== "removido" && c.nome_chapa);
    // Build a map from normalized phone → CPF for missing entries via chapa_registry
    const missing = active.filter((c) => !c.cpf && c.telefone_chapa);
    let phoneToCpf: Record<string, string> = {};
    if (missing.length > 0) {
      try {
        const db = await getDb();
        const phones = missing.map((c) => c.telefone_chapa!.replace(/\D/g, ""));
        const rows = await db.select<{ cpf: string; telefone: string }[]>(
          `SELECT cpf, REPLACE(REPLACE(REPLACE(REPLACE(telefone,' ',''),'-',''),'(',''),')','') as telefone
           FROM chapa_registry
           WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefone,' ',''),'-',''),'(',''),')','') IN (${phones.map(() => "?").join(",")})
             AND cpf IS NOT NULL`,
          phones,
        );
        for (const r of rows) phoneToCpf[r.telefone] = r.cpf;
      } catch { /* silencioso */ }
    }
    const lines = active.map((c) => {
      const cpf = c.cpf
        ?? phoneToCpf[c.telefone_chapa?.replace(/\D/g, "") ?? ""]
        ?? "(sem CPF)";
      return `${c.nome_chapa} - ${formatCpf(cpf)}`;
    });
    clipboardWrite("Nome - CPF\n" + lines.join("\n"), "Lista copiada (nome + CPF)");
  }

  function copyNamesOnly() {
    const lines = task.chapas
      .filter((c) => c.status_contato !== "removido" && c.nome_chapa)
      .map((c) => c.nome_chapa as string);
    clipboardWrite(lines.join("\n"), `${lines.length} nome(s) copiado(s)`);
  }

  function copyConfirmedNames() {
    const lines = task.chapas
      .filter((c) => c.status_contato === "confirmado" && c.nome_chapa)
      .map((c) => c.nome_chapa as string);
    if (lines.length === 0) {
      toast.error("Nenhum chapa confirmado nesta tarefa");
      return;
    }
    clipboardWrite(lines.join("\n"), `${lines.length} confirmado(s) copiado(s)`);
  }

  async function registerFup() {
    const fupId = uuid();
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO fup_log (id, id_tarefa, canal, data_disparo, observacao) VALUES (?, ?, ?, ?, ?)",
        [fupId, task.id_tarefa, newFupCanal, new Date().toISOString(), newFupObs || null],
      );
    } catch (e) {
      toast.error(errMsg(e));
      return;
    }
    push({
      label: `FUP ${canalLabelLong[newFupCanal] ?? newFupCanal}`,
      revert: async () => {
        const db = await getDb();
        await db.execute("DELETE FROM fup_log WHERE id = ?", [fupId]);
      },
      onReverted: onRefresh,
    });
    setNewFupObs("");
    toast.success("FUP registrado");
    onRefresh();
  }

  const { umblerSettings, operadorNome, fupElapsedAlertMinutes, fupAgendarMinAntes } = readSettings();

  const fupAllCount = task.fup_log.filter((f) => f.canal === "umbler_talk" && !f.chapa_id).length;
  const fupDispatched = task.fup_log.length > 0 || !!csvExportedAt;

  // Auto-FUP scheduled indicator
  const minUntilTask = minutesUntil(task.data_tarefa);
  const autoFupActive = fupAgendarMinAntes > 0 && minUntilTask > 0 && fupAllCount === 0;
  const minUntilAutoFup = autoFupActive ? minUntilTask - fupAgendarMinAntes : null;

  const lastFupLog = task.fup_log.length > 0
    ? task.fup_log.reduce((a, b) => a.data_disparo > b.data_disparo ? a : b)
    : null;
  const lastFupAt = lastFupLog?.data_disparo ?? csvExportedAt ?? null;
  const minutesSinceFup = lastFupAt ? Math.floor((nowTs - new Date(lastFupAt).getTime()) / 60_000) : null;
  const umblerReady = !!(
    umblerSettings.bearerToken &&
    umblerSettings.fromPhone &&
    umblerSettings.organizationId &&
    umblerSettings.templateId
  );
  const cancelTemplateReady = umblerReady && !!umblerSettings.cancelTemplateId;
  const taskCancelTemplateReady = umblerReady && !!umblerSettings.taskCancelTemplateId;

  function startFupAll() {
    const chapasWithPhone = task.chapas.filter(
      (c) => c.telefone_chapa && c.nome_chapa && c.status_contato !== "removido" && c.status_contato !== "confirmado",
    ) as ChapaSnap[];
    if (chapasWithPhone.length === 0) {
      const allConfirmed = task.chapas.filter((c) => c.status_contato === "confirmado").length;
      if (allConfirmed > 0) {
        toast.info(`Todos os ${allConfirmed} chapa(s) já estão confirmados — nada a enviar`);
      } else {
        toast.error("Nenhum chapa pendente com telefone cadastrado nesta tarefa");
      }
      return;
    }
    const taskSnap: TaskSnap = { id_tarefa: task.id_tarefa, data_tarefa: task.data_tarefa, empresa: fupEmpresa, cidade_uf: task.cidade_uf ?? null };
    dispatchQueue.startMassFup(task.id_tarefa, chapasWithPhone, taskSnap);
  }

  const confirmedWithPhone = task.chapas.filter(
    (c) => c.status_contato === "confirmado" && c.telefone_chapa && c.nome_chapa,
  );
  const customMsgCount = task.fup_log.filter((f) => f.canal === "umbler_custom").length;

  function openCustomMsgDialog() {
    setCustomMsgText("");
    setCustomMsgSelected(new Set(confirmedWithPhone.map((c) => c.id)));
    setCustomMsgOpen(true);
  }

  function startCustomMsgDispatch() {
    const targets = confirmedWithPhone.filter((c) => customMsgSelected.has(c.id)) as ChapaSnap[];
    if (targets.length === 0 || !customMsgText.trim()) return;
    dispatchQueue.startCustomMsg(task.id_tarefa, targets, customMsgText.trim(), task.empresa);
    setCustomMsgOpen(false);
  }

  function startTaskCancelCountdown() {
    const chapasWithPhone = task.chapas.filter(
      (c) => c.telefone_chapa && c.nome_chapa && c.status_contato !== "removido",
    ) as ChapaSnap[];
    if (chapasWithPhone.length === 0) {
      toast.error("Nenhum chapa com telefone cadastrado nesta tarefa");
      return;
    }
    const taskSnap: TaskSnap = { id_tarefa: task.id_tarefa, data_tarefa: task.data_tarefa, empresa: fupEmpresa, cidade_uf: task.cidade_uf ?? null };
    dispatchQueue.startTaskCancel(task.id_tarefa, chapasWithPhone, taskSnap);
  }

  function stopTaskCancelCountdown() {
    dispatchQueue.abortTaskCancel(task.id_tarefa);
  }

  const taskStarted = parseTaskDate(task.data_tarefa, task.cidade_uf).getTime() <= Date.now();
  const vStatus = (task.validacao_status ?? "aguardando") as ValidationStep;
  const isOvernight = !!task.is_overnight;
  const continuing = !!task.continuingFromYesterday;
  const totalChapas = task.chapas.length;
  const confirmedAll = totalChapas > 0 && task.chapas.every((c) => c.status_contato === "confirmado");
  const realChapas = task.chapas.filter((c) => c.nome_chapa && c.status_contato !== "removido");
  const allRealConfirmed = realChapas.length > 0 && realChapas.every((c) => c.status_contato === "confirmado");
  const vacantCount = Math.max(0, (task.quantidade_chapas || task.chapas.length) - realChapas.length);
  const fullyValidated =
    realChapas.length > 0 &&
    realChapas.every(
      (c) => c.validacao_presenca === "presente" || c.validacao_presenca === "ausente",
    );
  const isDone = confirmedAll && vStatus === "subido_meu_chapa";

  const hasClienteNotes = !!clienteInfo && (
    clienteInfo.status_cliente !== "ativo" ||
    !!clienteInfo.particularidades ||
    !!clienteInfo.exigencias ||
    !!clienteInfo.pedidos ||
    !!clienteInfo.observacoes
  );
  const clienteIconColor = clienteInfo?.status_cliente === "suspenso"
    ? "text-destructive"
    : (clienteInfo?.particularidades || clienteInfo?.exigencias)
    ? "text-warning"
    : "text-primary/70";

  // "Confirmar todos" eligibility: all real chapas pendente AND task starts within 2 hours
  const allPending =
    realChapas.length > 0 &&
    realChapas.every((c) => c.status_contato === "pendente");
  const minutesUntilStart = (parseTaskDate(task.data_tarefa, task.cidade_uf).getTime() - Date.now()) / 60_000;
  const eligibleConfirmAll = allPending && minutesUntilStart <= 120;

  const requested = task.quantidade_chapas || task.chapas.length;
  const fillPct = requested > 0 ? Math.round((confirmed / requested) * 100) : 0;
  const { fillRateWarningThreshold } = readSettings();
  const showApproachAlert =
    !isDone && minutesUntilStart > 0 && minutesUntilStart <= 60 && fillPct < fillRateWarningThreshold;

  const initiallyDoneRef = useRef(isDone);
  const [userExpanded, setUserExpanded] = useState(false);
  const [manualCollapsed, setManualCollapsed] = useState<boolean>(() => fullyValidated && !isDone);
  const [animateCollapse, setAnimateCollapse] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const prevDoneRef = useRef(isDone);
  const prevValidatedRef = useRef(fullyValidated);
  useEffect(() => {
    if (!prevDoneRef.current && isDone && !initiallyDoneRef.current) {
      setAnimateCollapse(true);
      setShowConfetti(true);
      playSuccessChime();
      const t1 = setTimeout(() => setAnimateCollapse(false), 350);
      const t2 = setTimeout(() => setShowConfetti(false), 900);
      prevDoneRef.current = isDone;
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    prevDoneRef.current = isDone;
  }, [isDone]);
  useEffect(() => {
    if (!prevValidatedRef.current && fullyValidated && !isDone) {
      setManualCollapsed(true);
      setShowConfetti(true);
      playSuccessChime();
      const t = setTimeout(() => setShowConfetti(false), 900);
      return () => clearTimeout(t);
    }
    prevValidatedRef.current = fullyValidated;
  }, [fullyValidated, isDone]);

  useEffect(() => {
    if (forceCollapse === undefined || forceCollapse === null) return;
    setManualCollapsed(forceCollapse);
    if (isDone) setUserExpanded(!forceCollapse);
  }, [forceCollapse, isDone]);

  // Countdown timers (massFup, taskCancel, chapaJob) live in dispatchQueue (module-level)
  // so they are intentionally not cleaned up here — they survive navigation.

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 120_000);
    return () => clearInterval(id);
  }, []);

  // Sync "sent" flags when queue completes (massFupState / taskCancelState → null)
  const prevMassFupStatus = useRef(massFupState?.status);
  const prevTaskCancelStatus = useRef(taskCancelState?.status);
  useEffect(() => {
    const prev = prevMassFupStatus.current;
    prevMassFupStatus.current = massFupState?.status;
    if (prev === "sending" && !massFupState) {
      try { if (localStorage.getItem(`umbler_fup_all_${task.id_tarefa}`)) setFupAllSent(true); } catch { /* noop */ }
    }
  }, [massFupState, task.id_tarefa]);
  useEffect(() => {
    const prev = prevTaskCancelStatus.current;
    prevTaskCancelStatus.current = taskCancelState?.status;
    if (prev === "countdown" && !taskCancelState) {
      try { if (localStorage.getItem(`umbler_task_cancel_${task.id_tarefa}`)) setTaskCancelSent(true); } catch { /* noop */ }
    }
  }, [taskCancelState, task.id_tarefa]);

  useEffect(() => {
    getDb()
      .then((db) =>
        db.select<ClienteInfo[]>(
          "SELECT id, nome, status_cliente, particularidades, exigencias, pedidos, observacoes, contato_nome, segmento FROM cliente_book",
        ),
      )
      .then((rows) => {
        const e = normalizeCompany(task.empresa);
        const match = rows.find((r) => {
          const n = normalizeCompany(r.nome);
          return e && n && (e === n || e.includes(n) || n.includes(e));
        });
        setClienteInfo(match ?? null);
      })
      .catch(() => {});
  }, [task.empresa]);

  const showMinimized = isDone && !userExpanded;
  const hasObs = !!(task.observacoes && task.observacoes.trim().length > 0);

  if (showMinimized) {
    return (
      <div
        data-task-card={task.id_tarefa}
        className={`bg-card rounded-xl border border-border border-l-4 border-l-success shadow-card overflow-hidden transition-all duration-200 ${
          animateCollapse ? "animate-fade-in" : ""
        }`}
      >
        <div className="min-h-[44px] px-4 py-2 flex items-center gap-3">
          {isOvernight && <Moon className="h-4 w-4 text-overnight shrink-0" aria-label="Overnight" />}
          <BadgeCheck className="h-4 w-4 text-success shrink-0" aria-label="Validada" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm text-muted-foreground truncate capitalize">
              {task.empresa.toLowerCase()} — {fmtTime(task.data_tarefa)}
            </span>
          </div>
          <span className="text-xs font-semibold text-success shrink-0">
            {confirmed}/{requested} ✅
          </span>
          <span className="text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-success/15 text-success shrink-0 inline-flex items-center gap-1">
            <BadgeCheck className="h-3 w-3" /> 100% Validada
          </span>
          {hasObs && (
            <StickyNote className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Contém observações" />
          )}
          <button
            onClick={() => setUserExpanded(true)}
            className="shrink-0 min-h-[44px] min-w-[44px] rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors"
            aria-label="Expandir tarefa"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-task-card={task.id_tarefa}
      className={`bg-card rounded-xl border shadow-card overflow-hidden transition-shadow ${
        isDone
          ? "border-success/60 border-l-4 border-l-success ring-1 ring-success/20"
          : fullyValidated
          ? "border-success/50 border-l-4 border-l-success ring-1 ring-success/15"
          : continuing
          ? "border-overnight/60 ring-2 ring-overnight/30"
          : isOvernight
          ? "border-overnight/40 ring-1 ring-overnight/20"
          : showApproachAlert
          ? "border-warning/60 ring-2 ring-warning/30"
          : task.urgent
          ? "border-destructive/50 ring-1 ring-destructive/20"
          : "border-border"
      } ${matchHighlight ? "ring-2 ring-primary shadow-elevated" : ""} ${isDone && userExpanded ? "animate-fade-in" : ""}`}
    >
      <div
        className={`relative p-4 flex flex-wrap items-center gap-3 justify-between border-b border-border bg-card ${
          isOvernight
            ? "bg-gradient-to-r from-overnight-soft to-card"
            : "bg-gradient-to-r from-primary-soft/60 to-card"
        }`}
      >
        <Confetti active={showConfetti} />
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`text-center rounded-lg px-3 py-2 font-display shrink-0 ${
              isOvernight ? "bg-overnight text-overnight-foreground" : "bg-primary text-primary-foreground"
            }`}
          >
            <div className="text-xl font-bold leading-none">{fmtTime(task.data_tarefa)}</div>
            {taskTzLabel(task.cidade_uf) && (
              <div className="text-[10px] font-bold opacity-75 tracking-wide leading-none mt-0.5">
                {taskTzLabel(task.cidade_uf)}
              </div>
            )}
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <a
                href={`https://app.meu-chapa.net/admin/edit-task/${task.id_tarefa}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] uppercase tracking-wider opacity-90 hover:opacity-100 hover:underline inline-flex items-center gap-0.5"
                title="Abrir tarefa no Meu Chapa"
              >
                #{task.id_tarefa}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clipboardWrite(String(task.id_tarefa), `Código copiado: #${task.id_tarefa}`);
                }}
                className="opacity-70 hover:opacity-100 p-0.5 rounded hover:bg-white/10"
                title="Copiar código da tarefa"
                aria-label="Copiar código da tarefa"
              >
                <Copy className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground truncate capitalize">
                {task.empresa.toLowerCase()}
              </span>
              {isOvernight && <OvernightBadge />}
              {autoFupActive && minUntilAutoFup !== null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                      minUntilAutoFup <= 0
                        ? "bg-warning/20 text-warning border-warning/40 animate-pulse"
                        : minUntilAutoFup <= 15
                        ? "bg-warning/15 text-warning border-warning/30"
                        : "bg-muted/60 text-muted-foreground border-border"
                    }`}>
                      <Bell className="h-2.5 w-2.5" />
                      {minUntilAutoFup <= 0 ? "FUP auto agora" : `FUP auto em ${Math.round(minUntilAutoFup)}min`}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    FUP automático agendado para {fupAgendarMinAntes}min antes da tarefa
                  </TooltipContent>
                </Tooltip>
              )}
              {hasClienteNotes && clienteInfo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => navigate(`/clientes?q=${encodeURIComponent(task.empresa)}`)}
                      className={`shrink-0 h-5 w-5 inline-flex items-center justify-center rounded hover:bg-white/10 transition-colors ${clienteIconColor}`}
                      aria-label="Informações do cliente — Caderno de Clientes"
                    >
                      <BookMarked className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="p-0 max-w-[280px]">
                    <div className="p-3 space-y-2 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">{clienteInfo.nome}</span>
                        {clienteInfo.status_cliente !== "ativo" && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                            clienteInfo.status_cliente === "suspenso"
                              ? "bg-destructive/15 text-destructive border-destructive/30"
                              : "bg-muted/60 text-muted-foreground border-border"
                          }`}>
                            {clienteInfo.status_cliente === "suspenso" ? "Suspenso" : "Inativo"}
                          </span>
                        )}
                      </div>
                      {clienteInfo.particularidades && (
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-bold text-warning flex items-center gap-1">
                            <AlertCircle className="h-2.5 w-2.5" /> Particularidades
                          </p>
                          <p className="text-[11px] text-popover-foreground/80 whitespace-pre-wrap leading-relaxed">{clienteInfo.particularidades}</p>
                        </div>
                      )}
                      {clienteInfo.exigencias && (
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-bold text-primary flex items-center gap-1">
                            <ClipboardList className="h-2.5 w-2.5" /> Exigências
                          </p>
                          <p className="text-[11px] text-popover-foreground/80 whitespace-pre-wrap leading-relaxed">{clienteInfo.exigencias}</p>
                        </div>
                      )}
                      {clienteInfo.pedidos && (
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-semibold text-muted-foreground">Pedidos / histórico</p>
                          <p className="text-[11px] text-popover-foreground/80 whitespace-pre-wrap leading-relaxed">{clienteInfo.pedidos}</p>
                        </div>
                      )}
                      {clienteInfo.observacoes && (
                        <div className="space-y-0.5">
                          <p className="text-[10px] font-semibold text-muted-foreground">Observações</p>
                          <p className="text-[11px] text-popover-foreground/80 whitespace-pre-wrap leading-relaxed">{clienteInfo.observacoes}</p>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                        Clique para abrir o Caderno de Clientes
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {task.cidade_uf ?? "—"}
              {continuing && (
                <span className="ml-2 text-overnight font-semibold">
                  · Início: ontem às {fmtTime(task.data_tarefa)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {!allRealConfirmed && !fullyValidated && (
            fupDispatched && minutesSinceFup !== null && minutesSinceFup >= fupElapsedAlertMinutes * 2 ? (
              <span
                className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-md bg-destructive/15 text-destructive border border-destructive/40 animate-pulse"
                title={`FUP disparado há ${fmtElapsed(minutesSinceFup)} — sem resposta? Verifique com urgência`}
              >
                <Clock className="h-3.5 w-3.5" /> FUP há {fmtElapsed(minutesSinceFup)}
              </span>
            ) : fupDispatched && minutesSinceFup !== null && minutesSinceFup >= fupElapsedAlertMinutes ? (
              <span
                className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-md bg-warning/15 text-warning border border-warning/40 animate-pulse"
                title={`FUP disparado há ${fmtElapsed(minutesSinceFup)} — verifique se os chapas responderam`}
              >
                <Clock className="h-3.5 w-3.5" /> FUP há {fmtElapsed(minutesSinceFup)}
              </span>
            ) : fupDispatched ? (
              <span
                className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/30"
                title={[
                  `FUP disparado — ${task.fup_log.length} registro(s)`,
                  csvExportedAt ? `CSV exportado em ${fmtDateTime(csvExportedAt)}` : null,
                  lastFupAt ? `Último disparo: ${fmtDateTime(lastFupAt)}` : null,
                ].filter(Boolean).join(" · ")}
              >
                <Check className="h-3.5 w-3.5" /> FUP disparado{task.fup_log.length > 0 ? ` (${task.fup_log.length}x)` : ""}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-md bg-warning/15 text-warning border border-warning/40 animate-pulse"
                title="Nenhum FUP registrado para esta tarefa"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> FUP pendente
              </span>
            )
          )}
          {fullyValidated && (
            <span
              className="inline-flex items-center gap-1 text-[12px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-success text-success-foreground shadow-sm"
              title="Todas as presenças foram marcadas"
            >
              <BadgeCheck className="h-3.5 w-3.5" /> 100% Validada
            </span>
          )}
          {taskStarted ? (
            <ValidationStepper status={vStatus} />
          ) : (
            <StatusBadge status={task.status_tarefa} />
          )}
          <FillRateBar confirmed={confirmed} requested={task.quantidade_chapas || task.chapas.length} />
          {vacantCount > 0 && (
            <>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border border-dashed border-warning/60 text-warning bg-warning/5 shrink-0">
                {vacantCount} vaga{vacantCount !== 1 ? "s" : ""} em aberto
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); navigate(`/bid?taskId=${task.id_tarefa}`); }}
                    className="h-7 gap-1 text-xs border-primary/40 text-primary hover:bg-primary/10 px-2 shrink-0"
                  >
                    <Send className="h-3 w-3" /> BID
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Abrir no BID Dashboard — {vacantCount} vaga{vacantCount !== 1 ? "s" : ""} para bidar</TooltipContent>
              </Tooltip>
            </>
          )}
          {eligibleConfirmAll && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs border-success/50 text-success hover:bg-success/10"
              onClick={() => setConfirmAllOpen(true)}
            >
              <Check className="h-3.5 w-3.5" /> Confirmar todos
            </Button>
          )}
          {isDone && userExpanded ? (
            <button
              onClick={() => setUserExpanded(false)}
              className="min-h-[44px] min-w-[44px] rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
              aria-label="Minimizar tarefa"
              title="Minimizar"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          ) : !isDone ? (
            <button
              onClick={() => setManualCollapsed((v) => !v)}
              className="min-h-[44px] min-w-[44px] rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
              aria-label={manualCollapsed ? "Expandir tarefa" : "Colapsar tarefa"}
              title={manualCollapsed ? "Expandir" : "Colapsar"}
            >
              {manualCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          ) : null}
        </div>
      </div>

      {showApproachAlert && (
        <div className="px-4 py-2.5 flex items-center gap-2 bg-warning/10 border-b border-warning/40 animate-pulse">
          <Clock className="h-4 w-4 text-warning shrink-0" />
          <span className="text-xs font-semibold text-warning">
            ⏰ Faltam {Math.ceil(minutesUntilStart)} min para iniciar — fill rate:{" "}
            <strong>{fillPct}%</strong> (mínimo esperado: {fillRateWarningThreshold}%)
          </span>
        </div>
      )}

      {continuing && !manualCollapsed && (
        <div className="px-4 py-2 text-xs font-semibold text-warning bg-warning/15 border-b border-warning/30">
          ⚠️ Esta tarefa está em andamento desde ontem ({fmtSP(task.data_tarefa, "dd/MM 'às' HH:mm")})
        </div>
      )}

      {fullyValidated && !isDone && !manualCollapsed && (
        <div className="px-4 py-2 text-xs font-semibold bg-success/15 border-b border-success/40 text-success flex items-center gap-2 animate-fade-in">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          <span>
            ✅ Todas as presenças validadas
            {vStatus === "validacao_recebida"
              ? " · pronto para subir no Meu Chapa"
              : vStatus === "pendente"
              ? " · marque como recebida do cliente"
              : ""}
          </span>
        </div>
      )}

      {!manualCollapsed && (
        <>
          <div className="divide-y divide-border">
            {task.chapas.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground italic">
                Vaga em captação — nenhum chapa alocado
              </div>
            )}
            {task.chapas.map((c) => (
              <ChapaRowView
                key={c.id}
                chapa={c}
                taskId={task.id_tarefa}
                taskSnap={{ id_tarefa: task.id_tarefa, data_tarefa: task.data_tarefa, empresa: fupEmpresa }}
                newChapaKeys={newChapaKeys}
                conf={lookupConfiabilidade(confiabilidade, c)}
                fupLog={task.fup_log}
                onContact={markContact}
                onConfirm={() =>
                  updateChapaWithUndo(
                    c,
                    { status_contato: "confirmado", canal_contato: c.canal_contato ?? null, data_contato: new Date().toISOString() },
                    `confirmar ${c.nome_chapa ?? "chapa"}`,
                  )
                }
                onNoResponse={() =>
                  updateChapaWithUndo(
                    c,
                    { status_contato: "nao_respondeu" },
                    `não respondeu — ${c.nome_chapa ?? "chapa"}`,
                  )
                }
                onRemove={() => removeChapa(c as ChapaRow)}
                onEditPhone={() => {
                  setEditPhoneTarget(c);
                  setEditPhoneValue(c.telefone_chapa ?? "");
                }}
                onUndoOutcome={() =>
                  updateChapaWithUndo(
                    c,
                    { status_contato: "pendente" },
                    `reabrir ${c.nome_chapa ?? "chapa"}`,
                  )
                }
                umblerReady={umblerReady}
                cancelTemplateReady={cancelTemplateReady}
              />
            ))}
          </div>

          <ObservationsPanel
            id_tarefa={task.id_tarefa}
            empresa={task.empresa}
            data_tarefa={task.data_tarefa}
            observacoes={task.observacoes ?? null}
            observacoes_updated_at={task.observacoes_updated_at ?? null}
          />

          <Collapsible open={fupOpen} onOpenChange={setFupOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full px-4 py-2 bg-muted/50 hover:bg-muted flex items-center justify-between text-xs font-semibold text-muted-foreground border-t border-border transition-colors">
                <span>FUPs disparados ({task.fup_log.length})</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${fupOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="p-4 bg-muted/30 space-y-3">
              {task.fup_log.length === 0 && (
                <div className="text-xs text-muted-foreground italic">Nenhum FUP registrado ainda</div>
              )}
              {task.fup_log.map((f) => {
                const prefup = isPrefup(f.data_disparo, task.data_tarefa);
                return (
                  <div key={f.id} className="text-xs flex items-center gap-3 py-1">
                    <span className="font-semibold text-foreground">{canalLabelLong[f.canal] ?? f.canal}</span>
                    {prefup && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-info/15 text-info border border-info/30">
                        PréFUP
                      </span>
                    )}
                    <span className="text-muted-foreground">{fmtDateTime(f.data_disparo)}</span>
                    {f.observacao && <span className="text-muted-foreground italic">— {f.observacao}</span>}
                  </div>
                );
              })}
              <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border">
                <Select value={newFupCanal} onValueChange={setNewFupCanal}>
                  <SelectTrigger className="h-9 w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp_web">WhatsApp Web</SelectItem>
                    <SelectItem value="umbler_talk">Umbler Talk</SelectItem>
                    <SelectItem value="ligacao_3c">Ligação 3C</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Observação (opcional)"
                  value={newFupObs}
                  onChange={(e) => setNewFupObs(e.target.value)}
                  className="h-9 flex-1 min-w-[180px]"
                />
                <Button size="sm" onClick={registerFup} className="h-9 gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Registrar FUP
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="px-4 py-3 flex gap-2 flex-wrap border-t border-border bg-card">
            <Button
              size="sm"
              variant="outline"
              className={`gap-1.5 ${
                csvExportedAt
                  ? "border-success/40 text-success hover:bg-success/10"
                  : "border-warning/60 text-warning bg-warning/10 hover:bg-warning/20"
              }`}
              onClick={exportCSV}
              title={csvExportedAt ? `Exportado em ${fmtDateTime(csvExportedAt)} — clique para exportar novamente` : "FUP pendente — clique para exportar o CSV"}
            >
              {csvExportedAt ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              {csvExportedAt ? "CSV exportado · reexportar" : "Exportar CSV"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={copyList}>
              <Copy className="h-3.5 w-3.5" /> Copiar Lista
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copiar Nomes
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={copyNamesOnly}>
                  Todos os nomes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyConfirmedNames}>
                  <Check className="h-3.5 w-3.5 mr-1.5 text-success" />
                  Só confirmados ({task.chapas.filter((c) => c.status_contato === "confirmado").length})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyCpfConfirmados}>
                  <Check className="h-3.5 w-3.5 mr-1.5 text-info" />
                  CPF dos confirmados ({task.chapas.filter((c) => c.status_contato === "confirmado").length})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {(umblerReady || taskCancelTemplateReady) && (
              <div className="ml-auto flex gap-2 items-center">
                {umblerReady && confirmedWithPhone.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`gap-1.5 ${
                          customMsgState?.status === "countdown"
                            ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                            : customMsgState?.status === "sending"
                            ? "border-info/40 bg-info/10 text-info hover:bg-info/20"
                            : customMsgCount > 0
                            ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
                            : "border-primary/40 text-primary hover:bg-primary/10"
                        }`}
                        onClick={
                          customMsgState
                            ? () => dispatchQueue.abortCustomMsg(task.id_tarefa)
                            : openCustomMsgDialog
                        }
                      >
                        {customMsgState?.status === "countdown" ? (
                          <><X className="h-3.5 w-3.5" /><span>0:{String(customMsgState.remaining).padStart(2, "0")}</span></>
                        ) : customMsgState?.status === "sending" ? (
                          <><X className="h-3.5 w-3.5" /><span>Cancelar ({customMsgState.sent}/{customMsgState.total})</span></>
                        ) : customMsgCount > 0 ? (
                          <><Check className="h-3.5 w-3.5" /><span>Mensagem ({customMsgCount})</span></>
                        ) : (
                          <><MessageSquare className="h-3.5 w-3.5" /><span>Mensagem</span></>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {customMsgState?.status === "countdown"
                        ? "Disparo em contagem regressiva — clique para cancelar"
                        : customMsgState?.status === "sending"
                        ? "Enviando — clique para interromper"
                        : customMsgCount > 0
                        ? `${customMsgCount} mensagem(ns) personalizada(s) enviada(s) — clique para enviar outra`
                        : `Mensagem personalizada para os ${confirmedWithPhone.length} confirmado(s) — janela de 24h aberta`}
                    </TooltipContent>
                  </Tooltip>
                )}
                {umblerReady && (
                  <Popover>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <Button
                            size="sm"
                            variant={fupEmpresaOvr.trim() ? "outline" : "ghost"}
                            className={`h-8 px-2 gap-1 ${
                              fupEmpresaOvr.trim()
                                ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                                : "text-muted-foreground"
                            }`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            {fupEmpresaOvr.trim() && <span className="text-[10px] font-semibold max-w-[100px] truncate">{fupEmpresaOvr.trim()}</span>}
                          </Button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        {fupEmpresaOvr.trim()
                          ? `Empresa na mensagem alterada para "${fupEmpresaOvr.trim()}" — clique para editar`
                          : "Editar o nome da empresa enviado na mensagem de FUP"}
                      </TooltipContent>
                    </Tooltip>
                    <PopoverContent align="end" className="w-72 space-y-2 p-3">
                      <div className="text-xs font-semibold">Empresa na mensagem de FUP</div>
                      <div className="text-[11px] text-muted-foreground">
                        Este texto substitui o nome da empresa nos disparos desta tarefa (FUP Todos, FUPs individuais e cancelamento).
                      </div>
                      <div className="flex gap-2 items-center">
                        <Input
                          placeholder={task.empresa}
                          value={fupEmpresaOvr}
                          onChange={(e) => setFupEmpresaOvr(e.target.value)}
                          className="h-8 text-sm flex-1"
                        />
                        {fupEmpresaOvr.trim() && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-muted-foreground"
                            onClick={() => setFupEmpresaOvr("")}
                          >
                            ↺ auto
                          </Button>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Enviando como: <span className="font-medium text-foreground">{fupEmpresa}</span>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {umblerReady && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`gap-1.5 ${
                          fupAllSending && fupAllProgress?.phase === "retry-wait"
                            ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                            : fupAllSending
                            ? "border-info/40 bg-info/10 text-info hover:bg-info/20"
                            : fupAllPending
                            ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                            : (fupAllSent || fupAllCount > 0)
                            ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
                            : "border-primary/40 text-primary hover:bg-primary/10"
                        }`}
                        onClick={
                          fupAllSending
                            ? () => dispatchQueue.abortMassFup(task.id_tarefa)
                            : fupAllPending
                            ? () => dispatchQueue.abortMassFup(task.id_tarefa)
                            : startFupAll
                        }
                      >
                        {fupAllSending && fupAllProgress ? (
                          fupAllProgress.phase === "retry-wait" ? (
                            <><RefreshCw className="h-3.5 w-3.5 animate-spin" /><span>Reenvio em {fupAllProgress.countdown}s ({fupAllProgress.retryTotal} falha{fupAllProgress.retryTotal > 1 ? "s" : ""})</span></>
                          ) : fupAllProgress.phase === "retrying" ? (
                            <><X className="h-3.5 w-3.5" /><span>Reenviando ({fupAllProgress.retrySent}/{fupAllProgress.retryTotal})</span></>
                          ) : (
                            <><X className="h-3.5 w-3.5" /><span>Cancelar ({fupAllProgress.sent}/{fupAllProgress.total})</span></>
                          )
                        ) : fupAllPending ? (
                          <><X className="h-3.5 w-3.5" /><span>{Math.floor(fupAllCountdown / 60)}:{String(fupAllCountdown % 60).padStart(2, "0")}</span></>
                        ) : (fupAllSent || fupAllCount > 0) ? (
                          <><Check className="h-3.5 w-3.5" /><span>FUP Todos{fupAllCount > 0 ? ` (${fupAllCount}x)` : ""}</span></>
                        ) : (
                          <><Megaphone className="h-3.5 w-3.5" /><span>FUP Todos</span></>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {fupAllSending && fupAllProgress?.phase === "retry-wait"
                        ? `${fupAllProgress.retryTotal} falha(s) — reenvio automático em ${fupAllProgress.countdown}s · clique para cancelar`
                        : fupAllSending && fupAllProgress?.phase === "retrying"
                        ? `Reenviando falhas (${fupAllProgress.retrySent}/${fupAllProgress.retryTotal}) — clique para interromper`
                        : fupAllSending
                        ? "Clique para interromper o envio"
                        : fupAllPending
                        ? "Clique para cancelar o disparo"
                        : (fupAllSent || fupAllCount > 0)
                        ? `Disparado ${fupAllCount}x — clique para reenviar a todos`
                        : "Enviar FUP para todos os chapas pendentes — 3 min de delay, 10 s entre cada disparo"}
                    </TooltipContent>
                  </Tooltip>
                )}
                {taskCancelTemplateReady && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`gap-1.5 ${
                          taskCancelPending
                            ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                            : taskCancelSent
                            ? "border-muted-foreground/20 text-muted-foreground/50 cursor-default"
                            : "border-destructive/40 text-destructive hover:bg-destructive/10"
                        }`}
                        onClick={taskCancelPending ? stopTaskCancelCountdown : taskCancelSent ? undefined : startTaskCancelCountdown}
                      >
                        {taskCancelPending ? (
                          <><X className="h-3.5 w-3.5" /><span>{taskCancelCountdown}s</span></>
                        ) : taskCancelSent ? (
                          <><Check className="h-3.5 w-3.5" /><span>Cancelamento enviado</span></>
                        ) : (
                          <><XCircle className="h-3.5 w-3.5" /><span>Cancelar Tarefa</span></>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {taskCancelPending
                        ? "Clique para cancelar o disparo"
                        : taskCancelSent
                        ? "Notificação de cancelamento já enviada a todos os chapas"
                        : "Notificar todos os chapas sobre o cancelamento desta tarefa — aguarda 1 min antes de disparar"}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {realChapas.length > 0 && (
        <ValidationPanel
          id_tarefa={task.id_tarefa}
          chapas={task.chapas}
          validacao_status={vStatus}
          data_validacao_recebida={task.data_validacao_recebida ?? null}
          data_upload_meu_chapa={task.data_upload_meu_chapa ?? null}
          obs_validacao={task.obs_validacao ?? null}
          onRefresh={onRefresh}
        />
      )}

      {/* Removal dialog */}
      <Dialog open={customMsgOpen} onOpenChange={setCustomMsgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" /> Mensagem personalizada
            </DialogTitle>
            <DialogDescription>
              Texto livre para os chapas confirmados desta tarefa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-[11px] text-success leading-relaxed">
              <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Confirmados já responderam — a janela de 24h do WhatsApp está aberta para mensagem livre.
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Atalhos</label>
              <div className="space-y-1">
                {msgTemplates.map((tpl, idx) => (
                  editingTplIdx === idx ? (
                    <div key={idx} className="flex items-center gap-1.5">
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
                        size="sm" variant="ghost" className="h-7 px-2 text-xs text-success"
                        disabled={!editingTplText.trim()}
                        onClick={() => {
                          persistTemplates(msgTemplates.map((t, i) => (i === idx ? editingTplText.trim() : t)));
                          setEditingTplIdx(null);
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setEditingTplIdx(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div key={idx} className="flex items-center gap-1.5 group">
                      <button
                        type="button"
                        onClick={() => setCustomMsgText(tpl)}
                        className="flex-1 text-left text-xs rounded-md border border-border bg-muted/30 hover:bg-primary/10 hover:border-primary/40 px-2.5 py-1.5 transition-colors truncate"
                        title="Clique para usar esta mensagem"
                      >
                        {tpl}
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground/40 hover:text-primary transition-colors shrink-0"
                        title="Editar atalho"
                        onClick={() => { setEditingTplIdx(idx); setEditingTplText(tpl); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                        title="Excluir atalho"
                        onClick={() => persistTemplates(msgTemplates.filter((_, i) => i !== idx))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mensagem</label>
              <Textarea
                value={customMsgText}
                onChange={(e) => setCustomMsgText(e.target.value)}
                placeholder="Digite a mensagem que será enviada…"
                rows={4}
                className="text-sm"
                autoFocus
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={!customMsgText.trim() || msgTemplates.includes(customMsgText.trim())}
                  className="text-[11px] text-primary hover:underline disabled:opacity-40 disabled:no-underline flex items-center gap-1"
                  onClick={() => persistTemplates([...msgTemplates, customMsgText.trim()])}
                >
                  <Plus className="h-3 w-3" /> Salvar como atalho
                </button>
                <p className="text-[10px] text-muted-foreground">{customMsgText.length} caracteres</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Destinatários ({customMsgSelected.size} de {confirmedWithPhone.length})
                </label>
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() =>
                    setCustomMsgSelected(
                      customMsgSelected.size === confirmedWithPhone.length
                        ? new Set()
                        : new Set(confirmedWithPhone.map((c) => c.id)),
                    )
                  }
                >
                  {customMsgSelected.size === confirmedWithPhone.length ? "Desmarcar todos" : "Marcar todos"}
                </button>
              </div>
              <div className="max-h-44 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {confirmedWithPhone.map((c) => (
                  <label key={c.id} className="flex items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/40">
                    <Checkbox
                      checked={customMsgSelected.has(c.id)}
                      onCheckedChange={(v) =>
                        setCustomMsgSelected((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(c.id); else next.delete(c.id);
                          return next;
                        })
                      }
                    />
                    <span className="font-medium text-foreground truncate">{c.nome_chapa}</span>
                    <span className="text-muted-foreground ml-auto font-mono text-[10px]">{c.telefone_chapa}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomMsgOpen(false)}>Cancelar</Button>
            <Button
              disabled={!customMsgText.trim() || customMsgSelected.size === 0}
              onClick={startCustomMsgDispatch}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Disparar para {customMsgSelected.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit phone dialog */}
      <Dialog open={!!editPhoneTarget} onOpenChange={(o) => !o && setEditPhoneTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar telefone</DialogTitle>
            <DialogDescription>
              Atualizar telefone de <b className="capitalize">{editPhoneTarget?.nome_chapa?.toLowerCase()}</b>
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="(00) 00000-0000"
            value={editPhoneValue}
            onChange={(e) => setEditPhoneValue(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPhoneTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={savePhone}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm-all dialog */}
      <Dialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar todos os chapas</DialogTitle>
            <DialogDescription>
              Confirmar todos os{" "}
              {task.chapas.filter((c) => c.nome_chapa && c.status_contato === "pendente").length} chapas
              desta tarefa como presentes?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAllOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmAll} className="bg-success hover:bg-success/90 text-success-foreground">
              Confirmar todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chapa row — 3-zone layout                                                 */
/* -------------------------------------------------------------------------- */

type RowProps = {
  chapa: TaskWithChapas["chapas"][number];
  taskId: number;
  taskSnap: TaskSnap;
  newChapaKeys?: Set<string>;
  fupLog: TaskWithChapas["fup_log"];
  onContact: (c: TaskWithChapas["chapas"][number], canal: string) => void;
  onConfirm: () => void;
  onNoResponse: () => void;
  onRemove: () => void;
  onEditPhone: () => void;
  onUndoOutcome: () => void;
  umblerReady?: boolean;
  cancelTemplateReady?: boolean;
  conf?: ConfiabilidadeStats | null;
};

function ChapaRowView({
  chapa,
  taskId,
  taskSnap,
  newChapaKeys,
  fupLog,
  onContact,
  onConfirm,
  onNoResponse,
  onRemove,
  onEditPhone,
  onUndoOutcome,
  umblerReady,
  cancelTemplateReady,
  conf,
}: RowProps) {
  const navigate = useNavigate();
  const chapaJobState = useChapaJobState(chapa.id);
  const pendingAction = chapaJobState?.action ?? null;
  const countdown = chapaJobState?.remaining ?? 0;

  // cancelSent is stored in localStorage so it persists across re-renders / refreshes
  const cancelSent = (() => {
    try { return !!localStorage.getItem(`umbler_cancel_${chapa.id}`); } catch { return false; }
  })();

  // How many times this chapa was dispatched individually via Umbler
  const umblerCount = fupLog.filter((f) => f.canal === "umbler_talk" && f.chapa_id === chapa.id).length;
  // How many times "sem resposta" was sent to this chapa
  const cancelCount = fupLog.filter((f) => f.canal === "umbler_cancelamento" && f.chapa_id === chapa.id).length;

  const placeholder = !chapa.nome_chapa;
  const isNew =
    !!chapa.nome_chapa &&
    !!newChapaKeys?.has(`${taskId}::${normalize(chapa.nome_chapa)}`);
  const status = chapa.status_contato;
  const isConfirmed = status === "confirmado";
  const isNoResponse = status === "nao_respondeu";
  const isRemoved = status === "removido";
  const isCancelado = status === "cancelado";

  // Light tint based on outcome
  const bg = isConfirmed
    ? "bg-[color-mix(in_srgb,hsl(var(--success))_6%,transparent)]"
    : isNoResponse
    ? "bg-[color-mix(in_srgb,hsl(var(--warning))_6%,transparent)]"
    : isCancelado
    ? "bg-[color-mix(in_srgb,hsl(var(--destructive))_5%,transparent)]"
    : isRemoved
    ? "bg-destructive/5"
    : "";

  return (
    <div
      data-chapa-name={chapa.nome_chapa ? chapa.nome_chapa.toLowerCase().trim().replace(/\s+/g, " ") : undefined}
      className={`px-4 py-3 flex items-center gap-3 transition-colors duration-200 ${bg} ${placeholder ? "opacity-60 italic" : ""}`}
    >
      {/* Zone 1 — identity */}
      <div className="flex-1 min-w-0">
        {chapa.nome_chapa ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => clipboardWrite(chapa.nome_chapa!, `Nome copiado: ${chapa.nome_chapa}`)}
              className="text-[13px] font-medium text-foreground hover:text-primary hover:underline cursor-pointer text-left truncate capitalize min-w-0 flex-1"
              title="Clique para copiar o nome"
            >
              {chapa.nome_chapa.toLowerCase()}
            </button>
            {conf && conf.participacoes >= CONFIABILIDADE_MIN_PARTICIPACOES && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums cursor-help ${
                      conf.stars >= 4 ? "text-success" : conf.stars <= 2 ? "text-destructive/80" : "text-muted-foreground"
                    }`}
                  >
                    <Star className="h-2.5 w-2.5 fill-current" />
                    {conf.stars.toFixed(1)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs space-y-0.5">
                  <p className="font-semibold">Confiabilidade — últimos 15 dias</p>
                  <p>{conf.participacoes} tarefa{conf.participacoes !== 1 ? "s" : ""} · {conf.confirmacoes} confirmaç{conf.confirmacoes !== 1 ? "ões" : "ão"}</p>
                  {(conf.presencas + conf.faltas) > 0 && (
                    <p>{conf.presencas} presença{conf.presencas !== 1 ? "s" : ""} · {conf.faltas} falta{conf.faltas !== 1 ? "s" : ""}</p>
                  )}
                  {conf.removidos > 0 && <p>{conf.removidos} remoç{conf.removidos !== 1 ? "ões" : "ão"}</p>}
                </TooltipContent>
              </Tooltip>
            )}
            {isNew && (
              <span
                className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-success/20 text-success border border-success/40 animate-pulse whitespace-nowrap"
                title="Adicionado na última atualização"
              >
                NOVO
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    const phone = (chapa.telefone_chapa ?? "").replace(/\D/g, "");
                    clipboardWrite(
                      `#${taskId} | ${chapa.nome_chapa} | ${phone || "sem telefone"}`,
                      "Dados copiados",
                    );
                  }}
                  className="shrink-0 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted transition-colors"
                  aria-label="Copiar dados completos"
                >
                  <ClipboardList className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Copiar ID + nome + telefone</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => navigate(`/chapas?q=${encodeURIComponent(chapa.nome_chapa!)}`)}
                  className="shrink-0 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground/30 hover:text-primary hover:bg-muted transition-colors"
                  aria-label="Ver no Caderno de Chapas"
                >
                  <BookUser className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Ver no Caderno de Chapas</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="text-[13px] font-medium text-foreground">Vaga em captação</div>
        )}
        {chapa.telefone_chapa ? (
          <button
            type="button"
            onClick={() => clipboardWrite((chapa.telefone_chapa ?? "").replace(/\D/g, ""), "Telefone copiado")}
            className="text-[12px] text-muted-foreground hover:text-primary hover:underline cursor-pointer tabular-nums"
            title="Clique para copiar"
          >
            {formatPhone(chapa.telefone_chapa)}
          </button>
        ) : (
          <div className="text-[12px] text-muted-foreground">—</div>
        )}
      </div>

      {/* Post-confirmation chip */}
      {isConfirmed ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-success/15 text-success border border-success/30 min-h-[28px]">
            <Check className="h-3.5 w-3.5" /> Confirmado
            {chapa.canal_contato && (
              <span className="font-normal opacity-80">· {canalLabel[chapa.canal_contato] ?? chapa.canal_contato}</span>
            )}
          </span>
          <RowMenu chapa={chapa} onRemove={onRemove} onEditPhone={onEditPhone} onUndoOutcome={onUndoOutcome} onContact3C={() => onContact(chapa, "ligacao_3c")} />
        </>
      ) : isNoResponse ? (
        <>
          <div className="flex flex-col items-end gap-0.5">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-warning/15 text-warning border border-warning/30 min-h-[28px]">
              <AlertTriangle className="h-3.5 w-3.5" /> Não respondeu
            </span>
            <button
              onClick={onRemove}
              className="text-[12px] text-destructive hover:underline font-medium"
            >
              Sinalizar remoção →
            </button>
          </div>
          <RowMenu chapa={chapa} onRemove={onRemove} onEditPhone={onEditPhone} onUndoOutcome={onUndoOutcome} onContact3C={() => onContact(chapa, "ligacao_3c")} />
        </>
      ) : isCancelado ? (
        <>
          <div className="flex flex-col items-end gap-0.5">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-destructive/10 text-destructive border border-destructive/30 min-h-[28px]">
              <UserX className="h-3.5 w-3.5" /> Negou FUP
            </span>
            <button
              onClick={onRemove}
              className="text-[12px] text-destructive hover:underline font-medium"
            >
              Sinalizar remoção →
            </button>
          </div>
          <RowMenu chapa={chapa} onRemove={onRemove} onEditPhone={onEditPhone} onUndoOutcome={onUndoOutcome} onContact3C={() => onContact(chapa, "ligacao_3c")} />
        </>
      ) : isRemoved ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-destructive/15 text-destructive border border-destructive/40 line-through min-h-[28px]">
            <Trash2 className="h-3.5 w-3.5" /> Removido
          </span>
          <RowMenu chapa={chapa} onRemove={onRemove} onEditPhone={onEditPhone} onUndoOutcome={onUndoOutcome} onContact3C={() => onContact(chapa, "ligacao_3c")} />
        </>
      ) : !placeholder ? (
        <>
          {/* Zone 2 — channels */}
          <div className="flex items-center gap-1">
            {/* WhatsApp */}
            {(() => {
              const used = chapa.canal_contato === "whatsapp_web";
              const phone = chapa.telefone_chapa?.replace(/\D/g, "");
              const waHref = phone ? `https://wa.me/55${phone}` : undefined;
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={waHref}
                      target={waHref ? "_blank" : undefined}
                      rel={waHref ? "noopener noreferrer" : undefined}
                      onClick={() => onContact(chapa, "whatsapp_web")}
                      className={`inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md border text-[11px] font-medium transition-colors min-h-[28px] cursor-pointer ${used ? "border-info/40 bg-info/10 text-info" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                      aria-label={waHref ? "Abrir WhatsApp e registrar contato" : "Registrar contato via WhatsApp"}
                    >
                      {used && <Check className="h-3 w-3" />}
                      <MessageCircle className="h-3 w-3" />
                      <span>WhatsApp</span>
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>
                    {waHref
                      ? "Abrir WhatsApp no número do chapa · registra contato automaticamente"
                      : "Registrar contato via WhatsApp (chapa sem telefone cadastrado)"}
                  </TooltipContent>
                </Tooltip>
              );
            })()}

            {/* Enviar Umbler — with 1-min countdown, resendable */}
            {(umblerReady || chapa.canal_contato === "umbler_talk") && (() => {
              const everSent = chapa.canal_contato === "umbler_talk" || umblerCount > 0;
              const isPending = pendingAction === "fup";
              const countLabel = umblerCount > 0 ? ` (${umblerCount}x)` : "";
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={isPending ? () => dispatchQueue.abortChapaJob(chapa.id) : () => dispatchQueue.startChapaJob(chapa.id, "fup", chapa as ChapaSnap, taskSnap)}
                      disabled={pendingAction === "cancel"}
                      className={`inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md border text-[11px] font-semibold transition-colors min-h-[28px] ${
                        isPending
                          ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                          : everSent
                          ? "border-success/40 bg-success/10 text-success hover:bg-success/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      }`}
                      aria-label={isPending ? "Cancelar envio" : everSent ? "Reenviar via Umbler" : "Enviar template via Umbler"}
                    >
                      {isPending ? (
                        <><X className="h-3 w-3" /><span>{countdown}s</span></>
                      ) : everSent ? (
                        <><Check className="h-3 w-3" /><span>Enviado{countLabel}</span></>
                      ) : (
                        <><Send className="h-3 w-3" /><span>Enviar Umbler</span></>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isPending
                      ? "Clique para cancelar o envio"
                      : everSent
                      ? `Disparado ${umblerCount > 0 ? `${umblerCount}x` : "anteriormente"} — clique para reenviar`
                      : "Enviar template de confirmação — aguarda 1 min antes de disparar"}
                  </TooltipContent>
                </Tooltip>
              );
            })()}

            {/* Sem Resposta — cancelamento por falta de resposta */}
            {(cancelTemplateReady || cancelSent || cancelCount > 0) && chapa.telefone_chapa && (() => {
              const isPending = pendingAction === "cancel";
              const everSent = cancelCount > 0 || cancelSent;
              const countLabel = cancelCount > 0 ? ` (${cancelCount}x)` : "";
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={isPending ? () => dispatchQueue.abortChapaJob(chapa.id) : () => dispatchQueue.startChapaJob(chapa.id, "cancel", chapa as ChapaSnap, taskSnap)}
                      disabled={pendingAction === "fup"}
                      className={`inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md border text-[11px] font-semibold transition-colors min-h-[28px] ${
                        isPending
                          ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                          : everSent
                          ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          : "border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive/70 hover:bg-destructive/5 disabled:opacity-40 disabled:cursor-not-allowed"
                      }`}
                      aria-label={isPending ? "Cancelar envio" : everSent ? "Reenviar sem resposta" : "Enviar template de sem resposta"}
                    >
                      {isPending ? (
                        <><X className="h-3 w-3" /><span>{countdown}s</span></>
                      ) : everSent ? (
                        <><Check className="h-3 w-3" /><span>Sem resp.{countLabel}</span></>
                      ) : (
                        <><UserMinus className="h-3 w-3" /><span>Sem resp.</span></>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isPending
                      ? "Clique para cancelar"
                      : everSent
                      ? `Sem resposta disparado ${cancelCount > 0 ? `${cancelCount}x` : "anteriormente"} — clique para reenviar`
                      : "Enviar template de cancelamento por falta de resposta — aguarda 1 min"}
                  </TooltipContent>
                </Tooltip>
              );
            })()}

          </div>
          {/* Zone 3 — outcome */}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 gap-1 text-[13px] bg-success hover:bg-success/90 text-success-foreground min-h-[28px]"
              onClick={onConfirm}
            >
              <Check className="h-3.5 w-3.5" /> Confirmado
            </Button>
            <RowMenu
              chapa={chapa}
              onContact3C={() => onContact(chapa, "ligacao_3c")}
              onNoResponse={onNoResponse}
              onRemove={onRemove}
              onEditPhone={onEditPhone}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function RowMenu({
  chapa,
  onContact3C,
  onNoResponse,
  onRemove,
  onEditPhone,
  onUndoOutcome,
}: {
  chapa: TaskWithChapas["chapas"][number];
  onContact3C?: () => void;
  onNoResponse?: () => void;
  onRemove: () => void;
  onEditPhone: () => void;
  onUndoOutcome?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Mais opções para ${chapa.nome_chapa ?? "chapa"}`}
          className="inline-flex items-center justify-center min-h-[28px] min-w-[28px] rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {onUndoOutcome && (
          <DropdownMenuItem onClick={onUndoOutcome}>
            Reabrir / desfazer
          </DropdownMenuItem>
        )}
        {onNoResponse && (
          <DropdownMenuItem onClick={onNoResponse}>
            <UserMinus className="h-3.5 w-3.5 mr-1.5 opacity-60" />
            Não respondeu
          </DropdownMenuItem>
        )}
        {onContact3C && (
          <DropdownMenuItem onClick={onContact3C}>
            <Phone className="h-3.5 w-3.5 mr-1.5 opacity-60" />
            Registrar ligação 3C
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onEditPhone}>
          Editar telefone
        </DropdownMenuItem>
        {chapa.nome_chapa && (
          <DropdownMenuItem onClick={() => navigate("/chapas")}>
            <BookUser className="h-3.5 w-3.5 mr-1.5 opacity-60" />
            Ver no Caderno de Chapas
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={onRemove}
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          Sinalizar remoção
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
