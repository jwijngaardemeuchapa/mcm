import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Send,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Inbox,
  AlertTriangle,
  MessageSquare,
  UserMinus,
  TimerReset,
  type LucideIcon,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { fmtSP, todayDateISO_SP } from "@/lib/datetime";
import { readSettings } from "@/lib/settings";
import { invoke } from "@tauri-apps/api/core";
import { ingestTarefas } from "@/lib/ingestTarefas";
import { sincronizarMetabase30h } from "@/lib/metabaseSync";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

/* ─── types ── */

type PendingRow = {
  id: string;
  nome_chapa: string | null;
  telefone_chapa: string | null;
  data_contato: string | null;
  status_contato: string;
  id_tarefa: number;
  empresa: string;
  data_tarefa: string;
  ultimo_disparo: string | null;
};

type HistoricoRow = {
  id: string;
  id_tarefa: number;
  canal: string;
  data_disparo: string;
  observacao: string | null;
  empresa: string;
  data_tarefa: string;
  nome_chapa: string | null;
};

type TaskGroup = {
  id_tarefa: number;
  empresa: string;
  data_tarefa: string;
  rows: PendingRow[];
};

/* ─── display config ── */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Aguardando", cls: "bg-warning/15 text-warning border-warning/40" },
  nao_respondeu: { label: "Não respondeu", cls: "bg-destructive/15 text-destructive border-destructive/40" },
};

const CANAL_CONFIG: Record<string, { label: string; cls: string; icon: LucideIcon }> = {
  umbler_talk: {
    label: "FUP Confirmação",
    cls: "bg-primary/10 text-primary border-primary/30",
    icon: MessageSquare,
  },
  umbler_cancelamento: {
    label: "Sem Resposta",
    cls: "bg-warning/15 text-warning border-warning/40",
    icon: UserMinus,
  },
  umbler_cancelamento_geral: {
    label: "Cancelamento Geral",
    cls: "bg-destructive/15 text-destructive border-destructive/40",
    icon: XCircle,
  },
};

/* ─── helpers ── */

function elapsedInfo(isoDate: string | null, warnMins: number): { label: string; level: "ok" | "warn" | "critical"; minutes: number } {
  if (!isoDate) return { label: "—", level: "ok", minutes: 0 };
  const minutes = (Date.now() - new Date(isoDate).getTime()) / 60_000;
  if (minutes < 1) return { label: "agora", level: "ok", minutes };
  let label: string;
  if (minutes < 60) {
    label = `há ${Math.round(minutes)} min`;
  } else {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    label = m > 0 ? `há ${h}h ${m}min` : `há ${h}h`;
  }
  const level = minutes >= warnMins * 2 ? "critical" : minutes >= warnMins ? "warn" : "ok";
  return { label, level, minutes };
}

function extractNameFromObs(obs: string | null): string | null {
  if (!obs) return null;
  const m = obs.match(/—\s+(.+)$/);
  return m ? m[1].trim() : null;
}

/* ─── component ── */

export default function DisparosUmbler() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const warnMins = readSettings().umblerNoResponseMinutes;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const todayISO = todayDateISO_SP();

      const [pendingRows, historicoRows] = await Promise.all([
        db.select<PendingRow[]>(
          `SELECT c.id, c.nome_chapa, c.telefone_chapa, c.data_contato, c.status_contato,
                  t.id_tarefa, t.empresa, t.data_tarefa,
                  (SELECT MAX(f.data_disparo) FROM fup_log f
                   WHERE f.chapa_id = c.id AND f.canal LIKE 'umbler%') AS ultimo_disparo
           FROM chapas c
           JOIN tarefas t ON c.id_tarefa = t.id_tarefa
           WHERE c.canal_contato = 'umbler_talk'
             AND c.status_contato NOT IN ('confirmado', 'removido')
             AND c.data_remocao IS NULL
             AND t.ativo = 1
             AND (t.validacao_status IS NULL OR t.validacao_status != 'subido_meu_chapa')
             AND date(t.data_tarefa) >= ?
           ORDER BY t.data_tarefa ASC, c.data_contato DESC`,
          [todayISO],
        ),
        db.select<HistoricoRow[]>(
          `SELECT f.id, f.id_tarefa, f.canal, f.data_disparo, f.observacao,
                  t.empresa, t.data_tarefa,
                  ch.nome_chapa
           FROM fup_log f
           JOIN tarefas t ON f.id_tarefa = t.id_tarefa
           LEFT JOIN chapas ch ON f.chapa_id = ch.id
           WHERE f.canal LIKE 'umbler%'
             AND (t.validacao_status IS NULL OR t.validacao_status != 'subido_meu_chapa')
           ORDER BY f.data_disparo DESC
           LIMIT 300`,
        ),
      ]);

      setPending(pendingRows);
      setHistorico(historicoRows);
    } catch (e) {
      toast.error("Erro ao carregar disparos");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const [metaSyncing, setMetaSyncing] = useState(false);
  const [syncing30h, setSyncing30h] = useState(false);

  async function handleSync30h() {
    setSyncing30h(true);
    const ok = await sincronizarMetabase30h(false);
    if (ok) load();
    setSyncing30h(false);
  }

  async function handleSyncMetabase() {
    const s = readSettings();
    const cardId = s.metabaseTarefasCardId;
    if (!cardId) { toast.error("Configure o ID da pergunta do Metabase em Integrações"); return; }
    setMetaSyncing(true);
    try {
      const status = await invoke<{ configured: boolean }>("metabase_status");
      if (!status.configured) { toast.error("Metabase não configurado em Integrações"); return; }
      const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
      const result = await ingestTarefas(rows);
      localStorage.setItem("metabase_last_sync", new Date().toISOString());
      toast.success(`Sync concluído — ${result.tarefas} tarefas, ${result.chapas} chapas`);
      load();
    } catch {
      toast.error("Erro ao sincronizar com Metabase");
    } finally {
      setMetaSyncing(false);
    }
  }

  /* ── pending: group by task, sorted by data_tarefa ── */
  const taskGroups = useMemo((): TaskGroup[] => {
    const map = new Map<number, TaskGroup>();
    for (const row of pending) {
      if (!map.has(row.id_tarefa)) {
        map.set(row.id_tarefa, {
          id_tarefa: row.id_tarefa,
          empresa: row.empresa,
          data_tarefa: row.data_tarefa,
          rows: [],
        });
      }
      map.get(row.id_tarefa)!.rows.push(row);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.data_tarefa).getTime() - new Date(b.data_tarefa).getTime(),
    );
  }, [pending]);

  const pendingStats = useMemo(() => {
    const semRespostaWarn = pending.filter((r) => {
      const ref = r.ultimo_disparo ?? r.data_contato;
      if (!ref) return false;
      return (Date.now() - new Date(ref).getTime()) / 60_000 >= warnMins;
    }).length;
    return {
      total: pending.length,
      naoRespondeu: pending.filter((r) => r.status_contato === "nao_respondeu").length,
      semRespostaWarn,
    };
  }, [pending, warnMins]);

  /* ── historico: group by date ── */
  const { historicoGroups, todayStats } = useMemo(() => {
    const todayISO = todayDateISO_SP();
    const yd = new Date(`${todayISO}T00:00:00-03:00`);
    yd.setDate(yd.getDate() - 1);
    const yesterdayISO = yd.toISOString().slice(0, 10);

    type Group = { label: string; rows: HistoricoRow[] };
    const groups: Group[] = [
      { label: "Hoje", rows: [] },
      { label: "Ontem", rows: [] },
      { label: "Anteriores", rows: [] },
    ];

    for (const row of historico) {
      const d = fmtSP(row.data_disparo, "yyyy-MM-dd");
      if (d === todayISO) groups[0].rows.push(row);
      else if (d === yesterdayISO) groups[1].rows.push(row);
      else groups[2].rows.push(row);
    }

    const today = groups[0].rows;
    return {
      historicoGroups: groups.filter((g) => g.rows.length > 0),
      todayStats: {
        confirmacao: today.filter((r) => r.canal === "umbler_talk").length,
        semResposta: today.filter((r) => r.canal === "umbler_cancelamento").length,
        cancelamento: today.filter((r) => r.canal === "umbler_cancelamento_geral").length,
      },
    };
  }, [historico]);

  const hasTodayStats =
    todayStats.confirmacao + todayStats.semResposta + todayStats.cancelamento > 0;

  function goToTask(taskId: number) {
    navigate(`/dashboard?flash=${taskId}`);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Disparos Umbler</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSyncMetabase} disabled={metaSyncing || loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${metaSyncing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSync30h} disabled={syncing30h}>
            <RefreshCw className={`h-3.5 w-3.5 ${syncing30h ? "animate-spin" : ""}`} />
            Sync amanhã
          </Button>
        </div>
      </div>

      <Tabs defaultValue="pendentes">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="pendentes" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Aguardando Resposta
            {pending.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5">
            <Inbox className="h-3.5 w-3.5" />
            Histórico de Disparos
            {historico.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                {historico.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Aguardando Resposta ── */}
        <TabsContent value="pendentes" className="mt-4">
          {pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <CheckCircle2 className="h-8 w-8 text-success/60" />
              <p className="text-sm font-medium">Sem disparos aguardando resposta</p>
              <p className="text-xs">
                Todos os chapas contactados via Umbler já responderam ou foram removidos.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary strip */}
              <div className="flex items-center gap-4 px-1 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{pendingStats.total}</span> chapa
                  {pendingStats.total !== 1 ? "s" : ""} em{" "}
                  <span className="font-semibold text-foreground">{taskGroups.length}</span> tarefa
                  {taskGroups.length !== 1 ? "s" : ""}
                </span>
                {pendingStats.semRespostaWarn > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full border border-warning/20">
                    <TimerReset className="h-3.5 w-3.5" />
                    {pendingStats.semRespostaWarn} sem resposta &gt;{warnMins}min
                  </span>
                )}
                {pendingStats.naoRespondeu > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {pendingStats.naoRespondeu} marcado como não respondeu
                  </span>
                )}
              </div>

              {/* Task cards */}
              {taskGroups.map((group) => {
                const maxAge = Math.max(
                  ...group.rows.map((r) => {
                    const ref = r.ultimo_disparo ?? r.data_contato;
                    return ref ? (Date.now() - new Date(ref).getTime()) / 60_000 : 0;
                  }),
                );
                const hasCritical = maxAge >= warnMins * 2;
                const hasWarn = !hasCritical && maxAge >= warnMins;

                return (
                  <div
                    key={group.id_tarefa}
                    className={`bg-card border rounded-xl overflow-hidden shadow-card ${
                      hasCritical
                        ? "border-destructive/40 ring-1 ring-destructive/20"
                        : hasWarn
                        ? "border-warning/40 ring-1 ring-warning/20"
                        : "border-border"
                    }`}
                  >
                    {/* Card header */}
                    <div
                      className={`px-4 py-2.5 flex items-center justify-between border-b ${
                        hasCritical
                          ? "bg-destructive/5 border-destructive/20"
                          : hasWarn
                          ? "bg-warning/5 border-warning/20"
                          : "bg-muted/30 border-border"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {(hasCritical || hasWarn) && (
                          <AlertTriangle
                            className={`h-3.5 w-3.5 shrink-0 ${hasCritical ? "text-destructive" : "text-warning"}`}
                          />
                        )}
                        <span className="font-semibold text-sm capitalize truncate">
                          {group.empresa.toLowerCase()}
                        </span>
                        <span className="text-muted-foreground text-xs shrink-0">·</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {fmtSP(group.data_tarefa, "dd/MM HH:mm")}
                        </span>
                        <span className="text-muted-foreground text-xs shrink-0">·</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          #{group.id_tarefa}
                        </span>
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] shrink-0">
                          {group.rows.length} pendente{group.rows.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 shrink-0 ml-2"
                        onClick={() => goToTask(group.id_tarefa)}
                      >
                        <Eye className="h-3 w-3" />
                        Ver tarefa
                      </Button>
                    </div>

                    {/* Chapa rows */}
                    <div className="divide-y divide-border">
                      {group.rows.map((row) => {
                        const dispatchRef = row.ultimo_disparo ?? row.data_contato;
                        const elapsed = elapsedInfo(dispatchRef, warnMins);
                        const statusMeta = STATUS_META[row.status_contato] ?? {
                          label: row.status_contato,
                          cls: "bg-muted/40 text-muted-foreground border-border",
                        };

                        return (
                          <div
                            key={row.id}
                            className={`px-4 py-2.5 flex items-center gap-3 ${
                              elapsed.level === "critical"
                                ? "bg-destructive/5"
                                : elapsed.level === "warn"
                                ? "bg-warning/5"
                                : ""
                            }`}
                          >
                            {/* Identity */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium capitalize truncate">
                                {row.nome_chapa?.toLowerCase() ?? "—"}
                              </div>
                              {row.telefone_chapa && (
                                <div className="text-xs text-muted-foreground font-mono">
                                  {row.telefone_chapa}
                                </div>
                              )}
                            </div>

                            {/* No-response warning badge (30min+) */}
                            {elapsed.level !== "ok" && (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                  elapsed.level === "critical"
                                    ? "bg-destructive/15 text-destructive border-destructive/40"
                                    : "bg-warning/15 text-warning border-warning/40"
                                }`}
                              >
                                <TimerReset className="h-3 w-3" />
                                Sem resposta
                              </span>
                            )}

                            {/* Status */}
                            <span
                              className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${statusMeta.cls}`}
                            >
                              {statusMeta.label}
                            </span>

                            {/* Elapsed — colored by urgency */}
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${
                                elapsed.level === "critical"
                                  ? "text-destructive"
                                  : elapsed.level === "warn"
                                  ? "text-warning"
                                  : "text-muted-foreground"
                              }`}
                            >
                              <Clock className="h-3 w-3 opacity-70" />
                              {elapsed.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Histórico ── */}
        <TabsContent value="historico" className="mt-4 space-y-5">
          {historico.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <XCircle className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">Nenhum disparo registrado</p>
              <p className="text-xs">Os disparos realizados via Umbler aparecerão aqui.</p>
            </div>
          ) : (
            <>
              {/* Today summary */}
              {hasTodayStats && (
                <div className="flex items-center gap-3 px-1 flex-wrap">
                  <span className="text-xs font-semibold text-muted-foreground">Hoje:</span>
                  {todayStats.confirmacao > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                      <MessageSquare className="h-3 w-3" />
                      {todayStats.confirmacao} FUP{todayStats.confirmacao !== 1 ? "s" : ""}
                    </span>
                  )}
                  {todayStats.semResposta > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full border border-warning/20">
                      <UserMinus className="h-3 w-3" />
                      {todayStats.semResposta} sem resposta
                    </span>
                  )}
                  {todayStats.cancelamento > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full border border-destructive/20">
                      <XCircle className="h-3 w-3" />
                      {todayStats.cancelamento} cancelamento{todayStats.cancelamento !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              )}

              {/* Date-grouped tables */}
              {historicoGroups.map((group) => (
                <div key={group.label} className="space-y-2">
                  {/* Date section header */}
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">
                      {group.rows.length} disparo{group.rows.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="bg-card border border-border rounded-xl overflow-hidden shadow-card">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                            Horário
                          </th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                            Tipo
                          </th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                            Chapa
                          </th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                            Empresa
                          </th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                            Serviço
                          </th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {group.rows.map((row) => {
                          const config = CANAL_CONFIG[row.canal] ?? {
                            label: row.canal,
                            cls: "bg-muted/40 text-muted-foreground border-border",
                            icon: Send,
                          };
                          const Icon = config.icon;
                          const chapaName =
                            row.nome_chapa ?? extractNameFromObs(row.observacao);

                          return (
                            <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
                                {fmtSP(row.data_disparo, "HH:mm")}
                              </td>
                              <td className="px-4 py-2.5">
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${config.cls}`}
                                >
                                  <Icon className="h-3 w-3" />
                                  {config.label}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-xs font-medium capitalize">
                                {chapaName ? (
                                  chapaName.toLowerCase()
                                ) : (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-xs capitalize text-muted-foreground">
                                {row.empresa.toLowerCase()}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                {fmtSP(row.data_tarefa, "dd/MM HH:mm")}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => goToTask(row.id_tarefa)}
                                >
                                  <Eye className="h-3 w-3" />
                                  Ver
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
