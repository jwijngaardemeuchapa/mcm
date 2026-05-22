import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { todayDateISO_SP, fmtSP } from "@/lib/datetime";
import { CalendarDays, FileInput, Moon, Users, Building2, AlertTriangle } from "lucide-react";

type Stats = {
  tasksToday: number;
  totalChapas: number;
  pendingChapas: number;
  overnightCount: number;
};

const STORAGE_KEY = "dash_briefing_date";

export function DailyBriefing() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const todayISO = todayDateISO_SP();
    const last = localStorage.getItem(STORAGE_KEY);
    if (last === todayISO) return;

    const t = setTimeout(async () => {
      try {
        const db = await getDb();
        type CntRow = { cnt: number };
        type ChapasRow = { cnt: number; pending: number };

        const tasks = await db.select<CntRow[]>(
          `SELECT COUNT(*) as cnt FROM tarefas
           WHERE ativo = 1 AND date(data_tarefa) = ?
           AND status_tarefa NOT LIKE 'Cancel%' AND status_tarefa != 'Finalizado'`,
          [todayISO],
        );
        const chapas = await db.select<ChapasRow[]>(
          `SELECT COUNT(*) as cnt,
                  SUM(CASE WHEN c.status_contato NOT IN ('confirmado','removido') THEN 1 ELSE 0 END) as pending
           FROM chapas c
           JOIN tarefas t ON c.id_tarefa = t.id_tarefa
           WHERE t.ativo = 1 AND date(t.data_tarefa) = ?`,
          [todayISO],
        );
        const yesterday = new Date(`${todayISO}T12:00:00-03:00`);
        yesterday.setDate(yesterday.getDate() - 1);
        const yISO = yesterday.toISOString().slice(0, 10);
        const overnight = await db.select<CntRow[]>(
          `SELECT COUNT(*) as cnt FROM tarefas
           WHERE ativo = 1 AND is_overnight = 1 AND date(data_tarefa) = ?`,
          [yISO],
        );

        setStats({
          tasksToday: tasks[0]?.cnt ?? 0,
          totalChapas: chapas[0]?.cnt ?? 0,
          pendingChapas: chapas[0]?.pending ?? 0,
          overnightCount: overnight[0]?.cnt ?? 0,
        });
        setOpen(true);
        localStorage.setItem(STORAGE_KEY, todayISO);
      } catch {
        /* DB may not be ready — silently skip */
      }
    }, 1800);

    return () => clearTimeout(t);
  }, []);

  if (!open || !stats) return null;

  const todayISO = todayDateISO_SP();
  const dayLabel = fmtSP(`${todayISO}T12:00:00-03:00`, "EEEE, dd 'de' MMMM");
  const isMonday = new Date(`${todayISO}T12:00:00-03:00`).getDay() === 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-primary" />
            Bom dia! Resumo do dia
          </DialogTitle>
          <DialogDescription className="capitalize">{dayLabel}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="rounded-xl border border-border bg-card p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold opacity-60">
              <CalendarDays className="h-3 w-3" /> Tarefas hoje
            </div>
            <p className="text-3xl font-display font-bold text-foreground">{stats.tasksToday}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold opacity-60">
              <Users className="h-3 w-3" /> Chapas alocados
            </div>
            <p className="text-3xl font-display font-bold text-foreground">{stats.totalChapas}</p>
          </div>
          <div
            className={`rounded-xl border p-3 space-y-1 ${
              stats.pendingChapas > 0
                ? "border-warning/40 bg-warning/5"
                : "border-success/40 bg-success/5"
            }`}
          >
            <p className="text-[11px] uppercase tracking-wider font-semibold opacity-60 text-muted-foreground">
              Aguard. confirmação
            </p>
            <p
              className={`text-3xl font-display font-bold ${
                stats.pendingChapas > 0 ? "text-warning" : "text-success"
              }`}
            >
              {stats.pendingChapas}
            </p>
          </div>
          <div
            className={`rounded-xl border p-3 space-y-1 ${
              stats.overnightCount > 0
                ? "border-blue-400/40 bg-blue-400/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold opacity-60">
              <Moon className="h-3 w-3" /> Overnight
            </div>
            <p
              className={`text-3xl font-display font-bold ${
                stats.overnightCount > 0 ? "text-blue-400" : "text-muted-foreground"
              }`}
            >
              {stats.overnightCount}
            </p>
          </div>
        </div>

        {/* Importar planilha — sempre visível */}
        {stats.tasksToday === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-destructive/40 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm font-semibold text-destructive">Nenhuma tarefa importada para hoje</p>
            </div>
            <p className="text-xs text-muted-foreground">
              O sistema depende da planilha diária para operar. Importe antes de começar.
            </p>
            <Button
              size="sm"
              onClick={() => { setOpen(false); navigate("/importar"); }}
              className="w-full gap-1.5"
            >
              <FileInput className="h-3.5 w-3.5" />
              Importar planilha agora
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Importar planilha do dia</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Reimporte sempre que a planilha for atualizada — confirmações preservadas.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1 h-7 text-xs"
              onClick={() => { setOpen(false); navigate("/importar"); }}
            >
              <FileInput className="h-3 w-3" />
              Importar
            </Button>
          </div>
        )}

        {/* Segunda-feira: lembrete de carteira */}
        {isMonday && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-warning flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                Segunda-feira — verifique a carteira
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Certifique-se de que a lista de empresas está atualizada para a semana.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1 h-7 text-xs border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
              onClick={() => { setOpen(false); navigate("/carteira"); }}
            >
              <Building2 className="h-3 w-3" />
              Carteira
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-muted-foreground">
            Pressione <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">Ctrl+K</kbd> para navegar rapidamente
          </p>
          <Button variant="default" onClick={() => setOpen(false)}>
            Começar o dia
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
