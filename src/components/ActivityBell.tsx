import { useState, useEffect, useCallback } from "react";
import { Bell, Check, X, UserMinus, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchActivityLog, clearActivityLog, type ActivityEntry } from "@/lib/activityLog";
import { useWatcherLog } from "@/lib/WatcherContext";
import { fmtSP } from "@/lib/datetime";

const TIPO_CONFIG: Record<ActivityEntry["tipo"], { icon: React.ElementType; label: string; color: string }> = {
  confirmado:    { icon: Check,        label: "Confirmou FUP",              color: "text-success" },
  recusou:       { icon: X,            label: "Recusou FUP",                color: "text-destructive" },
  removido:      { icon: UserMinus,    label: "Removido",                   color: "text-muted-foreground" },
  sync_apareceu: { icon: RefreshCw,    label: "Apareceu no sync",           color: "text-primary" },
  sync_sumiu:    { icon: RefreshCw,    label: "Sumiu no sync",              color: "text-warning" },
  auto_cancel:   { icon: AlertTriangle,label: "Cancelamento automático",    color: "text-destructive" },
};

function formatRelative(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60_000);
  if (diff < 1) return "agora";
  if (diff < 60) return `${diff} min atrás`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h atrás`;
  return fmtSP(new Date(ts).toISOString(), "dd/MM HH:mm");
}

export function ActivityBell() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const { notifLog } = useWatcherLog();

  const reload = useCallback(async () => {
    const data = await fetchActivityLog(100);
    setEntries(data);
    const lastSeen = Number(localStorage.getItem("activity_last_seen") ?? 0);
    setUnread(data.filter((e) => e.timestamp > lastSeen).length);
  }, []);

  useEffect(() => { reload(); }, [reload, notifLog]);

  function handleOpen(v: boolean) {
    setOpen(v);
    if (v) {
      localStorage.setItem("activity_last_seen", String(Date.now()));
      setUnread(0);
    }
  }

  async function handleClear() {
    await clearActivityLog();
    setEntries([]);
    setUnread(0);
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Últimas atualizações</span>
          {entries.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={handleClear}>
              Limpar
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhuma atividade registrada</p>
          ) : (
            entries.map((e) => {
              const cfg = TIPO_CONFIG[e.tipo] ?? TIPO_CONFIG.confirmado;
              const Icon = cfg.icon;
              return (
                <div key={e.id} className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/40">
                  <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground leading-snug">
                      {e.chapa_nome && (
                        <span className="font-medium capitalize">{e.chapa_nome.toLowerCase()} </span>
                      )}
                      <span className="text-muted-foreground">{cfg.label.toLowerCase()}</span>
                    </p>
                    {e.empresa && (
                      <p className="text-[11px] text-muted-foreground truncate">{e.empresa}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{formatRelative(e.timestamp)}</span>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
