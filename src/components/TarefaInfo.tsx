import { Hourglass, Package, Tag } from "lucide-react";
import { toast } from "sonner";
import { estaEmOferta, remessaCurta, textoOuNulo, type TarefaExtras } from "@/lib/tarefaExtras";

/**
 * Tipo de trabalho, remessa e oferta a chapa dirigido — o MESMO componente em todas as telas (Cards, Panorama,
 * Timeline, detalhe da tarefa, BID), pra a informação ter sempre a mesma cara.
 *
 * Hierarquia: só o "Em oferta" tem cor (é o único que pede atenção; cor + ícone + texto, nunca só cor);
 * o tipo é um rótulo neutro e a remessa é texto discreto, curto, com o completo no hover e cópia ao clicar.
 */

async function copiarRemessa(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Remessa copiada");
  } catch {
    toast.error("Não foi possível copiar");
  }
}

export function OfertaBadge({ chapa, compacto = false, sobreCor = false }: { chapa?: string | null; compacto?: boolean; sobreCor?: boolean }) {
  const nome = textoOuNulo(chapa);
  return (
    <span
      title={nome ? `Em oferta para ${nome}: o chapa dirigido ainda não aceitou (a vaga conta como aberta)` : "Em oferta: o chapa dirigido ainda não aceitou (a vaga conta como aberta)"}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 max-w-full ${
        sobreCor ? "border-white/40 bg-white/20 text-white" : "border-warning/40 bg-warning/10 text-warning"
      }`}
    >
      <Hourglass className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {compacto || !nome ? "Em oferta" : <>Em oferta · <span className="capitalize">{nome.toLowerCase()}</span></>}
      </span>
    </span>
  );
}

export function TarefaInfo({ t, maxRemessa = 24, className = "", sobreCor = false }: { t: TarefaExtras; maxRemessa?: number; className?: string; sobreCor?: boolean }) {
  const tipo = textoOuNulo(t.tipo_trabalho);
  const remessa = textoOuNulo(t.remessa);
  const oferta = estaEmOferta(t);
  if (!tipo && !remessa && !oferta) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap min-w-0 ${className}`}>
      {oferta && <OfertaBadge chapa={t.chapa_em_oferta} sobreCor={sobreCor} />}
      {tipo && (
        <span
          title="Tipo de trabalho"
          className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${
            sobreCor ? "border-white/30 bg-white/15 text-white" : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          <Tag className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          {tipo}
        </span>
      )}
      {remessa && (
        <button
          type="button"
          title={`Remessa: ${remessa} — clique para copiar`}
          onClick={(e) => { e.stopPropagation(); void copiarRemessa(remessa); }}
          className={`inline-flex items-center gap-1 text-[10px] font-mono transition-colors ${
            sobreCor ? "text-white/85 hover:text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          {remessaCurta(remessa, maxRemessa)}
        </button>
      )}
    </span>
  );
}
