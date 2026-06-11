import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ActiveDispatchesOverlay } from "./ActiveDispatchesOverlay";
import { fmtDateLong, timeAgo } from "@/lib/datetime";
import { Clock, Undo2, Search } from "lucide-react";
import { getDb } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { useUndo } from "@/lib/undo";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPalette } from "./CommandPalette";
import { DailyBriefing } from "./DailyBriefing";
import { useKeyboardNav, type NavShortcut } from "@/lib/useKeyboardNav";

const NAV_SHORTCUTS: NavShortcut[] = [
  { key: "b", url: "/bid" },
  { key: "f", url: "/dashboard" },
  { key: "c", url: "/carteira" },
  { key: "i", url: "/importar" },
  { key: "h", url: "/historico" },
  { key: "s", url: "/consultor" },
  { key: "d", url: "/disparos" },
  { key: "n", url: "/contador" },
  { key: "a", url: "/analise" },
  { key: "r", url: "/fillrate" },
  { key: "t", url: "/tendencias" },
  { key: "p", url: "/chapas" },
  { key: "l", url: "/clientes" },
  { key: "k", url: "/agenda" },
  { key: "m", url: "/lembretes" },
];

export default function AppLayout() {
  const [now, setNow] = useState(new Date());
  const [lastImport, setLastImport] = useState<string | null>(null);
  const { last, undo } = useUndo();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { awaitingChord } = useKeyboardNav(NAV_SHORTCUTS);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fetchLast = async () => {
      try {
        const db = await getDb();
        const rows = await db.select<{ importado_em: string }[]>(
          "SELECT importado_em FROM tarefas ORDER BY importado_em DESC LIMIT 1",
        );
        if (rows[0]) setLastImport(rows[0].importado_em);
      } catch {
        /* noop */
      }
    };
    fetchLast();
    const t = setInterval(fetchLast, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <SidebarProvider>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <DailyBriefing />
      <ActiveDispatchesOverlay />
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center gap-4 px-4 md:px-6 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30">
            <SidebarTrigger className="shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-semibold text-base md:text-lg text-foreground truncate">
                {fmtDateLong(now)}
              </h1>
            </div>
            {(() => {
              const minutesAgo = lastImport
                ? (now.getTime() - new Date(lastImport).getTime()) / 60_000
                : null;
              const stale = minutesAgo !== null && minutesAgo >= 240;
              return (
                <div
                  className={`hidden md:flex items-center gap-2 text-xs ${
                    stale ? "text-destructive animate-pulse" : "text-muted-foreground"
                  }`}
                  title={stale ? "Planilha desatualizada — considere reimportar" : undefined}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Última importação:{" "}
                    <span className={`font-semibold ${stale ? "text-destructive" : "text-foreground"}`}>
                      {lastImport ? timeAgo(lastImport) : "—"}
                    </span>
                  </span>
                </div>
              );
            })()}
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden md:flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-background text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Busca rápida (Ctrl+K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Buscar…</span>
              <kbd className="ml-1 px-1 py-0.5 rounded bg-muted text-[10px] font-mono border border-border">⌃K</kbd>
            </button>
            {last && (
              <Button
                size="sm"
                variant="outline"
                onClick={undo}
                className="gap-1.5 h-8 transition-all duration-200"
                title={`Desfazer: ${last.label}`}
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs font-semibold">Desfazer</span>
              </Button>
            )}
            <ThemeToggle />
          </header>

          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {awaitingChord && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-foreground/90 text-background text-xs font-mono shadow-lg pointer-events-none select-none animate-in fade-in slide-in-from-bottom-2 duration-150">
          <kbd className="font-bold text-sm leading-none">g</kbd>
          <span className="opacity-50 text-[10px]">+</span>
          <span className="opacity-70 tracking-wide">aguardando tecla…</span>
        </div>
      )}
    </SidebarProvider>
  );
}
