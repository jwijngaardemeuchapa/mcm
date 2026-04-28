import { Badge } from "@/components/ui/badge";

type Props = { status: string };

const map: Record<string, { label: string; cls: string }> = {
  "Aguardando Início": { label: "Aguardando Início", cls: "bg-primary/10 text-primary border-primary/30" },
  "Aguardando Aprovação": { label: "Aguardando Aprovação", cls: "bg-warning/15 text-warning-foreground border-warning/40" },
  "Em Aberto": { label: "Em Aberto", cls: "bg-info/10 text-info border-info/30" },
  "Em Análise": { label: "Em Análise", cls: "bg-muted text-muted-foreground border-border" },
  "Em Andamento": { label: "Em Andamento", cls: "bg-success/10 text-success border-success/30" },
  Finalizado: { label: "Finalizado", cls: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({ status }: Props) {
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <Badge variant="outline" className={`font-semibold ${m.cls}`}>
      {m.label}
    </Badge>
  );
}

export function ContactStatusBadge({ status }: { status: string }) {
  const m: Record<string, { label: string; cls: string }> = {
    pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground border-border" },
    confirmado: { label: "Confirmado", cls: "bg-success/15 text-success border-success/40" },
    nao_respondeu: { label: "Não respondeu", cls: "bg-destructive/10 text-destructive border-destructive/40" },
    removido: { label: "Removido", cls: "bg-destructive/15 text-destructive border-destructive/40 line-through" },
  };
  const s = m[status] ?? m.pendente;
  return (
    <Badge variant="outline" className={`font-semibold text-[10px] uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </Badge>
  );
}
