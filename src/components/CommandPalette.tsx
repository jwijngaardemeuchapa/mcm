import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  FileInput,
  BookOpen,
  History,
  Search,
  BarChart3,
  TrendingUp,
  Users,
  CalendarDays,
  Settings,
  HelpCircle,
  Plug,
  Truck,
  User,
  BookMarked,
  Send,
  Bell,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { fmtSP } from "@/lib/datetime";
import { normalize } from "@/lib/normalize";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  group: "Operacional" | "Análise" | "Gestão" | "Sistema";
  shortcut?: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Operacional", shortcut: "D" },
  { label: "Importar planilha", href: "/importar", icon: FileInput, group: "Operacional", shortcut: "R" },
  { label: "Carteira de clientes", href: "/carteira", icon: BookOpen, group: "Operacional" },
  { label: "Histórico", href: "/historico", icon: History, group: "Operacional" },
  { label: "Consultor", href: "/consultor", icon: Search, group: "Análise" },
  { label: "Contador de tarefas", href: "/contador", icon: BarChart3, group: "Análise" },
  { label: "Fill Rate", href: "/analise", icon: TrendingUp, group: "Análise" },
  { label: "Tendências", href: "/tendencias", icon: TrendingUp, group: "Análise" },
  { label: "Caderno de Chapas", href: "/chapas", icon: Users, group: "Gestão" },
  { label: "Caderno de Clientes", href: "/clientes", icon: BookMarked, group: "Gestão" },
  { label: "Agenda", href: "/agenda", icon: CalendarDays, group: "Gestão" },
  { label: "Lembretes", href: "/lembretes", icon: Bell, group: "Gestão" },
  { label: "Configurações", href: "/configuracoes", icon: Settings, group: "Sistema" },
  { label: "Ajuda", href: "/ajuda", icon: HelpCircle, group: "Sistema" },
  { label: "Integrações", href: "/integracoes", icon: Plug, group: "Sistema" },
  { label: "Disparos Umbler", href: "/disparos", icon: Send, group: "Operacional" },
];

type RecentTask = {
  id_tarefa: number;
  empresa: string;
  data_tarefa: string;
};

type ChapaResult = {
  chapa_id: string;
  nome_chapa: string;
  id_tarefa: number;
  empresa: string;
  data_tarefa: string;
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<RecentTask[]>([]);
  const [query, setQuery] = useState("");
  const [chapaResults, setChapaResults] = useState<ChapaResult[]>([]);

  // Load recent tasks when dialog opens
  useEffect(() => {
    if (!open) return;
    getDb()
      .then((db) =>
        db.select<RecentTask[]>(
          "SELECT id_tarefa, empresa, data_tarefa FROM tarefas WHERE ativo = 1 ORDER BY data_tarefa DESC LIMIT 20",
        ),
      )
      .then(setTasks)
      .catch(() => {});
  }, [open]);

  // Reset query when closed
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Search chapas as user types (min 2 chars)
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setChapaResults([]);
      return;
    }
    const norm = normalize(query.trim());
    getDb()
      .then((db) =>
        db.select<ChapaResult[]>(
          `SELECT c.id as chapa_id, c.nome_chapa, t.id_tarefa, t.empresa, t.data_tarefa
           FROM chapas c
           JOIN tarefas t ON c.id_tarefa = t.id_tarefa
           WHERE c.nome_chapa IS NOT NULL
             AND c.status_contato != 'removido'
             AND t.ativo = 1
           ORDER BY t.data_tarefa DESC`,
        ),
      )
      .then((rows) => {
        const filtered = rows.filter((r) => normalize(r.nome_chapa).includes(norm));
        // Deduplicate: one entry per (chapa_id + tarefa), max 8 results
        const seen = new Set<string>();
        const deduped: ChapaResult[] = [];
        for (const r of filtered) {
          const key = `${r.chapa_id}-${r.id_tarefa}`;
          if (!seen.has(key)) { seen.add(key); deduped.push(r); }
          if (deduped.length >= 8) break;
        }
        setChapaResults(deduped);
      })
      .catch(() => {});
  }, [query, open]);

  function go(href: string) {
    navigate(href);
    onOpenChange(false);
  }

  const groups: NavItem["group"][] = ["Operacional", "Análise", "Gestão", "Sistema"];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar página, empresa, chapa…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[480px]">
        <CommandEmpty>Nenhum resultado.</CommandEmpty>

        {/* Nav groups */}
        {groups.map((group, gi) => {
          const items = NAV_ITEMS.filter((n) => n.group === group);
          return (
            <div key={group}>
              {gi > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {items.map((item) => (
                  <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                    <item.icon className="mr-2 h-4 w-4 opacity-60" />
                    <span>{item.label}</span>
                    {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          );
        })}

        {/* Chapa search results */}
        {chapaResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Chapas encontrados">
              {chapaResults.map((r) => (
                <CommandItem
                  key={`chapa-${r.chapa_id}-${r.id_tarefa}`}
                  value={`chapa-${r.nome_chapa}-${r.id_tarefa}`}
                  onSelect={() => go(`/dashboard?q=${encodeURIComponent(r.nome_chapa)}&flash=${r.id_tarefa}`)}
                >
                  <User className="mr-2 h-4 w-4 opacity-60 shrink-0" />
                  <span className="font-medium capitalize">{r.nome_chapa.toLowerCase()}</span>
                  <span className="ml-2 text-xs text-muted-foreground truncate">
                    {r.empresa} · #{r.id_tarefa} · {fmtSP(r.data_tarefa, "dd/MM HH:mm")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Recent tasks */}
        {tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tarefas recentes">
              {tasks.map((t) => (
                <CommandItem
                  key={t.id_tarefa}
                  value={`${t.empresa} ${t.id_tarefa}`}
                  onSelect={() => go(`/dashboard?flash=${t.id_tarefa}`)}
                >
                  <Truck className="mr-2 h-4 w-4 opacity-60 shrink-0" />
                  <span className="font-medium capitalize">{t.empresa.toLowerCase()}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    #{t.id_tarefa} · {fmtSP(t.data_tarefa, "dd/MM HH:mm")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
