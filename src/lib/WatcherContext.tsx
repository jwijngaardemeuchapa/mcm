import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getDb } from "./db";
import { todayDateISO_SP } from "./datetime";
import { useNotificationWatcher, type WatcherActivity } from "./useNotificationWatcher";
import { useFirestoreQueue } from "./useFirestoreQueue";
import { type RespostaEvent } from "./firestoreQueue";
import { useAutoCancelFup } from "./useAutoCancelFup";
import { logActivity, pruneActivityLog } from "./activityLog";
import type { TaskWithChapas } from "@/components/TaskCard";

/* ─── context ── */

type WatcherCtx = {
  notifLog: WatcherActivity[];
  clearLog: () => void;
};

const WatcherContext = createContext<WatcherCtx>({ notifLog: [], clearLog: () => {} });

export function useWatcherLog() {
  return useContext(WatcherContext);
}

/* ─── provider ── */

export function WatcherProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<TaskWithChapas[]>([]);
  const [notifLog, setNotifLog] = useState<WatcherActivity[]>([]);

  const loadTasks = useCallback(async () => {
    try {
      const db = await getDb();
      const todayISO = todayDateISO_SP();
      const yd = new Date(`${todayISO}T00:00:00-03:00`);
      yd.setDate(yd.getDate() - 1);
      const yesterdayISO = yd.toISOString().slice(0, 10);

      type Row = {
        id_tarefa: number;
        data_tarefa: string;
        empresa: string;
        chapa_id: string;
        nome_chapa: string;
        telefone_chapa: string;
        status_contato: string;
        canal_contato: string | null;
      };

      const rows = await db.select<Row[]>(
        `SELECT t.id_tarefa, t.data_tarefa, t.empresa,
                c.id AS chapa_id, c.nome_chapa, c.telefone_chapa, c.status_contato, c.canal_contato
         FROM tarefas t
         JOIN chapas c ON c.id_tarefa = t.id_tarefa
         WHERE t.ativo = 1
           AND t.status_tarefa NOT LIKE 'Cancel%'
           AND t.status_tarefa != 'Finalizado'
           AND (
             date(t.data_tarefa) = ?
             OR (
               date(t.data_tarefa) = ?
               AND t.is_overnight = 1
               AND (t.validacao_status IS NULL OR t.validacao_status != 'subido_meu_chapa')
             )
           )
           AND c.data_remocao IS NULL
           AND c.status_contato != 'removido'
           AND c.nome_chapa IS NOT NULL
           AND c.telefone_chapa IS NOT NULL`,
        [todayISO, yesterdayISO],
      );

      // Group into TaskWithChapas-compatible objects
      const taskMap = new Map<number, TaskWithChapas>();
      for (const row of rows) {
        if (!taskMap.has(row.id_tarefa)) {
          taskMap.set(row.id_tarefa, {
            id_tarefa: row.id_tarefa,
            data_tarefa: row.data_tarefa,
            empresa: row.empresa,
            cidade_uf: null,
            status_tarefa: "",
            quantidade_chapas: 0,
            chapas: [],
            fup_log: [],
            urgent: false,
          });
        }
        taskMap.get(row.id_tarefa)!.chapas.push({
          id: row.chapa_id,
          nome_chapa: row.nome_chapa,
          telefone_chapa: row.telefone_chapa,
          cpf: null,
          status_contato: row.status_contato,
          canal_contato: row.canal_contato,
        });
      }

      setTasks(Array.from(taskMap.values()));
    } catch {
      // silently ignore — watcher stays dormant
    }
  }, []);

  useEffect(() => {
    pruneActivityLog(); // TTL 30 dias — roda silenciosamente no startup
    loadTasks();
    const t = setInterval(loadTasks, 60_000);
    return () => clearInterval(t);
  }, [loadTasks]);

  const handleRefresh = useCallback(() => {
    loadTasks();
    window.dispatchEvent(new CustomEvent("fup:refresh"));
  }, [loadTasks]);

  const handleFlashTask = useCallback((taskId: number) => {
    window.dispatchEvent(new CustomEvent("fup:flash-task", { detail: taskId }));
  }, []);

  const handleActivity = useCallback((entry: WatcherActivity) => {
    setNotifLog((prev) => [entry, ...prev].slice(0, 50));
    logActivity({
      tipo: entry.action === "confirmado" ? "confirmado" : entry.action === "removido" ? "removido" : "recusou",
      descricao: entry.action === "confirmado" ? "Confirmou FUP" : entry.action === "removido" ? "Removido" : "Recusou FUP",
      chapa_nome: entry.chapa_nome,
      empresa: entry.empresa,
      id_tarefa: entry.task_id,
      timestamp: entry.timestamp,
    });
  }, []);

  const handleRemoveRequest = useCallback((taskId: number, chapaName: string) => {
    window.dispatchEvent(new CustomEvent("fup:remove-chapa", { detail: { taskId, chapaName } }));
  }, []);

  useNotificationWatcher(tasks, handleRefresh, handleFlashTask, handleActivity, handleRemoveRequest);

  const handleWebhookEvent = useCallback((ev: RespostaEvent) => {
    const isRecusa = ["cancelado", "interesse_nao", "nao_aceita_app", "precisa_ajuda"].includes(ev.resposta);
    const actionMap: Record<string, WatcherActivity["action"]> = {
      confirmado: "confirmado",
      interesse_sim: "confirmado",
      aceita_app: "confirmado",
      cancelado: "recusou",
      interesse_nao: "recusou",
      nao_aceita_app: "recusou",
      precisa_ajuda: "recusou",
    };
    const entry: WatcherActivity = {
      id: `wh-${Date.now()}`,
      chapa_nome: ev.chapa_nome,
      action: actionMap[ev.resposta] ?? "recusou",
      task_id: ev.id_tarefa ?? null,
      empresa: ev.empresa ?? null,
      data_tarefa: null,
      timestamp: Date.now(),
    };
    setNotifLog((prev) => [entry, ...prev].slice(0, 50));
    logActivity({
      tipo: entry.action === "confirmado" ? "confirmado" : "recusou",
      descricao: entry.action === "confirmado" ? "Confirmou via Firebase" : "Recusou via Firebase",
      chapa_nome: ev.chapa_nome,
      empresa: ev.empresa ?? null,
      id_tarefa: ev.id_tarefa ?? null,
      timestamp: Date.now(),
    });
    window.dispatchEvent(new CustomEvent("fup:refresh"));

    // Só sinaliza remoção do FUP quando o evento for FUP e o chapa cancelou.
    // Eventos BID nunca devem acionar remoção do FUP: o chapa BID não está na tabela
    // chapas ainda, e "nao_aceita_app"/"precisa_ajuda" significam interesse (não recusa).
    if (ev.tipo === "fup" && isRecusa && ev.id_tarefa != null) {
      window.dispatchEvent(new CustomEvent("fup:remove-chapa", {
        detail: { taskId: ev.id_tarefa, chapaName: ev.chapa_nome },
      }));
    }
  }, []);

  useFirestoreQueue(handleWebhookEvent);
  useAutoCancelFup(handleRefresh);

  const clearLog = useCallback(() => setNotifLog([]), []);

  return (
    <WatcherContext.Provider value={{ notifLog, clearLog }}>
      {children}
    </WatcherContext.Provider>
  );
}
