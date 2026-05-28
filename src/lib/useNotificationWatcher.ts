import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "./db";
import { normalize } from "./normalize";
import { toast } from "sonner";
import type { TaskWithChapas } from "@/components/TaskCard";

interface NotificationMatch {
  chapa_nome: string;
  resposta: "sim" | "nao";
  arrival_time_secs: number;
}

export type WatcherActivity = {
  id: string;
  chapa_nome: string;
  action: "confirmado" | "recusou" | "removido";
  task_id: number | null;
  empresa: string | null;
  data_tarefa: string | null;
  timestamp: number;
};

/**
 * Polls %LOCALAPPDATA%\...\wpndatabase.db every 5 s looking for
 * WhatsApp responses ("SIM, estou nessa!" / "NÃO, quero cancelar!")
 * from chapas that appear in the provided task list.
 *
 * SIM  → confirms the chapa automatically (status_contato = 'confirmado')
 * NÃO  → shows a Sonner toast with an action button to remove the chapa
 *
 * Stays completely dormant if the DB is inaccessible (Chrome notifications
 * disabled or Windows version that locks the DB).
 */
export function useNotificationWatcher(
  allTasks: TaskWithChapas[],
  onRefresh: () => void,
  onFlashTask?: (taskId: number) => void,
  onActivity?: (entry: WatcherActivity) => void,
  onRemoveRequest?: (taskId: number, chapaName: string) => void,
) {
  const lastSeenRef = useRef<number>(Math.floor(Date.now() / 1000) - 120);
  const processedRef = useRef<Set<string>>(new Set());
  const tasksRef = useRef(allTasks);
  const onRefreshRef = useRef(onRefresh);
  const onFlashTaskRef = useRef(onFlashTask);
  const onActivityRef = useRef(onActivity);
  const onRemoveRequestRef = useRef(onRemoveRequest);

  useEffect(() => { tasksRef.current = allTasks; }, [allTasks]);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { onFlashTaskRef.current = onFlashTask; }, [onFlashTask]);
  useEffect(() => { onActivityRef.current = onActivity; }, [onActivity]);
  useEffect(() => { onRemoveRequestRef.current = onRemoveRequest; }, [onRemoveRequest]);

  useEffect(() => {
    const poll = async () => {
      // Step 1: fetch matches from WPN DB — can fail silently (DB locked or inaccessible)
      let matches: NotificationMatch[];
      let chapas: ReturnType<typeof tasksRef.current[0]["chapas"]>;
      try {
        chapas = tasksRef.current
          .flatMap((t) => t.chapas ?? [])
          .filter((c) => c.nome_chapa && c.telefone_chapa && !c.data_remocao);

        if (chapas.length === 0) return;

        const chapaNames = [...new Set(chapas.map((c) => c.nome_chapa!))];

        matches = await invoke<NotificationMatch[]>(
          "check_notification_responses",
          { chapaNames, sinceEpochSecs: lastSeenRef.current },
        );
      } catch {
        return; // Silently dormant — DB locked, inaccessible, or notifications disabled
      }

      // Step 2: process matches — outside the silent catch so toast/DB errors surface
      for (const match of matches) {
        const key = `${match.chapa_nome}:${match.arrival_time_secs}`;
        if (processedRef.current.has(key)) continue;
        processedRef.current.add(key);

        if (match.arrival_time_secs > lastSeenRef.current) {
          lastSeenRef.current = match.arrival_time_secs;
        }

        const found = chapas.find(
          (c) => normalize(c.nome_chapa ?? "") === normalize(match.chapa_nome),
        );
        if (!found) continue;

        const parentTask = tasksRef.current.find((t) =>
          t.chapas.some((c) => c.id === found.id),
        );

        if (match.resposta === "sim") {
          try {
            const db = await getDb();
            await db.execute(
              "UPDATE chapas SET status_contato = 'confirmado', data_contato = ? WHERE id = ?",
              [new Date().toISOString(), found.id],
            );
          } catch {
            // DB update failed — still show the notification so the user can act manually
          }
          onActivityRef.current?.({
            id: key,
            chapa_nome: found.nome_chapa ?? match.chapa_nome,
            action: "confirmado",
            task_id: parentTask?.id_tarefa ?? null,
            empresa: parentTask?.empresa ?? null,
            data_tarefa: parentTask?.data_tarefa ?? null,
            timestamp: Date.now(),
          });
          toast.success(`${found.nome_chapa} confirmado(a)`, {
            description: "Respondeu SIM, tô nessa! via WhatsApp",
          });
          onRefreshRef.current();
        } else {
          const foundSnapshot = found;
          onActivityRef.current?.({
            id: key,
            chapa_nome: found.nome_chapa ?? match.chapa_nome,
            action: "recusou",
            task_id: parentTask?.id_tarefa ?? null,
            empresa: parentTask?.empresa ?? null,
            data_tarefa: parentTask?.data_tarefa ?? null,
            timestamp: Date.now(),
          });
          toast.warning(`${found.nome_chapa} recusou`, {
            description:
              'Respondeu "NÃO, quero cancelar!" via WhatsApp. Clique em Remover para abrir a tarefa.',
            duration: 30_000,
            action: {
              label: "Remover",
              onClick: () => {
                if (parentTask && onRemoveRequestRef.current) {
                  onRemoveRequestRef.current(parentTask.id_tarefa, foundSnapshot.nome_chapa ?? match.chapa_nome);
                }
              },
            },
          });
        }
      }
    };

    const interval = setInterval(poll, 5_000);
    poll();
    return () => clearInterval(interval);
  }, []); // stable — uses refs for live data
}
