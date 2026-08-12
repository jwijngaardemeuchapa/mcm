import { useEffect, useState } from "react";
import { Layers, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { readSettings, writeSettings } from "@/lib/settings";
import { getDb } from "@/lib/db";

const GRUPOS = ["G1", "G2", "G3", "G4", "G5"];

// Seletor compacto do filtro de carteira por grupo — replica o toggle de
// Carteira.tsx, mas embutido na barra superior pra não precisar navegar até
// lá. Setting (`carteiraGruposAtivos`) e eventos ("carteira:changed" pro
// watcher, "fup:refresh" pro reload dos dashboards já montados) são os
// mesmos — os dois pontos ficam em sincronia automaticamente.
export function CarteiraSelector() {
  const [gruposAtivos, setGruposAtivos] = useState<string[]>(() => readSettings().carteiraGruposAtivos ?? []);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getDb()
      .then((db) => db.select<{ grupo: string | null }[]>("SELECT grupo FROM carteira"))
      .then((rows) => {
        const next: Record<string, number> = {};
        for (const r of rows) if (r.grupo) next[r.grupo] = (next[r.grupo] ?? 0) + 1;
        setCounts(next);
      })
      .catch(() => {});
  }, [open]);

  function apply(next: string[]) {
    setGruposAtivos(next);
    writeSettings({ carteiraGruposAtivos: next });
    window.dispatchEvent(new CustomEvent("carteira:changed"));
    window.dispatchEvent(new CustomEvent("fup:refresh"));
  }

  function toggleGrupo(g: string) {
    apply(gruposAtivos.includes(g) ? gruposAtivos.filter((x) => x !== g) : [...gruposAtivos, g]);
  }

  const active = gruposAtivos.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 h-8 text-xs shrink-0 ${active ? "border-primary/60 text-primary" : ""}`}
          title="Filtrar dashboards por grupo de carteira"
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{active ? gruposAtivos.join(", ") : "Todos"}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">Filtrar por grupo</span>
          {active && (
            <button type="button" onClick={() => apply([])} className="text-[11px] text-muted-foreground hover:text-foreground underline">
              Limpar
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {GRUPOS.map((g) => {
            const isActive = gruposAtivos.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGrupo(g)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors border ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/60 text-muted-foreground border-border hover:border-primary/60 hover:text-foreground"
                }`}
              >
                {g}
                {(counts[g] ?? 0) > 0 && (
                  <span className={`text-[10px] tabular-nums ${isActive ? "opacity-75" : "opacity-50"}`}>{counts[g]}</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {active
            ? "Empresas fixadas individualmente (Carteira) aparecem mesmo fora do grupo."
            : "Sem filtro — mostrando todos os grupos."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
