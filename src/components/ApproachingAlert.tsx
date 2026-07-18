import { useState, useEffect, useRef, useCallback } from "react";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Copy,
  Check,
  X,
  ArrowRight,
  DoorOpen,
  Send,
  UserMinus,
  Minus,
  Trash2,
} from "lucide-react";
import { useOverlaySlot } from "@/lib/overlayStack";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TaskCard, type TaskWithChapas } from "./TaskCard";
import { fmtTime, parseTaskDate, todayDateISO_SP } from "@/lib/datetime";
import { normalize } from "@/lib/normalize";
import { readSettings, type PortariaRule } from "@/lib/settings";
import { playAlertBeep } from "@/lib/sound";
import { getDb, uuid, errMsg } from "@/lib/db";
import { sendUmblerFup, startUmblerBot, fmtTaskDateParam } from "@/lib/umbler";
import { toast } from "sonner";

/* ── helpers ── */

function fmtPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function waLink(raw: string) {
  return `https://wa.me/55${raw.replace(/\D/g, "")}`;
}

async function clipboardCopy(text: string, msg = "Copiado") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(msg);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

/* ── types ── */

type ChapaRow = { id: string; nome: string; telefone: string; dataTarefa: string; empresa: string };
type ParaRemoverRow = { id: string; nome_chapa: string; empresa: string; id_tarefa: number };

type TaskGroup = {
  task: TaskWithChapas;
  minutesLeft: number;
  chapas: ChapaRow[];
};

type PortariaAlert = {
  task: TaskWithChapas;
  rule: PortariaRule;
  minutesLeft: number;
  nomes: string[];
};

/* ── compute ── */

function computeGroups(tasks: TaskWithChapas[]): TaskGroup[] {
  const now = Date.now();
  const groups: TaskGroup[] = [];
  tasks.forEach((task) => {
    const minutesLeft = (parseTaskDate(task.data_tarefa, task.cidade_uf).getTime() - now) / 60_000;
    if (minutesLeft <= 0 || minutesLeft > 60) return;
    const unconfirmed = task.chapas.filter(
      (c) => c.nome_chapa && c.status_contato !== "confirmado" && c.status_contato !== "removido",
    );
    if (unconfirmed.length === 0) return;
    groups.push({
      task,
      minutesLeft,
      chapas: unconfirmed.map((c) => ({
        id: c.id,
        nome: c.nome_chapa!,
        telefone: c.telefone_chapa ?? "",
        dataTarefa: task.data_tarefa,
        empresa: task.empresa,
      })),
    });
  });
  return groups.sort((a, b) => a.minutesLeft - b.minutesLeft);
}

function computePortaria(tasks: TaskWithChapas[], rules: PortariaRule[]): PortariaAlert[] {
  const now = Date.now();
  const alerts: PortariaAlert[] = [];
  rules.forEach((rule) => {
    const maxMin = rule.horasAntes * 60;
    tasks.forEach((task) => {
      const minutesLeft = (parseTaskDate(task.data_tarefa, task.cidade_uf).getTime() - now) / 60_000;
      if (minutesLeft <= 0 || minutesLeft > maxMin) return;
      if (!normalize(task.empresa).includes(normalize(rule.empresa))) return;
      const nomes = task.chapas
        .filter((c) => c.nome_chapa && c.status_contato !== "removido")
        .map((c) => c.nome_chapa!);
      alerts.push({ task, rule, minutesLeft, nomes });
    });
  });
  return alerts.sort((a, b) => a.minutesLeft - b.minutesLeft);
}

function fmtMinutes(min: number) {
  if (min < 60) return `${Math.ceil(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.ceil(min % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/* ── ChapaItem ── */

function ChapaItem({
  chapa,
  onConfirm,
  onRemove,
}: {
  chapa: ChapaRow;
  onConfirm: () => void;
  onRemove: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<"confirm" | "remove" | null>(null);

  // Umbler countdown: "fup" | "cancel" | null
  const [pendingAction, setPendingAction] = useState<"fup" | "cancel" | null>(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const { umblerSettings } = readSettings();
  const umblerReady = !!(
    umblerSettings.bearerToken &&
    umblerSettings.fromPhone &&
    umblerSettings.organizationId
  );
  const cancelReady = umblerReady && !!umblerSettings.cancelTemplateId;
  const hasPhone = !!chapa.telefone;

  function startCountdown(action: "fup" | "cancel") {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPendingAction(action);
    setCountdown(60);
    intervalRef.current = setInterval(() => setCountdown((v) => Math.max(0, v - 1)), 1_000);
    timerRef.current = setTimeout(async () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPendingAction(null);
      setCountdown(0);
      if (action === "fup") await fireUmblerFup();
      else await fireUmblerCancel();
    }, 60_000);
  }

  function stopCountdown() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPendingAction(null);
    setCountdown(0);
  }

  async function fireUmblerFup() {
    if (!hasPhone) { toast.error("Chapa sem número cadastrado"); return; }
    if (!umblerSettings.fupBotId || !umblerSettings.fupBotTriggerName) {
      toast.error("Configure o Bot ID e Trigger Name do FUP em Integrações.");
      return;
    }
    const taskDateStr = chapa.dataTarefa.slice(0, 10);
    const isD1 = taskDateStr > todayDateISO_SP() && !!(umblerSettings.fupBotD1Id && umblerSettings.fupBotD1TriggerName);
    let chatId: string | null = null;
    try {
      const res = await startUmblerBot({
        chapaTelefone: chapa.telefone,
        settings: umblerSettings,
        initialData: {
          Data: fmtTaskDateParam(chapa.dataTarefa),
          Cidade: chapa.empresa,
        },
        botIdOverride: isD1 ? umblerSettings.fupBotD1Id : umblerSettings.fupBotId,
        triggerNameOverride: isD1 ? umblerSettings.fupBotD1TriggerName : umblerSettings.fupBotTriggerName,
      });
      chatId = res.chatId;
    } catch (e) {
      toast.error(`Falha ao enviar FUP: ${errMsg(e)}`);
      return;
    }
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      try { await db.execute("ALTER TABLE fup_log ADD COLUMN umbler_chat_id TEXT"); } catch { /* exists */ }
      await db.execute(
        "UPDATE chapas SET canal_contato = ?, data_contato = ? WHERE id = ?",
        ["umbler_talk", now, chapa.id],
      );
      await db.execute(
        "INSERT INTO fup_log (id, id_tarefa, canal, data_disparo, observacao, chapa_id, umbler_chat_id) VALUES (?, (SELECT id_tarefa FROM chapas WHERE id = ?), ?, ?, ?, ?, ?)",
        [uuid(), chapa.id, "umbler_talk", now, "Disparado via alerta de proximidade", chapa.id, chatId],
      );
    } catch { /* mensagem já enviada */ }
    toast.success(`FUP enviado para ${chapa.nome}`);
    onConfirm();
  }

  async function fireUmblerCancel() {
    if (!hasPhone) { toast.error("Chapa sem número cadastrado"); return; }
    let chatId: string | null = null;
    try {
      const res = await sendUmblerFup({
        chapaNome: chapa.nome,
        chapaTelefone: chapa.telefone,
        dataTarefa: chapa.dataTarefa,
        empresa: chapa.empresa,
        settings: umblerSettings,
        templateIdOverride: umblerSettings.cancelTemplateId,
        overrideParams: [],
      });
      chatId = res.chatId;
    } catch (e) {
      toast.error(`Falha ao enviar sem-resposta: ${errMsg(e)}`);
      return;
    }
    try {
      const db = await getDb();
      try { await db.execute("ALTER TABLE fup_log ADD COLUMN umbler_chat_id TEXT"); } catch { /* exists */ }
      await db.execute(
        "INSERT INTO fup_log (id, id_tarefa, canal, data_disparo, observacao, chapa_id, umbler_chat_id) VALUES (?, (SELECT id_tarefa FROM chapas WHERE id = ?), ?, ?, ?, ?, ?)",
        [uuid(), chapa.id, "umbler_cancelamento", new Date().toISOString(), `Sem resposta — ${chapa.nome}`, chapa.id, chatId],
      );
      localStorage.setItem(`umbler_cancel_${chapa.id}`, "1");
    } catch { /* noop */ }
    toast.success(`Sem-resposta enviado para ${chapa.nome}`);
    onRemove();
  }

  async function handleConfirm() {
    setLoading("confirm");
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE chapas SET status_contato = 'confirmado', data_contato = ? WHERE id = ?",
        [new Date().toISOString(), chapa.id],
      );
      toast.success(`${chapa.nome} confirmado`);
      onConfirm();
    } catch {
      toast.error("Erro ao confirmar");
    } finally {
      setLoading(null);
    }
  }

  async function handleRemove() {
    setLoading("remove");
    try {
      const db = await getDb();
      await db.execute("UPDATE chapas SET status_contato = 'removido' WHERE id = ?", [chapa.id]);
      toast.success(`${chapa.nome} removido`);
      onRemove();
    } catch {
      toast.error("Erro ao remover");
    } finally {
      setLoading(null);
    }
  }

  function copyPhone(e: React.MouseEvent) {
    e.preventDefault();
    clipboardCopy(chapa.telefone.replace(/\D/g, ""), "Número copiado");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const busy = loading !== null || pendingAction !== null;

  return (
    <li className="space-y-1.5">
      {/* Row 1 — nome + confirmar + remover */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm text-foreground truncate flex-1 capitalize">
          {chapa.nome.toLowerCase()}
        </span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          title="Confirmar presença"
          className="h-6 w-6 inline-flex items-center justify-center rounded-md border border-success/40 text-success hover:bg-success/15 disabled:opacity-40 transition-colors shrink-0"
        >
          {loading === "confirm"
            ? <span className="h-3 w-3 border border-success border-t-transparent rounded-full animate-spin" />
            : <Check className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          title="Remover"
          className="h-6 w-6 inline-flex items-center justify-center rounded-md border border-destructive/30 text-destructive/70 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 transition-colors shrink-0"
        >
          {loading === "remove"
            ? <span className="h-3 w-3 border border-destructive border-t-transparent rounded-full animate-spin" />
            : <X className="h-3 w-3" />}
        </button>
      </div>

      {/* Row 2 — telefone + whatsapp */}
      {chapa.telefone ? (
        <div className="flex items-center gap-1 pl-0.5">
          <button
            type="button"
            onClick={copyPhone}
            title="Copiar número"
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors font-mono tabular-nums"
          >
            {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3 opacity-40" />}
            {fmtPhone(chapa.telefone)}
          </button>
          <a
            href={waLink(chapa.telefone)}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir WhatsApp"
            className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-success/15 text-muted-foreground hover:text-success transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground/40 pl-0.5">sem número</span>
      )}

      {/* Row 3 — disparos Umbler (só se configurado e tiver telefone) */}
      {hasPhone && (umblerReady || cancelReady) && (
        <div className="flex items-center gap-2 pl-0.5">
          {umblerReady && (
            pendingAction === "fup" ? (
              <button
                type="button"
                onClick={stopCountdown}
                title="Cancelar envio"
                className="flex items-center gap-1 text-[11px] font-medium text-warning border border-warning/40 bg-warning/10 rounded px-1.5 py-0.5 hover:bg-warning/20 transition-colors tabular-nums"
              >
                <Send className="h-2.5 w-2.5" />
                <span>FUP em {countdown}s</span>
                <X className="h-2.5 w-2.5 opacity-60" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startCountdown("fup")}
                disabled={pendingAction === "cancel" || loading !== null}
                title="Disparar FUP via Umbler Talk — aguarda 60 s antes de enviar"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-border border border-transparent rounded px-1.5 py-0.5 transition-colors disabled:opacity-30"
              >
                <Send className="h-2.5 w-2.5" />
                <span>Enviar FUP</span>
              </button>
            )
          )}
          {cancelReady && (
            pendingAction === "cancel" ? (
              <button
                type="button"
                onClick={stopCountdown}
                title="Cancelar envio"
                className="flex items-center gap-1 text-[11px] font-medium text-destructive border border-destructive/40 bg-destructive/10 rounded px-1.5 py-0.5 hover:bg-destructive/20 transition-colors tabular-nums"
              >
                <UserMinus className="h-2.5 w-2.5" />
                <span>Sem resp. em {countdown}s</span>
                <X className="h-2.5 w-2.5 opacity-60" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startCountdown("cancel")}
                disabled={pendingAction === "fup" || loading !== null}
                title="Avisar chapa de ausência de resposta — aguarda 60 s antes de enviar"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-border border border-transparent rounded px-1.5 py-0.5 transition-colors disabled:opacity-30"
              >
                <UserMinus className="h-2.5 w-2.5" />
                <span>Sem resp.</span>
              </button>
            )
          )}
        </div>
      )}
    </li>
  );
}

/* ── Main ── */

type Props = {
  tasks: TaskWithChapas[];
  onRefresh: () => void;
};

const MIN_KEY = "ovl_min_approaching";

export function ApproachingAlert({ tasks, onRefresh }: Props) {
  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(() => sessionStorage.getItem(MIN_KEY) === "1");
  const [sheetTask, setSheetTask] = useState<TaskWithChapas | null>(null);
  const [localTasks, setLocalTasks] = useState<TaskWithChapas[]>(tasks);
  const [donePortaria, setDonePortaria] = useState<Set<string>>(() => new Set());
  const [, setTick] = useState(0);
  const [paraRemover, setParaRemover] = useState<ParaRemoverRow[]>([]);
  const [paraRemoverOpen, setParaRemoverOpen] = useState(true);
  const alertedIdsRef = useRef<Set<number>>(new Set());
  const isFirstRef = useRef(true);
  const rootRef = useRef<HTMLDivElement>(null);

  const fetchParaRemover = useCallback(async () => {
    try {
      const db = await getDb();
      const rows = await db.select<ParaRemoverRow[]>(
        `SELECT c.id, c.nome_chapa, t.empresa, t.id_tarefa
         FROM chapas c
         JOIN tarefas t ON c.id_tarefa = t.id_tarefa
         WHERE c.canal_contato = 'umbler_cancelamento'
           AND c.status_contato NOT IN ('confirmado', 'removido')
           AND t.ativo = 1
           AND datetime(t.data_tarefa) > datetime('now', '-4 hours')
         ORDER BY c.nome_chapa`,
      );
      setParaRemover(rows);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { setLocalTasks(tasks); }, [tasks]);
  useEffect(() => {
    fetchParaRemover();
    const id = setInterval(() => { setTick((t) => t + 1); fetchParaRemover(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchParaRemover]);

  // Sound alert: beep when new tasks enter the approaching window
  useEffect(() => {
    const s = readSettings();
    const currentGroups = s.approachingAlertEnabled ? computeGroups(localTasks) : [];
    const currentIds = new Set(currentGroups.map((g) => g.task.id_tarefa));
    if (!isFirstRef.current && s.sons.alertas) {
      if (currentGroups.some((g) => !alertedIdsRef.current.has(g.task.id_tarefa))) {
        playAlertBeep();
      }
    }
    isFirstRef.current = false;
    alertedIdsRef.current = currentIds;
  }, [localTasks]);

  const s = readSettings();
  const approachingEnabled = s.approachingAlertEnabled;
  const portariaRules = s.portariaRules;

  const groups = approachingEnabled ? computeGroups(localTasks) : [];
  const portariaAlerts = computePortaria(localTasks, portariaRules).filter(
    (a) => !donePortaria.has(`${a.task.id_tarefa}_${a.rule.id}`),
  );

  function markPortariaDone(taskId: number, ruleId: string) {
    setDonePortaria((prev) => new Set([...prev, `${taskId}_${ruleId}`]));
  }

  const totalChapas = groups.reduce((sum, g) => sum + g.chapas.length, 0);
  const totalSections = (totalChapas > 0 ? 1 : 0) + (portariaAlerts.length > 0 ? 1 : 0) + (paraRemover.length > 0 ? 1 : 0);

  const offset = useOverlaySlot("approaching", rootRef, totalSections > 0, minimized);

  function removeLocalChapa(taskId: number, chapaId: string) {
    setLocalTasks((prev) =>
      prev.map((t) =>
        t.id_tarefa !== taskId ? t : {
          ...t,
          chapas: t.chapas.map((c) =>
            c.id === chapaId ? { ...c, status_contato: "confirmado" } : c,
          ),
        },
      ),
    );
    onRefresh();
  }

  async function removerChapa(chapaId: string) {
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE chapas SET status_contato = 'removido', data_remocao = ? WHERE id = ?",
        [new Date().toISOString(), chapaId],
      );
      setParaRemover((prev) => prev.filter((r) => r.id !== chapaId));
      onRefresh();
    } catch {
      toast.error("Erro ao remover chapa");
    }
  }

  function setMin(v: boolean) {
    setMinimized(v);
    try { sessionStorage.setItem(MIN_KEY, v ? "1" : "0"); } catch { /* noop */ }
  }

  if (totalSections === 0) return null;

  if (minimized) {
    return (
      <>
        <div ref={rootRef} style={{ bottom: 16 + offset }} className="fixed right-4 z-40">
          <button
            type="button"
            onClick={() => setMin(false)}
            className="flex items-center gap-2 rounded-full border border-warning/50 bg-card px-3.5 py-2 shadow-lg hover:bg-warning/10 transition-colors"
            title={`${totalChapas} chapa(s) a confirmar${portariaAlerts.length > 0 ? ` · ${portariaAlerts.length} portaria(s)` : ""} — clique para expandir`}
          >
            <span className="relative shrink-0">
              <Clock className="h-3.5 w-3.5 text-warning" />
              <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-warning animate-ping" />
            </span>
            <span className="text-xs font-semibold tabular-nums text-warning">
              {totalChapas + portariaAlerts.length}
            </span>
          </button>
        </div>
        <Sheet open={sheetTask !== null} onOpenChange={(o) => !o && setSheetTask(null)}>
          <SheetContent side="right" className="w-full sm:w-[680px] sm:max-w-[90vw] p-0 overflow-y-auto">
            <SheetHeader className="px-4 pt-4 pb-0">
              <SheetTitle className="text-sm font-semibold text-muted-foreground">Detalhes da tarefa</SheetTitle>
            </SheetHeader>
            <div className="p-4">
              {sheetTask && (
                <TaskCard task={sheetTask} onRefresh={() => { onRefresh(); setSheetTask(null); }} />
              )}
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <>
      <div
        ref={rootRef}
        style={{ bottom: 16 + offset }}
        className="fixed right-4 z-40 w-80 rounded-2xl border border-warning/50 bg-card shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.55)] overflow-hidden"
        role="alert"
        aria-live="polite"
      >
        {/* Header */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 px-4 py-3 bg-warning/10 hover:bg-warning/15 transition-colors text-left"
        >
          <span className="relative shrink-0">
            <Clock className="h-4 w-4 text-warning" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-warning animate-ping" />
          </span>
          <span className="flex-1 text-sm font-semibold text-warning">
            {totalChapas > 0 && `${totalChapas} chapa${totalChapas !== 1 ? "s" : ""} a confirmar`}
            {totalChapas > 0 && portariaAlerts.length > 0 && " · "}
            {portariaAlerts.length > 0 && `${portariaAlerts.length} portaria${portariaAlerts.length !== 1 ? "s" : ""}`}
            {(totalChapas > 0 || portariaAlerts.length > 0) && paraRemover.length > 0 && " · "}
            {paraRemover.length > 0 && <span className="text-destructive">{paraRemover.length} p/ remover</span>}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setMin(true); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setMin(true); } }}
            className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Minimizar"
            aria-label="Minimizar alerta de proximidade"
          >
            <Minus className="h-3.5 w-3.5" />
          </span>
          {open
            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>

        {open && (
          <div className="divide-y divide-border max-h-[65vh] overflow-y-auto">

            {/* ── Para remover ── */}
            {paraRemover.length > 0 && (
              <div className="px-4 py-2.5 space-y-1.5">
                <button
                  type="button"
                  onClick={() => setParaRemoverOpen((v) => !v)}
                  className="w-full flex items-center gap-1.5 text-left"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <span className="text-xs font-semibold text-destructive flex-1">
                    Para remover ({paraRemover.length})
                  </span>
                  {paraRemoverOpen
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                {paraRemoverOpen && (
                  <ul className="space-y-1.5 pt-0.5">
                    {paraRemover.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-foreground truncate flex-1 capitalize">
                          {r.nome_chapa.toLowerCase()}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate shrink-0 max-w-[80px]">
                          {r.empresa.toLowerCase()}
                        </span>
                        <button
                          type="button"
                          onClick={() => removerChapa(r.id)}
                          title="Confirmar remoção"
                          className="h-6 w-6 inline-flex items-center justify-center rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ── Portaria alerts ── */}
            {portariaAlerts.map(({ task, rule, minutesLeft, nomes }) => (
              <div key={`p-${task.id_tarefa}-${rule.id}`} className="px-4 py-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <DoorOpen className="h-3.5 w-3.5 text-info shrink-0" />
                  <span className="text-xs font-bold text-info tabular-nums shrink-0">
                    {fmtMinutes(minutesLeft)}
                  </span>
                  <span className="text-xs font-semibold text-foreground truncate flex-1 capitalize">
                    {task.empresa.toLowerCase()}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {fmtTime(task.data_tarefa)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSheetTask(task)}
                    title="Ver tarefa completa"
                    className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="rounded-md bg-info/5 border border-info/20 px-3 py-2 space-y-1.5">
                  <p className="text-[11px] font-semibold text-info flex items-center gap-1">
                    <DoorOpen className="h-3 w-3" /> Enviar lista para portaria
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {nomes.length} nome{nomes.length !== 1 ? "s" : ""} para liberação
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => clipboardCopy(nomes.join("\n"), `${nomes.length} nome(s) copiados`)}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-info hover:text-info/80 transition-colors"
                    >
                      <Copy className="h-3 w-3" /> Copiar lista
                    </button>
                    <button
                      type="button"
                      onClick={() => markPortariaDone(task.id_tarefa, rule.id)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-success hover:text-success/80 border border-success/30 rounded px-1.5 py-0.5 bg-success/10 hover:bg-success/20 transition-colors"
                    >
                      <Check className="h-3 w-3" /> Concluído
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* ── Chapas a confirmar ── */}
            {groups.map(({ task, minutesLeft, chapas }) => (
              <div key={task.id_tarefa} className="px-4 py-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-warning tabular-nums shrink-0">
                    {fmtMinutes(minutesLeft)}
                  </span>
                  <span className="text-xs font-semibold text-foreground truncate capitalize flex-1">
                    {task.empresa.toLowerCase()}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {fmtTime(task.data_tarefa)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSheetTask(task)}
                    title="Ver tarefa completa"
                    className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <ul className="space-y-3">
                  {chapas.map((c) => (
                    <ChapaItem
                      key={c.id}
                      chapa={c}
                      onConfirm={() => removeLocalChapa(task.id_tarefa, c.id)}
                      onRemove={() => removeLocalChapa(task.id_tarefa, c.id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {open && (
          <div className="px-4 py-2 bg-muted/40 border-t border-border">
            <p className="text-[10px] text-muted-foreground">
              ✓ confirma · × remove · → tarefa completa · Enviar FUP / Sem resp. disparam via Umbler após 60 s
            </p>
          </div>
        )}
      </div>

      <Sheet open={sheetTask !== null} onOpenChange={(o) => !o && setSheetTask(null)}>
        <SheetContent side="right" className="w-full sm:w-[680px] sm:max-w-[90vw] p-0 overflow-y-auto">
          <SheetHeader className="px-4 pt-4 pb-0">
            <SheetTitle className="text-sm font-semibold text-muted-foreground">Detalhes da tarefa</SheetTitle>
          </SheetHeader>
          <div className="p-4">
            {sheetTask && (
              <TaskCard task={sheetTask} onRefresh={() => { onRefresh(); setSheetTask(null); }} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
