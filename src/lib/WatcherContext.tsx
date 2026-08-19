import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getDb } from "./db";
import { todayDateISO_SP } from "./datetime";
import { useNotificationWatcher, type WatcherActivity } from "./useNotificationWatcher";
import { useFirestoreQueue } from "./useFirestoreQueue";
import { type RespostaEvent } from "./firestoreQueue";
import { useAutoCancelFup } from "./useAutoCancelFup";
import { logActivity, pruneActivityLog } from "./activityLog";
import { getActiveCarteiraNames } from "./carteira";
import { applyCentralStatusLocally, applyChatLinksLocally } from "./central";
import { companyMatches } from "./company";
import { haDisparoParaAmanha, sincronizarMetabase30h } from "./metabaseSync";
import { readSettings } from "./settings";
import { fetchUmblerUnreadChats, last11Digits } from "./umbler";
import type { TaskWithChapas } from "@/components/TaskCard";

/* ─── context ── */

type WatcherCtx = {
  notifLog: WatcherActivity[];
  clearLog: () => void;
  // Mensagens não lidas no Umbler Talk — telefone (últimos 11 dígitos) e
  // chatId (grupo do cliente, mesmo id de cliente_book.umbler_group_chat_id)
  // de chats com totalUnread > 0. MCM-159: alimenta o ponto vermelho
  // didático em TaskCard/TaskDetailPanel/TaskPanorama/TaskTimeline/
  // BIDDashboard, pra avisar de mensagem nova mesmo com a tarefa fechada.
  unreadPhones: Set<string>;
  unreadChatIds: Set<string>;
};

const WatcherContext = createContext<WatcherCtx>({
  notifLog: [],
  clearLog: () => {},
  unreadPhones: new Set(),
  unreadChatIds: new Set(),
});

export function useWatcherLog() {
  return useContext(WatcherContext);
}

/* ─── provider ── */

export function WatcherProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<TaskWithChapas[]>([]);
  const [notifLog, setNotifLog] = useState<WatcherActivity[]>([]);
  const [unreadPhones, setUnreadPhones] = useState<Set<string>>(new Set());
  const [unreadChatIds, setUnreadChatIds] = useState<Set<string>>(new Set());

  // Conjunto de empresas visíveis na carteira (filtro de grupos). Cache em ref para
  // ser lido dentro dos handlers sem stale closure. [] = sem filtro (tudo passa).
  const activeNamesRef = useRef<string[]>([]);
  const refreshActiveNames = useCallback(async () => {
    activeNamesRef.current = await getActiveCarteiraNames();
  }, []);

  // Respostas de empresas fora da carteira filtrada não devem virar notificação.
  const empresaVisivel = useCallback((empresa: string | null | undefined): boolean => {
    const names = activeNamesRef.current;
    if (names.length === 0) return true; // sem filtro ativo
    if (!empresa) return true; // sem empresa identificada → não bloqueia
    return companyMatches(empresa, names);
  }, []);

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

  // Puxa da Central status confirmado/cancelado por OUTRO analista ou pelo
  // bot da Umbler (Camada 3) e espelha localmente — best effort, silencioso
  // se a Central estiver fora do ar (ver applyCentralStatusLocally). Mesmo
  // ciclo puxa também os chat_links gravados por OUTRO analista, pra este
  // MCM local conseguir abrir a conversa de um chapa mesmo sem ter
  // disparado nada ele mesmo (ver applyChatLinksLocally).
  const syncCentral = useCallback(async () => {
    const updated = await applyCentralStatusLocally();
    const chatLinksUpdated = await applyChatLinksLocally();
    if (updated > 0 || chatLinksUpdated > 0) window.dispatchEvent(new CustomEvent("fup:refresh"));
  }, []);

  useEffect(() => {
    pruneActivityLog(); // TTL 30 dias — roda silenciosamente no startup
    refreshActiveNames();
    loadTasks();
    syncCentral();
    const t = setInterval(() => { refreshActiveNames(); loadTasks(); syncCentral(); }, 60_000);
    const onCarteiraChanged = () => refreshActiveNames();
    window.addEventListener("carteira:changed", onCarteiraChanged);
    return () => {
      clearInterval(t);
      window.removeEventListener("carteira:changed", onCarteiraChanged);
    };
  }, [loadTasks, refreshActiveNames, syncCentral]);

  // Sync automática das tarefas de amanhã (Pré-FUP) a cada 10min — pedido
  // explícito do usuário: só liga depois de pelo menos 1 FUP ou BID já
  // disparado pra alguma tarefa de amanhã; fica dormente (não sincroniza
  // nada) se ninguém tocou em tarefa de amanhã ainda. Checa a cada tick —
  // se ligar no meio do dia (primeiro disparo antecipado), começa a
  // sincronizar a partir daquele tick, sem precisar reiniciar o app.
  useEffect(() => {
    const tick = async () => {
      if (await haDisparoParaAmanha()) await sincronizarMetabase30h(true);
    };
    tick();
    const t = setInterval(tick, 10 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Polling de mensagens não lidas no Umbler Talk (MCM-159) — a cada 40s,
  // trivial dentro do limite de 100 req/5s da Umbler. Só roda se a integração
  // estiver configurada; best-effort (fetchUmblerUnreadChats já engole erro
  // de rede/API e devolve [] — não deve gerar toast nem quebrar o watcher).
  useEffect(() => {
    const tick = async () => {
      const { umblerSettings } = readSettings();
      if (!umblerSettings.bearerToken || !umblerSettings.organizationId) return;
      const chats = await fetchUmblerUnreadChats({ settings: umblerSettings });
      setUnreadPhones(new Set(
        chats.map((c) => last11Digits(c.phoneNumber)).filter((d) => d.length > 0),
      ));
      setUnreadChatIds(new Set(
        chats.map((c) => c.chatId).filter((id): id is string => !!id),
      ));
    };
    tick();
    const t = setInterval(tick, 40_000);
    return () => clearInterval(t);
  }, []);

  const handleRefresh = useCallback(() => {
    loadTasks();
    window.dispatchEvent(new CustomEvent("fup:refresh"));
  }, [loadTasks]);

  const handleFlashTask = useCallback((taskId: number) => {
    window.dispatchEvent(new CustomEvent("fup:flash-task", { detail: taskId }));
  }, []);

  const handleActivity = useCallback((entry: WatcherActivity) => {
    // Filtro de carteira: ignora respostas de empresas fora do filtro ativo.
    if (!empresaVisivel(entry.empresa)) return;
    setNotifLog((prev) => [entry, ...prev].slice(0, 50));
    logActivity({
      tipo: entry.action === "confirmado" ? "confirmado" : entry.action === "removido" ? "removido" : "recusou",
      descricao: entry.action === "confirmado" ? "Confirmou FUP" : entry.action === "removido" ? "Removido" : "Recusou FUP",
      chapa_nome: entry.chapa_nome,
      empresa: entry.empresa,
      id_tarefa: entry.task_id,
      timestamp: entry.timestamp,
    });
  }, [empresaVisivel]);

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
    // Filtro de carteira: só notifica/registra respostas de empresas visíveis.
    // O lado de dados (fup:refresh / fup:remove-chapa) NÃO é filtrado — integridade
    // das tarefas não pode depender do filtro de visualização.
    if (empresaVisivel(ev.empresa ?? null)) {
      setNotifLog((prev) => [entry, ...prev].slice(0, 50));
      logActivity({
        tipo: entry.action === "confirmado" ? "confirmado" : "recusou",
        descricao: entry.action === "confirmado" ? "Confirmou via Firebase" : "Recusou via Firebase",
        chapa_nome: ev.chapa_nome,
        empresa: ev.empresa ?? null,
        id_tarefa: ev.id_tarefa ?? null,
        timestamp: Date.now(),
      });
    }
    window.dispatchEvent(new CustomEvent("fup:refresh"));

    // Só sinaliza remoção do FUP quando o evento for FUP e o chapa cancelou.
    // Eventos BID nunca devem acionar remoção do FUP: o chapa BID não está na tabela
    // chapas ainda, e "nao_aceita_app"/"precisa_ajuda" significam interesse (não recusa).
    if (ev.tipo === "fup" && isRecusa && ev.id_tarefa != null) {
      window.dispatchEvent(new CustomEvent("fup:remove-chapa", {
        detail: { taskId: ev.id_tarefa, chapaName: ev.chapa_nome },
      }));
    }
  }, [empresaVisivel]);

  useFirestoreQueue(handleWebhookEvent);
  useAutoCancelFup(handleRefresh);

  const clearLog = useCallback(() => setNotifLog([]), []);

  return (
    <WatcherContext.Provider value={{ notifLog, clearLog, unreadPhones, unreadChatIds }}>
      {children}
    </WatcherContext.Provider>
  );
}
