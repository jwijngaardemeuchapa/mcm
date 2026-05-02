import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { fmtDateLong, timeAgo } from "@/lib/datetime";
import { Clock, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useUndo } from "@/lib/undo";
import { ThemeToggle } from "./ThemeToggle";

export default function AppLayout() {
  const [now, setNow] = useState(new Date());
  const [lastImport, setLastImport] = useState<string | null>(null);
  const { last, undo } = useUndo();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fetchLast = async () => {
      const { data } = await supabase
        .from("tarefas")
        .select("importado_em")
        .order("importado_em", { ascending: false })
        .limit(1);
      if (data?.[0]) setLastImport(data[0].importado_em);
    };
    fetchLast();
    const t = setInterval(fetchLast, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <SidebarProvider>
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
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                Última importação:{" "}
                <span className="font-semibold text-foreground">
                  {lastImport ? timeAgo(lastImport) : "—"}
                </span>
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={undo}
              disabled={!last}
              className="gap-1.5 h-8 transition-all duration-200"
              title={last ? `Desfazer: ${last.label}` : "Nada para desfazer"}
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs font-semibold">Desfazer</span>
            </Button>
            <ThemeToggle />
          </header>

          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
