import { ExternalLink, Layers } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

type Membro = { id_tarefa: number; quantidade_chapas?: number | null; status_tarefa?: string | null; chapas?: unknown[] };

type Props = {
  /** `task.grupo` do card — só existe no card de grupo; sem ele o selo não aparece */
  grupo?: { ids: number[]; membros: Membro[] } | null;
  onDesfazer?: (ids: number[]) => void;
  /** em cima de cor forte (o bloco de horário): troca as cores pra ficar legível */
  sobreCor?: boolean;
};

/**
 * Selo "Grupo · N tarefas" — o card junta tarefas do mesmo cliente + endereço + horário (clientes que
 * lançam uma tarefa por chapa). Ícone + texto (nunca só cor). Ao clicar: as tarefas do grupo, cada uma
 * com o link pro Meu Chapa, e "Desfazer grupo" pra voltar a vê-las separadas.
 */
export function GrupoBadge({ grupo, onDesfazer, sobreCor = false }: Props) {
  if (!grupo || grupo.ids.length < 2) return null;
  const n = grupo.ids.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title="Tarefas do mesmo cliente, endereço e horário reunidas num card. Clique pra ver quais."
          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded border shrink-0 transition-colors ${
            sobreCor
              ? "border-white/40 bg-white/20 text-white hover:bg-white/30"
              : "border-info/40 bg-info/10 text-info hover:bg-info/20"
          }`}
        >
          <Layers className="h-3 w-3" aria-hidden="true" />
          Grupo · {n} tarefas
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-sm font-semibold text-foreground">{n} tarefas neste card</p>
          <p className="text-xs text-muted-foreground">Mesmo cliente, endereço e horário. Os chapas aparecem juntos; cada um segue ligado à própria tarefa.</p>
        </div>
        <ul className="space-y-1">
          {grupo.membros.map((m) => (
            <li key={m.id_tarefa} className="flex items-center gap-2 text-xs">
              <a
                href={`https://app.meu-chapa.com/admin/edit-task/${m.id_tarefa}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-foreground hover:underline inline-flex items-center gap-0.5"
                title="Abrir tarefa no Meu Chapa"
              >
                #{m.id_tarefa}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
              <span className="text-muted-foreground tabular-nums">
                {m.chapas?.length ?? 0}/{m.quantidade_chapas || m.chapas?.length || 0} chapas
              </span>
              {m.status_tarefa && <span className="ml-auto text-muted-foreground truncate">{m.status_tarefa}</span>}
            </li>
          ))}
        </ul>
        {onDesfazer && (
          <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => onDesfazer(grupo.ids)}>
            Desfazer grupo
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
