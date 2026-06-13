import { toast } from "sonner";
import { getDb, uuid, errMsg } from "./db";
import { readSettings } from "./settings";
import { sendUmblerFup, sendUmblerFreeText, startUmblerBot, fmtTaskDateParam, humanizarErroUmbler } from "./umbler";
import { fmtSP, todayDateISO_SP } from "./datetime";

export type MassFupProgress =
  | { phase: "sending"; sent: number; total: number }
  | { phase: "retry-wait"; countdown: number; retryTotal: number; firstSent: number }
  | { phase: "retrying"; retrySent: number; retryTotal: number; firstSent: number };

export type MassFupState =
  | { status: "countdown"; remaining: number }
  | { status: "sending"; progress: MassFupProgress | null }
  | null;

export type TaskCancelState =
  | { status: "countdown"; remaining: number }
  | null;

export type ChapaJobState =
  | { status: "countdown"; remaining: number; action: "fup" | "cancel" }
  | null;

export type CustomMsgState =
  | { status: "countdown"; remaining: number }
  | { status: "sending"; sent: number; total: number }
  | null;

// Job ativo para o painel global de disparos (countdowns e envios em andamento)
export type ActiveJob = {
  id: string;
  kind: "massFup" | "taskCancel" | "customMsg" | "chapaFup" | "chapaCancel";
  taskId: number;
  titulo: string;     // ex: empresa da tarefa
  descricao: string;  // ex: "FUP Todos", "Mensagem personalizada", "FUP — João"
  remaining: number | null;          // segundos de countdown (null = enviando)
  progress: { sent: number; total: number } | null;
  cancel: () => void;
};

export type ChapaSnap = {
  id: string;
  nome_chapa: string | null;
  telefone_chapa: string | null;
  status_contato: string;
};

export type TaskSnap = {
  id_tarefa: number;
  data_tarefa: string;
  empresa: string;
  cidade_uf?: string | null;
};

type Sub<T> = (state: T) => void;

class DispatchQueue {
  private massFupStates = new Map<number, MassFupState>();
  private taskCancelStates = new Map<number, TaskCancelState>();
  private chapaJobStates = new Map<string, ChapaJobState>();

  private massFupAborts = new Map<number, boolean>();

  private massFupSubs = new Map<number, Set<Sub<MassFupState>>>();
  private taskCancelSubs = new Map<number, Set<Sub<TaskCancelState>>>();
  private chapaJobSubs = new Map<string, Set<Sub<ChapaJobState>>>();

  private taskMeta = new Map<number, string>(); // taskId → empresa (rótulo p/ painel global)
  private chapaMeta = new Map<string, { nome: string; taskId: number; empresa: string }>();
  private anyJobSubs = new Set<() => void>();

  private customMsgStates = new Map<number, CustomMsgState>();
  private customMsgAborts = new Map<number, boolean>();
  private customMsgSubs = new Map<number, Set<Sub<CustomMsgState>>>();
  private customMsgIntervals = new Map<number, ReturnType<typeof setInterval>>();
  private customMsgTimers = new Map<number, ReturnType<typeof setTimeout>>();

  private massFupIntervals = new Map<number, ReturnType<typeof setInterval>>();
  private massFupTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private taskCancelIntervals = new Map<number, ReturnType<typeof setInterval>>();
  private taskCancelTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private chapaIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private chapaTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ---- Getters ----

  getMassFupState(taskId: number): MassFupState {
    return this.massFupStates.get(taskId) ?? null;
  }

  getTaskCancelState(taskId: number): TaskCancelState {
    return this.taskCancelStates.get(taskId) ?? null;
  }

  getChapaJobState(chapaId: string): ChapaJobState {
    return this.chapaJobStates.get(chapaId) ?? null;
  }

  // ---- Subscribe ----

  subscribeMassFup(taskId: number, cb: Sub<MassFupState>): () => void {
    if (!this.massFupSubs.has(taskId)) this.massFupSubs.set(taskId, new Set());
    this.massFupSubs.get(taskId)!.add(cb);
    cb(this.massFupStates.get(taskId) ?? null);
    return () => this.massFupSubs.get(taskId)?.delete(cb);
  }

  subscribeTaskCancel(taskId: number, cb: Sub<TaskCancelState>): () => void {
    if (!this.taskCancelSubs.has(taskId)) this.taskCancelSubs.set(taskId, new Set());
    this.taskCancelSubs.get(taskId)!.add(cb);
    cb(this.taskCancelStates.get(taskId) ?? null);
    return () => this.taskCancelSubs.get(taskId)?.delete(cb);
  }

  subscribeChapaJob(chapaId: string, cb: Sub<ChapaJobState>): () => void {
    if (!this.chapaJobSubs.has(chapaId)) this.chapaJobSubs.set(chapaId, new Set());
    this.chapaJobSubs.get(chapaId)!.add(cb);
    cb(this.chapaJobStates.get(chapaId) ?? null);
    return () => this.chapaJobSubs.get(chapaId)?.delete(cb);
  }

  // ---- Notify helpers ----

  private notifyMassFup(taskId: number) {
    const state = this.massFupStates.get(taskId) ?? null;
    this.massFupSubs.get(taskId)?.forEach((cb) => cb(state));
    this.notifyAnyJob();
  }

  private notifyTaskCancel(taskId: number) {
    const state = this.taskCancelStates.get(taskId) ?? null;
    this.taskCancelSubs.get(taskId)?.forEach((cb) => cb(state));
    this.notifyAnyJob();
  }

  private notifyChapaJob(chapaId: string) {
    const state = this.chapaJobStates.get(chapaId) ?? null;
    this.chapaJobSubs.get(chapaId)?.forEach((cb) => cb(state));
    this.notifyAnyJob();
  }

  private notifyAnyJob() {
    this.anyJobSubs.forEach((cb) => cb());
  }

  subscribeAnyJob(cb: () => void): () => void {
    this.anyJobSubs.add(cb);
    return () => { this.anyJobSubs.delete(cb); };
  }

  getActiveJobs(): ActiveJob[] {
    const jobs: ActiveJob[] = [];
    this.massFupStates.forEach((st, taskId) => {
      if (!st) return;
      jobs.push({
        id: `massfup-${taskId}`, kind: "massFup", taskId,
        titulo: this.taskMeta.get(taskId) ?? `Tarefa #${taskId}`,
        descricao: "FUP Todos",
        remaining: st.status === "countdown" ? st.remaining : null,
        progress: st.status === "sending" && st.progress?.phase === "sending"
          ? { sent: st.progress.sent, total: st.progress.total } : null,
        cancel: () => this.abortMassFup(taskId),
      });
    });
    this.taskCancelStates.forEach((st, taskId) => {
      if (!st) return;
      jobs.push({
        id: `cancel-${taskId}`, kind: "taskCancel", taskId,
        titulo: this.taskMeta.get(taskId) ?? `Tarefa #${taskId}`,
        descricao: "Cancelamento geral",
        remaining: st.status === "countdown" ? st.remaining : null,
        progress: null,
        cancel: () => this.abortTaskCancel(taskId),
      });
    });
    this.customMsgStates.forEach((st, taskId) => {
      if (!st) return;
      jobs.push({
        id: `custommsg-${taskId}`, kind: "customMsg", taskId,
        titulo: this.taskMeta.get(taskId) ?? `Tarefa #${taskId}`,
        descricao: "Mensagem personalizada",
        remaining: st.status === "countdown" ? st.remaining : null,
        progress: st.status === "sending" ? { sent: st.sent, total: st.total } : null,
        cancel: () => this.abortCustomMsg(taskId),
      });
    });
    this.chapaJobStates.forEach((st, chapaId) => {
      if (!st) return;
      const meta = this.chapaMeta.get(chapaId);
      jobs.push({
        id: `chapa-${chapaId}`,
        kind: st.action === "cancel" ? "chapaCancel" : "chapaFup",
        taskId: meta?.taskId ?? 0,
        titulo: meta?.empresa ?? "Tarefa",
        descricao: `${st.action === "cancel" ? "Cancelamento" : "FUP"} — ${meta?.nome ?? "chapa"}`,
        remaining: st.status === "countdown" ? st.remaining : null,
        progress: null,
        cancel: () => this.abortChapaJob(chapaId),
      });
    });
    return jobs;
  }

  // ---- Mensagem personalizada (texto livre p/ confirmados) ----

  getCustomMsgState(taskId: number): CustomMsgState {
    return this.customMsgStates.get(taskId) ?? null;
  }

  subscribeCustomMsg(taskId: number, cb: Sub<CustomMsgState>): () => void {
    let set = this.customMsgSubs.get(taskId);
    if (!set) { set = new Set(); this.customMsgSubs.set(taskId, set); }
    set.add(cb);
    return () => { set!.delete(cb); };
  }

  private notifyCustomMsg(taskId: number) {
    const state = this.customMsgStates.get(taskId) ?? null;
    this.customMsgSubs.get(taskId)?.forEach((cb) => cb(state));
    this.notifyAnyJob();
  }

  startCustomMsg(taskId: number, chapas: ChapaSnap[], message: string, empresa?: string) {
    if (empresa) this.taskMeta.set(taskId, empresa);
    this._clearCustomMsgTimers(taskId);
    this.customMsgAborts.set(taskId, false);
    this.customMsgStates.set(taskId, { status: "countdown", remaining: 30 });
    this.notifyCustomMsg(taskId);

    const interval = setInterval(() => {
      const cur = this.customMsgStates.get(taskId);
      if (!cur || cur.status !== "countdown") { clearInterval(interval); return; }
      this.customMsgStates.set(taskId, { status: "countdown", remaining: Math.max(0, cur.remaining - 1) });
      this.notifyCustomMsg(taskId);
    }, 1000);
    this.customMsgIntervals.set(taskId, interval);

    const timer = setTimeout(() => {
      clearInterval(interval);
      this.customMsgIntervals.delete(taskId);
      this.customMsgTimers.delete(taskId);
      this._executeCustomMsg(taskId, chapas, message);
    }, 30_000);
    this.customMsgTimers.set(taskId, timer);
  }

  abortCustomMsg(taskId: number) {
    const cur = this.customMsgStates.get(taskId);
    if (!cur) return;
    if (cur.status === "countdown") {
      this._clearCustomMsgTimers(taskId);
      this.customMsgStates.delete(taskId);
      this.notifyCustomMsg(taskId);
      toast.info("Disparo de mensagem cancelado.");
    } else {
      this.customMsgAborts.set(taskId, true);
    }
  }

  private _clearCustomMsgTimers(taskId: number) {
    const iv = this.customMsgIntervals.get(taskId);
    if (iv !== undefined) { clearInterval(iv); this.customMsgIntervals.delete(taskId); }
    const t = this.customMsgTimers.get(taskId);
    if (t !== undefined) { clearTimeout(t); this.customMsgTimers.delete(taskId); }
  }

  private async _executeCustomMsg(taskId: number, chapas: ChapaSnap[], message: string) {
    const { umblerSettings, operadorNome } = readSettings();
    this.customMsgStates.set(taskId, { status: "sending", sent: 0, total: chapas.length });
    this.notifyCustomMsg(taskId);

    let sent = 0;
    let failed = 0;
    const sentIds: string[] = [];

    for (let i = 0; i < chapas.length; i++) {
      if (this.customMsgAborts.get(taskId)) break;
      if (i > 0) {
        for (let w = 0; w < 7; w++) {
          if (this.customMsgAborts.get(taskId)) break;
          await new Promise<void>((r) => setTimeout(r, 1000));
        }
        if (this.customMsgAborts.get(taskId)) break;
      }
      const chapa = chapas[i];
      try {
        await sendUmblerFreeText({
          chapaTelefone: chapa.telefone_chapa!,
          message,
          settings: umblerSettings,
        });
        sent++;
        sentIds.push(chapa.id);
      } catch (e) {
        failed++;
        toast.error(`${chapa.nome_chapa ?? "Chapa"}: ${humanizarErroUmbler(e)}`);
      }
      this.customMsgStates.set(taskId, { status: "sending", sent, total: chapas.length });
      this.notifyCustomMsg(taskId);
    }

    const aborted = !!this.customMsgAborts.get(taskId);
    this.customMsgStates.delete(taskId);
    this.customMsgAborts.delete(taskId);

    try {
      if (sent > 0) {
        const db = await getDb();
        const now = new Date().toISOString();
        const operador = operadorNome ? ` · ${operadorNome}` : "";
        const preview = message.length > 80 ? `${message.slice(0, 80)}…` : message;
        for (const id of sentIds) {
          await db.execute(
            "INSERT INTO fup_log (id, id_tarefa, canal, data_disparo, observacao, chapa_id) VALUES (?, ?, ?, ?, ?, ?)",
            [uuid(), taskId, "umbler_custom", now, `"${preview}"${operador}`, id],
          );
        }
      }
    } catch { /* mensagem já enviada — ignora erro de log */ }

    this.notifyCustomMsg(taskId);
    window.dispatchEvent(new CustomEvent("fup:refresh"));

    if (aborted) {
      toast.info(`Envio cancelado — ${sent} mensagem(ns) enviada(s) antes do cancelamento.`);
    } else if (failed > 0) {
      toast.warning(`${sent} enviada(s), ${failed} falha(s).`);
    } else if (sent > 0) {
      toast.success(`Mensagem enviada para ${sent} chapa(s) confirmado(s)`);
    }
  }

  // ---- Auto FUP (agendado — chapas avaliados no momento do disparo) ----

  async startAutoFup(task: TaskSnap) {
    if (this.massFupStates.has(task.id_tarefa)) return;
    try {
      const db = await getDb();
      const chapas = await db.select<ChapaSnap[]>(
        `SELECT id, nome_chapa, telefone_chapa, status_contato FROM chapas
         WHERE id_tarefa = ?
           AND status_contato NOT IN ('confirmado', 'removido')
           AND telefone_chapa IS NOT NULL AND telefone_chapa != ''`,
        [task.id_tarefa],
      );
      if (chapas.length === 0) {
        toast.info(`FUP automático — nenhum chapa pendente em ${task.empresa}`);
        return;
      }
      this.startMassFup(task.id_tarefa, chapas, task);
    } catch (e) {
      toast.error(`FUP automático: ${errMsg(e)}`);
    }
  }

  // ---- Mass FUP ----

  startMassFup(taskId: number, chapas: ChapaSnap[], task: TaskSnap) {
    this.taskMeta.set(taskId, task.empresa);
    this._clearMassFupTimers(taskId);
    this.massFupAborts.set(taskId, false);
    this.massFupStates.set(taskId, { status: "countdown", remaining: 180 });
    this.notifyMassFup(taskId);

    const interval = setInterval(() => {
      const cur = this.massFupStates.get(taskId);
      if (!cur || cur.status !== "countdown") { clearInterval(interval); return; }
      const next = Math.max(0, cur.remaining - 1);
      this.massFupStates.set(taskId, { status: "countdown", remaining: next });
      this.notifyMassFup(taskId);
    }, 1000);
    this.massFupIntervals.set(taskId, interval);

    const timer = setTimeout(() => {
      clearInterval(interval);
      this.massFupIntervals.delete(taskId);
      this.massFupTimers.delete(taskId);
      this._executeMassFup(taskId, chapas, task);
    }, 180_000);
    this.massFupTimers.set(taskId, timer);
  }

  abortMassFup(taskId: number) {
    const cur = this.massFupStates.get(taskId);
    if (!cur) return;
    if (cur.status === "countdown") {
      this._clearMassFupTimers(taskId);
      this.massFupStates.delete(taskId);
      this.notifyMassFup(taskId);
    } else {
      this.massFupAborts.set(taskId, true);
    }
  }

  private _clearMassFupTimers(taskId: number) {
    const iv = this.massFupIntervals.get(taskId);
    if (iv !== undefined) { clearInterval(iv); this.massFupIntervals.delete(taskId); }
    const t = this.massFupTimers.get(taskId);
    if (t !== undefined) { clearTimeout(t); this.massFupTimers.delete(taskId); }
  }

  private async _executeMassFup(taskId: number, chapas: ChapaSnap[], task: TaskSnap) {
    const { umblerSettings, operadorNome } = readSettings();
    if (!umblerSettings.fupBotId || !umblerSettings.fupBotTriggerName) {
      toast.error("Configure o Bot ID e Trigger Name do FUP em Integrações.");
      this.massFupStates.delete(taskId);
      this.massFupAborts.delete(taskId);
      this.notifyMassFup(taskId);
      return;
    }

    const taskDateStr = fmtSP(task.data_tarefa, "yyyy-MM-dd");
    const isD1 = taskDateStr > todayDateISO_SP() && !!(umblerSettings.fupBotD1Id && umblerSettings.fupBotD1TriggerName);
    const botId = isD1 ? umblerSettings.fupBotD1Id : umblerSettings.fupBotId;
    const triggerName = isD1 ? umblerSettings.fupBotD1TriggerName : umblerSettings.fupBotTriggerName;
    const fupInitialData = {
      Data: fmtTaskDateParam(task.data_tarefa),
      Cidade: task.empresa,
    };

    this.massFupStates.set(taskId, { status: "sending", progress: { phase: "sending", sent: 0, total: chapas.length } });
    this.notifyMassFup(taskId);

    let sent = 0;
    const sentIds: string[] = [];
    const firstPassFailed: ChapaSnap[] = [];

    for (let i = 0; i < chapas.length; i++) {
      if (this.massFupAborts.get(taskId)) break;
      if (i > 0) {
        for (let w = 0; w < 10; w++) {
          if (this.massFupAborts.get(taskId)) break;
          await new Promise<void>((r) => setTimeout(r, 1000));
        }
        if (this.massFupAborts.get(taskId)) break;
      }
      const chapa = chapas[i];
      try {
        await startUmblerBot({
          chapaTelefone: chapa.telefone_chapa!,
          settings: umblerSettings,
          initialData: fupInitialData,
          botIdOverride: botId,
          triggerNameOverride: triggerName,
        });
        sent++;
        sentIds.push(chapa.id);
      } catch {
        firstPassFailed.push(chapa);
      }
      this.massFupStates.set(taskId, { status: "sending", progress: { phase: "sending", sent, total: chapas.length } });
      this.notifyMassFup(taskId);
    }

    let permanentFailed = 0;
    if (firstPassFailed.length > 0 && !this.massFupAborts.get(taskId)) {
      for (let cd = 10; cd > 0; cd--) {
        if (this.massFupAborts.get(taskId)) break;
        this.massFupStates.set(taskId, { status: "sending", progress: { phase: "retry-wait", countdown: cd, retryTotal: firstPassFailed.length, firstSent: sent } });
        this.notifyMassFup(taskId);
        await new Promise<void>((r) => setTimeout(r, 1000));
      }
      if (!this.massFupAborts.get(taskId)) {
        this.massFupStates.set(taskId, { status: "sending", progress: { phase: "retrying", retrySent: 0, retryTotal: firstPassFailed.length, firstSent: sent } });
        this.notifyMassFup(taskId);
        for (let i = 0; i < firstPassFailed.length; i++) {
          if (this.massFupAborts.get(taskId)) break;
          if (i > 0) {
            for (let w = 0; w < 10; w++) {
              if (this.massFupAborts.get(taskId)) break;
              await new Promise<void>((r) => setTimeout(r, 1000));
            }
            if (this.massFupAborts.get(taskId)) break;
          }
          const chapa = firstPassFailed[i];
          try {
            await startUmblerBot({
              chapaTelefone: chapa.telefone_chapa!,
              settings: umblerSettings,
              initialData: fupInitialData,
              botIdOverride: botId,
              triggerNameOverride: triggerName,
            });
            sent++;
            sentIds.push(chapa.id);
          } catch {
            permanentFailed++;
          }
          this.massFupStates.set(taskId, { status: "sending", progress: { phase: "retrying", retrySent: i + 1, retryTotal: firstPassFailed.length, firstSent: sent } });
          this.notifyMassFup(taskId);
        }
      } else {
        permanentFailed = firstPassFailed.length;
      }
    }

    const aborted = !!this.massFupAborts.get(taskId);
    this.massFupStates.delete(taskId);
    this.massFupAborts.delete(taskId);

    try {
      const db = await getDb();
      const now = new Date().toISOString();
      for (const id of sentIds) {
        await db.execute("UPDATE chapas SET canal_contato = ?, data_contato = ? WHERE id = ?", ["umbler_talk", now, id]);
      }
      if (sent > 0) {
        const operador = operadorNome ? ` · ${operadorNome}` : "";
        const retryNote = firstPassFailed.length > 0 && !aborted ? ` · ${firstPassFailed.length - permanentFailed} via reenvio` : "";
        await db.execute(
          "INSERT INTO fup_log (id, id_tarefa, canal, data_disparo, observacao) VALUES (?, ?, ?, ?, ?)",
          [uuid(), taskId, "umbler_talk", now, `FUP em massa — ${sent} enviado(s)${retryNote}${aborted ? " (cancelado)" : ""}${operador}`],
        );
        try { localStorage.setItem(`umbler_fup_all_${taskId}`, "1"); } catch { /* noop */ }
      }
    } catch { /* message already sent — ignore DB errors */ }

    this.notifyMassFup(taskId);
    window.dispatchEvent(new CustomEvent("fup:refresh"));

    if (aborted) {
      toast.info(`FUP cancelado — ${sent} enviado(s) antes do cancelamento.`);
    } else if (permanentFailed > 0) {
      toast.warning(`${sent} enviado(s). ${permanentFailed} falha(s) definitiva(s) após reenvio.`);
    } else if (sent > 0) {
      const extra = firstPassFailed.length > 0 ? ` (${firstPassFailed.length} via reenvio)` : "";
      toast.success(`FUP em massa enviado para ${sent} chapa(s)${extra}`);
    }
  }

  // ---- Task Cancel ----

  startTaskCancel(taskId: number, chapas: ChapaSnap[], task: TaskSnap) {
    this.taskMeta.set(taskId, task.empresa);
    this._clearTaskCancelTimers(taskId);
    this.taskCancelStates.set(taskId, { status: "countdown", remaining: 60 });
    this.notifyTaskCancel(taskId);

    const interval = setInterval(() => {
      const cur = this.taskCancelStates.get(taskId);
      if (!cur) { clearInterval(interval); return; }
      const next = Math.max(0, cur.remaining - 1);
      this.taskCancelStates.set(taskId, { status: "countdown", remaining: next });
      this.notifyTaskCancel(taskId);
    }, 1000);
    this.taskCancelIntervals.set(taskId, interval);

    const timer = setTimeout(() => {
      clearInterval(interval);
      this.taskCancelIntervals.delete(taskId);
      this.taskCancelTimers.delete(taskId);
      this._executeTaskCancel(taskId, chapas, task);
    }, 60_000);
    this.taskCancelTimers.set(taskId, timer);
  }

  abortTaskCancel(taskId: number) {
    this._clearTaskCancelTimers(taskId);
    this.taskCancelStates.delete(taskId);
    this.notifyTaskCancel(taskId);
  }

  private _clearTaskCancelTimers(taskId: number) {
    const iv = this.taskCancelIntervals.get(taskId);
    if (iv !== undefined) { clearInterval(iv); this.taskCancelIntervals.delete(taskId); }
    const t = this.taskCancelTimers.get(taskId);
    if (t !== undefined) { clearTimeout(t); this.taskCancelTimers.delete(taskId); }
  }

  private async _executeTaskCancel(taskId: number, chapas: ChapaSnap[], task: TaskSnap) {
    const { umblerSettings } = readSettings();
    const param1 = String(taskId);
    const param2 = fmtTaskDateParam(task.data_tarefa);
    let sent = 0;
    let failed = 0;
    for (const chapa of chapas) {
      try {
        await sendUmblerFup({
          chapaNome: chapa.nome_chapa!,
          chapaTelefone: chapa.telefone_chapa!,
          dataTarefa: task.data_tarefa,
          empresa: task.empresa,
          settings: umblerSettings,
          templateIdOverride: umblerSettings.taskCancelTemplateId,
          overrideParams: [param1, param2],
        });
        sent++;
      } catch {
        failed++;
      }
    }
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO fup_log (id, id_tarefa, canal, data_disparo, observacao) VALUES (?, ?, ?, ?, ?)",
        [uuid(), taskId, "umbler_cancelamento_geral", new Date().toISOString(), `Cancelamento geral — ${sent} enviado(s)`],
      );
    } catch { /* noop */ }
    try { localStorage.setItem(`umbler_task_cancel_${taskId}`, "1"); } catch { /* noop */ }
    this.taskCancelStates.delete(taskId);
    this.notifyTaskCancel(taskId);
    window.dispatchEvent(new CustomEvent("fup:refresh"));
    if (failed > 0) {
      toast.warning(`Cancelamento enviado para ${sent} chapa(s). ${failed} falha(s).`);
    } else {
      toast.success(`Cancelamento geral enviado para ${sent} chapa(s)`);
    }
  }

  // ---- Individual Chapa ----

  startChapaJob(chapaId: string, action: "fup" | "cancel", chapa: ChapaSnap, task: TaskSnap) {
    this.chapaMeta.set(chapaId, { nome: chapa.nome_chapa ?? "chapa", taskId: task.id_tarefa, empresa: task.empresa });
    this._clearChapaTimers(chapaId);
    this.chapaJobStates.set(chapaId, { status: "countdown", remaining: 60, action });
    this.notifyChapaJob(chapaId);

    const interval = setInterval(() => {
      const cur = this.chapaJobStates.get(chapaId);
      if (!cur) { clearInterval(interval); return; }
      const next = Math.max(0, cur.remaining - 1);
      this.chapaJobStates.set(chapaId, { ...cur, remaining: next });
      this.notifyChapaJob(chapaId);
    }, 1000);
    this.chapaIntervals.set(chapaId, interval);

    const timer = setTimeout(() => {
      clearInterval(interval);
      this.chapaIntervals.delete(chapaId);
      this.chapaTimers.delete(chapaId);
      if (action === "fup") {
        this._executeChapaFup(chapaId, chapa, task);
      } else {
        this._executeChapaCancel(chapaId, chapa, task);
      }
    }, 60_000);
    this.chapaTimers.set(chapaId, timer);
  }

  abortChapaJob(chapaId: string) {
    this._clearChapaTimers(chapaId);
    this.chapaJobStates.delete(chapaId);
    this.notifyChapaJob(chapaId);
  }

  private _clearChapaTimers(chapaId: string) {
    const iv = this.chapaIntervals.get(chapaId);
    if (iv !== undefined) { clearInterval(iv); this.chapaIntervals.delete(chapaId); }
    const t = this.chapaTimers.get(chapaId);
    if (t !== undefined) { clearTimeout(t); this.chapaTimers.delete(chapaId); }
  }

  private async _executeChapaFup(chapaId: string, chapa: ChapaSnap, task: TaskSnap) {
    const { umblerSettings } = readSettings();
    if (!umblerSettings.fupBotId || !umblerSettings.fupBotTriggerName) {
      toast.error("Configure o Bot ID e Trigger Name do FUP em Integrações.");
      this.chapaJobStates.delete(chapaId);
      this.notifyChapaJob(chapaId);
      window.dispatchEvent(new CustomEvent("fup:refresh"));
      return;
    }
    const taskDateStr = fmtSP(task.data_tarefa, "yyyy-MM-dd");
    const isD1 = taskDateStr > todayDateISO_SP() && !!(umblerSettings.fupBotD1Id && umblerSettings.fupBotD1TriggerName);
    try {
      await startUmblerBot({
        chapaTelefone: chapa.telefone_chapa!,
        settings: umblerSettings,
        initialData: {
          Data: fmtTaskDateParam(task.data_tarefa),
          Cidade: task.empresa,
        },
        botIdOverride: isD1 ? umblerSettings.fupBotD1Id : umblerSettings.fupBotId,
        triggerNameOverride: isD1 ? umblerSettings.fupBotD1TriggerName : umblerSettings.fupBotTriggerName,
      });
    } catch (e) {
      toast.error(humanizarErroUmbler(e));
      this.chapaJobStates.delete(chapaId);
      this.notifyChapaJob(chapaId);
      window.dispatchEvent(new CustomEvent("fup:refresh"));
      return;
    }
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      await db.execute("UPDATE chapas SET canal_contato = ?, data_contato = ? WHERE id = ?", ["umbler_talk", now, chapaId]);
      await db.execute(
        "INSERT INTO fup_log (id, id_tarefa, canal, data_disparo, observacao, chapa_id) VALUES (?, ?, ?, ?, ?, ?)",
        [uuid(), task.id_tarefa, "umbler_talk", now, "Disparado via API", chapaId],
      );
    } catch { /* noop — message already sent */ }
    toast.success(`Mensagem enviada para ${chapa.nome_chapa}`);
    this.chapaJobStates.delete(chapaId);
    this.notifyChapaJob(chapaId);
    window.dispatchEvent(new CustomEvent("fup:refresh"));
  }

  private async _executeChapaCancel(chapaId: string, chapa: ChapaSnap, task: TaskSnap) {
    const { umblerSettings } = readSettings();
    try {
      await sendUmblerFup({
        chapaNome: chapa.nome_chapa!,
        chapaTelefone: chapa.telefone_chapa!,
        dataTarefa: task.data_tarefa,
        empresa: task.empresa,
        settings: umblerSettings,
        templateIdOverride: umblerSettings.cancelTemplateId,
        overrideParams: [],
      });
    } catch (e) {
      toast.error(`Falha ao enviar cancelamento: ${String(e)}`);
      this.chapaJobStates.delete(chapaId);
      this.notifyChapaJob(chapaId);
      window.dispatchEvent(new CustomEvent("fup:refresh"));
      return;
    }
    try {
      const db = await getDb();
      await db.execute(
        "INSERT INTO fup_log (id, id_tarefa, canal, data_disparo, observacao, chapa_id) VALUES (?, ?, ?, ?, ?, ?)",
        [uuid(), task.id_tarefa, "umbler_cancelamento", new Date().toISOString(), `Sem resposta — ${chapa.nome_chapa}`, chapaId],
      );
    } catch { /* noop */ }
    try { localStorage.setItem(`umbler_cancel_${chapaId}`, "1"); } catch { /* noop */ }
    toast.success(`Cancelamento enviado para ${chapa.nome_chapa}`);
    this.chapaJobStates.delete(chapaId);
    this.notifyChapaJob(chapaId);
    window.dispatchEvent(new CustomEvent("fup:refresh"));
  }
}

export const dispatchQueue = new DispatchQueue();

/* ── BID Batch types ──────────────────────────────────────────────── */

export type BidBatchState = {
  progress: { current: number; total: number };
  waitSeconds: number | null;
} | null;

export type BidBatchCandidate = { id: string; nome: string; telefone: string };

export type BidBatchParams = {
  local: string;
  mapsLink: string;
  sendMapsAsLocal: boolean;
  atividades: string;
  diaria: string;
  dataParam?: string;
};

export type BidBatchJob = {
  taskId: number;
  empresa: string;
  dataTarefa: string;
  candidates: BidBatchCandidate[];
  params: BidBatchParams;
};

export type BidDispatchRecord = {
  id: string;
  id_tarefa: number;
  chapa_nome: string;
  chapa_telefone: string;
  empresa: string;
  data_tarefa: string;
  params_json: string;
  data_disparo: string;
  status: string;
};

class BidDispatchQueue {
  private batchStates = new Map<number, NonNullable<BidBatchState>>();
  private batchAborts = new Map<number, boolean>();
  private batchSubs = new Map<number, Set<(s: BidBatchState) => void>>();
  private dispatchedSubs = new Set<(r: BidDispatchRecord) => void>();
  private anyBatchSubs = new Set<() => void>();

  getBatchState(taskId: number): BidBatchState {
    return this.batchStates.get(taskId) ?? null;
  }

  subscribeBatch(taskId: number, cb: (s: BidBatchState) => void): () => void {
    if (!this.batchSubs.has(taskId)) this.batchSubs.set(taskId, new Set());
    this.batchSubs.get(taskId)!.add(cb);
    cb(this.batchStates.get(taskId) ?? null);
    return () => this.batchSubs.get(taskId)?.delete(cb);
  }

  subscribeDispatched(cb: (r: BidDispatchRecord) => void): () => void {
    this.dispatchedSubs.add(cb);
    return () => { this.dispatchedSubs.delete(cb); };
  }

  getActiveBatches(): Map<number, NonNullable<BidBatchState>> {
    return new Map(this.batchStates);
  }

  subscribeAnyBatch(cb: () => void): () => void {
    this.anyBatchSubs.add(cb);
    cb();
    return () => { this.anyBatchSubs.delete(cb); };
  }

  notifyDispatched(record: BidDispatchRecord) {
    this.dispatchedSubs.forEach((cb) => cb(record));
  }

  getActiveBatchList(): { taskId: number; empresa: string; progress: { current: number; total: number }; waitSeconds: number | null }[] {
    const out: { taskId: number; empresa: string; progress: { current: number; total: number }; waitSeconds: number | null }[] = [];
    this.batchStates.forEach((st, taskId) => {
      if (st) out.push({ taskId, empresa: this.batchMeta.get(taskId) ?? `Tarefa #${taskId}`, progress: st.progress, waitSeconds: st.waitSeconds });
    });
    return out;
  }

  private batchMeta = new Map<number, string>();

  startBatch(job: BidBatchJob): boolean {
    if (this.batchAborts.has(job.taskId)) return false;
    this.batchMeta.set(job.taskId, job.empresa);
    this.batchAborts.set(job.taskId, false);
    this.batchStates.set(job.taskId, { progress: { current: 0, total: job.candidates.length }, waitSeconds: null });
    this._notify(job.taskId);
    this._run(job);
    return true;
  }

  abortBatch(taskId: number) {
    this.batchAborts.set(taskId, true);
  }

  private _notify(taskId: number) {
    const state = this.batchStates.get(taskId) ?? null;
    this.batchSubs.get(taskId)?.forEach((cb) => cb(state));
    this.anyBatchSubs.forEach((cb) => cb());
  }

  private _patch(taskId: number, progress: { current: number; total: number }, waitSeconds: number | null) {
    this.batchStates.set(taskId, { progress, waitSeconds });
    this._notify(taskId);
  }

  private async _run(job: BidBatchJob) {
    const { taskId, candidates } = job;
    const { umblerSettings } = readSettings();
    const localParam = job.params.sendMapsAsLocal && job.params.mapsLink
      ? job.params.mapsLink
      : job.params.local;

    let dispatched = 0;

    for (let i = 0; i < candidates.length; i++) {
      if (this.batchAborts.get(taskId)) break;

      this._patch(taskId, { current: i + 1, total: candidates.length }, null);
      const candidate = candidates[i];

      try {
        await startUmblerBot({
          chapaTelefone: candidate.telefone,
          settings: umblerSettings,
          initialData: {
            Data: job.params.dataParam || fmtTaskDateParam(job.dataTarefa),
            Local: localParam,
            Atividades: job.params.atividades,
            "Diária": `R$ ${job.params.diaria}`,
          },
        });
        const id = uuid();
        const now = new Date().toISOString();
        const paramsJson = JSON.stringify({
          data: fmtTaskDateParam(job.dataTarefa),
          local: localParam,
          atividades: job.params.atividades,
          diaria: job.params.diaria,
        });
        const db = await getDb();
        await db.execute(
          "INSERT INTO bid_disparos (id,chapa_nome,chapa_telefone,id_tarefa,empresa,data_tarefa,params_json,data_disparo,status) VALUES (?,?,?,?,?,?,?,?,?)",
          [id, candidate.nome, candidate.telefone, taskId, job.empresa, job.dataTarefa, paramsJson, now, "aguardando"],
        );
        const record: BidDispatchRecord = {
          id, id_tarefa: taskId, chapa_nome: candidate.nome, chapa_telefone: candidate.telefone,
          empresa: job.empresa, data_tarefa: job.dataTarefa, params_json: paramsJson,
          data_disparo: now, status: "aguardando",
        };
        this.dispatchedSubs.forEach((cb) => cb(record));
        toast.success(`BID disparado para ${candidate.nome}`);
        dispatched++;
      } catch (e) {
        toast.error(`${candidate.nome}: ${humanizarErroUmbler(e)}`);
      }

      if (i < candidates.length - 1 && !this.batchAborts.get(taskId)) {
        await new Promise<void>((resolve) => {
          let remaining = 7;
          this._patch(taskId, { current: i + 1, total: candidates.length }, remaining);
          const tick = setInterval(() => {
            remaining--;
            if (remaining <= 0 || this.batchAborts.get(taskId)) {
              clearInterval(tick);
              this._patch(taskId, { current: i + 1, total: candidates.length }, null);
              resolve();
            } else {
              this._patch(taskId, { current: i + 1, total: candidates.length }, remaining);
            }
          }, 1000);
        });
      }
    }

    const aborted = !!this.batchAborts.get(taskId);
    this.batchStates.delete(taskId);
    this.batchAborts.delete(taskId);
    this._notify(taskId);

    if (dispatched > 1) {
      toast.success(
        aborted
          ? `${dispatched} BIDs disparados · lote cancelado`
          : `${candidates.length} BIDs disparados`,
      );
    }
  }
}

export const bidDispatchQueue = new BidDispatchQueue();
