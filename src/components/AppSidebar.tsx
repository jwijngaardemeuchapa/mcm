import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Upload, History, Search } from "lucide-react";
import logo from "@/assets/logo-meuchapa.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Carteira", url: "/carteira", icon: Users },
  { title: "Importar", url: "/importar", icon: Upload },
  { title: "Histórico", url: "/historico", icon: History },
  { title: "Consultor", url: "/consultor", icon: Search },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
        <img src={logo} alt="FUP Manager" className="h-9 w-9 shrink-0" />
        {!collapsed && (
          <div className="leading-tight">
            <div className="font-display font-bold text-sidebar-foreground text-base">FUP Manager</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Operacional
            </div>
          </div>
        )}
      </div>

      <SidebarContent className="bg-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.url || (item.url === "/dashboard" && pathname === "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
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
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
