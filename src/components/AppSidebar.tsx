import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Upload,
  History,
  Search,
  BarChart3,
  LineChart,
  Target,
  TrendingUp,
  Activity,
  Settings,
  Plug,
  ExternalLink,
  Plus,
  X,
  BookOpen,
  BookUser,
  BookMarked,
  KanbanSquare,
  ArrowLeftRight,
  Send,
  Bell,
  MessagesSquare,
  Database,
} from "lucide-react";
import { TrocaDeTurno } from "@/components/TrocaDeTurno";
import logo from "@/assets/logo-meuchapa.png";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { readQuickLinks, writeQuickLinks, type QuickLink } from "@/lib/quickLinks";
import { getDb } from "@/lib/db";

const navOperacional = [
  { title: "BID Dashboard", url: "/bid", icon: Target, shortcut: "b" },
  { title: "FUP Dashboard", url: "/dashboard", icon: LayoutDashboard, shortcut: "f" },
  { title: "Respostas", url: "/respostas", icon: MessagesSquare, shortcut: "e" },
  { title: "Carteira", url: "/carteira", icon: Users, shortcut: "c" },
  { title: "Importar", url: "/importar", icon: Upload, shortcut: "i" },
  { title: "Histórico", url: "/historico", icon: History, shortcut: "h" },
  { title: "Consultor", url: "/consultor", icon: Search, shortcut: "s" },
  { title: "Disparos Umbler", url: "/disparos", icon: Send, shortcut: "d" },
  { title: "Fonte de Dados", url: "/metabase", icon: Database, shortcut: "g" },
];

const navAnalise = [
  { title: "Contador", url: "/contador", icon: BarChart3, shortcut: "n" },
  { title: "Análise de Base", url: "/analise", icon: Users, shortcut: "a" },
  { title: "Fill Rate 2.0", url: "/fillrate", icon: Activity, shortcut: "r" },
  { title: "Tendências", url: "/tendencias", icon: TrendingUp, shortcut: "t" },
];

const navGestao = [
  { title: "Caderno de Chapas", url: "/chapas", icon: BookUser, shortcut: "p" },
  { title: "Caderno de Clientes", url: "/clientes", icon: BookMarked, shortcut: "l" },
  { title: "Agenda", url: "/agenda", icon: KanbanSquare, shortcut: "k" },
  { title: "Lembretes", url: "/lembretes", icon: Bell, shortcut: "m" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(readQuickLinks);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingValidacoes, setPendingValidacoes] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const db = await getDb();
        const rows = await db.select<{ count: number }[]>(
          "SELECT COUNT(*) as count FROM tarefas WHERE validacao_status = 'pendente' AND ativo = 1",
        );
        setPendingValidacoes(rows[0]?.count ?? 0);
      } catch { /* noop */ }
    }
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener("fup:refresh", load);
    return () => { clearInterval(t); window.removeEventListener("fup:refresh", load); };
  }, []);
  const [trocaTurnoOpen, setTrocaTurnoOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  function openDialog() {
    setNewName("");
    setNewUrl("");
    setDialogOpen(true);
  }

  function addLink() {
    const name = newName.trim();
    let url = newUrl.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const link: QuickLink = { id: Date.now().toString(), name, url };
    const next = [...quickLinks, link];
    writeQuickLinks(next);
    setQuickLinks(next);
    setDialogOpen(false);
  }

  function removeLink(id: string) {
    const next = quickLinks.filter((l) => l.id !== id);
    writeQuickLinks(next);
    setQuickLinks(next);
  }

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
          <img
            src={logo}
            alt="MCM"
            className="h-9 w-9 shrink-0 cursor-pointer hover:opacity-75 transition-opacity duration-150 active:scale-95"
            title="Ver intro"
            onClick={() => window.dispatchEvent(new CustomEvent("mcm:show-intro"))}
          />
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display font-bold text-sidebar-foreground text-base">MCM</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Operacional
              </div>
            </div>
          )}
        </div>

        <SidebarContent className="bg-sidebar">
          {/* Operacional */}
          <SidebarGroup>
            <SidebarGroupLabel>Operacional</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navOperacional.map((item) => {
                  const active = pathname === item.url || (item.url === "/dashboard" && pathname === "/");
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={active} tooltip={`${item.title} (g${item.shortcut})`}>
                        <NavLink
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                              isActive || active
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                            }`
                          }
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <>
                              <span className="flex-1">{item.title}</span>
                              <kbd className="text-[9px] font-mono px-1 py-px rounded border border-sidebar-border/50 text-muted-foreground/40 bg-transparent leading-none">
                                g{item.shortcut}
                              </kbd>
                            </>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Análise */}
          <SidebarGroup>
            <SidebarGroupLabel>Análise</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navAnalise.map((item) => {
                  const active = pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={active} tooltip={`${item.title} (g${item.shortcut})`}>
                        <NavLink
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                              isActive || active
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                            }`
                          }
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <>
                              <span className="flex-1">{item.title}</span>
                              <kbd className="text-[9px] font-mono px-1 py-px rounded border border-sidebar-border/50 text-muted-foreground/40 bg-transparent leading-none">
                                g{item.shortcut}
                              </kbd>
                            </>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Gestão */}
          <SidebarGroup>
            <SidebarGroupLabel>Gestão</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navGestao.map((item) => {
                  const active = pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={active} tooltip={`${item.title} (g${item.shortcut})`}>
                        <NavLink
                          to={item.url}
                          className={({ isActive }) =>
                            `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                              isActive || active
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                            }`
                          }
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <>
                              <span className="flex-1">{item.title}</span>
                              <kbd className="text-[9px] font-mono px-1 py-px rounded border border-sidebar-border/50 text-muted-foreground/40 bg-transparent leading-none">
                                g{item.shortcut}
                              </kbd>
                            </>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Quick links */}
          <SidebarGroup>
            <div className="flex items-center justify-between px-2 mb-1">
              {!collapsed && (
                <SidebarGroupLabel className="px-0">Links Rápidos</SidebarGroupLabel>
              )}
              <button
                onClick={openDialog}
                title="Adicionar link rápido"
                className={`h-6 w-6 inline-flex items-center justify-center rounded hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors ${collapsed ? "mx-auto" : "ml-auto"}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {quickLinks.map((link) => (
                  <SidebarMenuItem key={link.id}>
                    <SidebarMenuButton asChild tooltip={link.name}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate">{link.name}</span>
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeLink(link.id); }}
                              title="Remover link"
                              className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-destructive/20 hover:text-destructive text-muted-foreground/50 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="bg-sidebar border-t border-sidebar-border p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Troca de Turno — gerar mensagem para o Teams">
                <button
                  onClick={() => setTrocaTurnoOpen(true)}
                  className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                >
                  <ArrowLeftRight className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Troca de Turno</span>}
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/ajuda"} tooltip="Ajuda & Guia do sistema">
                <NavLink
                  to="/ajuda"
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                    }`
                  }
                >
                  <BookOpen className="h-4 w-4" />
                  {!collapsed && <span>Ajuda</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/configuracoes"} tooltip="Configurações">
                <NavLink
                  to="/configuracoes"
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                    }`
                  }
                >
                  <Settings className="h-4 w-4" />
                  {!collapsed && <span>Configurações</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/integracoes"} tooltip="Integrações">
                <NavLink
                  to="/integracoes"
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                    }`
                  }
                >
                  <Plug className="h-4 w-4" />
                  {!collapsed && <span>Integrações</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Add link dialog — rendered outside Sidebar to avoid stacking context issues */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar link rápido</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <Input
                placeholder="Ex: Contas a Pagar"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addLink(); }}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">URL</label>
              <Input
                placeholder="https://..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addLink(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={addLink} disabled={!newName.trim() || !newUrl.trim()}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TrocaDeTurno open={trocaTurnoOpen} onClose={() => setTrocaTurnoOpen(false)} />
    </>
  );
}
