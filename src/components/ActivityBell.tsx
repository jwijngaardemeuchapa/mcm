import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, Check, X, UserMinus, RefreshCw, AlertTriangle, ArrowUpRight, ThumbsUp, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchActivityLog, clearActivityLog, type ActivityEntry } from "@/lib/activityLog";
import { useWatcherLog } from "@/lib/WatcherContext";
import { fmtSP } from "@/lib/datetime";
import type { DiffResult } from "@/components/RefreshDiff";

const TIPO_CONFIG: Record<ActivityEntry["tipo"], { icon: React.ElementType; label: string; color: string }> = {
  confirmado:    { icon: Check,         label: "Confirmou FUP",           color: "text-success" },
  recusou:       { icon: X,             label: "Recusou FUP",             color: "text-destructive" },
  removido:      { icon: UserMinus,     label: "Removido",                color: "text-muted-foreground" },
  sync_apareceu: { icon: RefreshCw,     label: "Apareceu no sync",        color: "text-primary" },
  sync_sumiu:    { icon: RefreshCw,     label: "Sumiu no sync",           color: "text-warning" },
  auto_cancel:   { icon: AlertTriangle, label: "Cancelamento automático", color: "text-destructive" },
  bid_interesse: { icon: ThumbsUp,      label: "Interesse confirmado BID", color: "text-success" },
  bid_aceite:    { icon: Star,          label: "Aceitou via app BID",     color: "text-success" },
};

function formatRelative(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60_000);
  if (diff < 1) return "agora";
  if (diff < 60) return `${diff} min atrás`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h atrás`;
  return fmtSP(new Date(ts).toISOString(), "dd/MM HH:mm");
}

type Props = {
  diffResult?: DiffResult | null;
  onOpenDiff?: () => void;
};

export function ActivityBell({ diffResult, onOpenDiff }: Props = {}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const [ringing, setRinging] = useState(false);
  const prevUnreadRef = useRef(0);
  const { notifLog } = useWatcherLog();

  const reload = useCallback(async () => {
    const data = await fetchActivityLog(100);
    setEntries(data);
    const lastSeen = Number(localStorage.getItem("activity_last_seen") ?? 0);
    const newUnread = data.filter((e) => e.timestamp > lastSeen).length;
    setUnread(newUnread);
    return newUnread;
  }, []);

  const ringBell = useCallback((newUnread: number) => {
    if (newUnread > prevUnreadRef.current) {
      setRinging(true);
      setTimeout(() => setRinging(false), 1200);
    }
    prevUnreadRef.current = newUnread;
  }, []);

  useEffect(() => {
    reload().then(ringBell);
  }, [reload, notifLog, ringBell]);

  useEffect(() => {
    const handler = () => reload().then(ringBell);
    window.addEventListener("activity:new-diff", handler);
    return () => window.removeEventListener("activity:new-diff", handler);
  }, [reload, ringBell]);

  function handleOpen(v: boolean) {
    setOpen(v);
    if (v) {
      localStorage.setItem("activity_last_seen", String(Date.now()));
      setUnread(0);
      prevUnreadRef.current = 0;
    }
  }

  async function handleClear() {
    await clearActivityLog();
    setEntries([]);
    setUnread(0);
    prevUnreadRef.current = 0;
  }

  const hasDiff = diffResult && (diffResult.added.length > 0 || diffResult.removed.length > 0);

  return (
    <>
      <style>{`
        @keyframes bell-ring {
          0%   { transform: rotate(0deg) scale(1); }
          10%  { transform: rotate(-18deg) scale(1.15); }
          25%  { transform: rotate(16deg) scale(1.18); }
          40%  { transform: rotate(-12deg) scale(1.12); }
          55%  { transform: rotate(10deg) scale(1.08); }
          70%  { transform: rotate(-6deg) scale(1.04); }
          85%  { transform: rotate(4deg) scale(1.02); }
          100% { transform: rotate(0deg) scale(1); }
        }
        .bell-ringing {
          animation: bell-ring 0.7s ease-out;
          color: hsl(var(--primary));
        }
      `}</style>
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            aria-label="Últimas atualizações"
          >
            <Bell className={`h-4 w-4 transition-colors ${ringing ? "bell-ringing" : ""}`} />
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

          {hasDiff && onOpenDiff && (
            <button
              onClick={() => { setOpen(false); onOpenDiff(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-primary/5 hover:bg-primary/10 transition-colors text-left"
            >
              <RefreshCw className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-medium text-primary flex-1">
                {diffResult.added.length > 0 && `${diffResult.added.length} novo${diffResult.added.length > 1 ? "s" : ""}`}
                {diffResult.added.length > 0 && diffResult.removed.length > 0 && " · "}
                {diffResult.removed.length > 0 && `${diffResult.removed.length} saiu${diffResult.removed.length > 1 ? "ram" : ""}`}
                {" desde o último sync"}
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 text-primary shrink-0" />
            </button>
          )}

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
    </>
  );
}
