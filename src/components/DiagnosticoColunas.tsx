import { Check, X } from "lucide-react";
import { CAMPOS_DO_CARD, lerDiagnostico, rotulosFaltando } from "@/lib/colunasMetabase";

/**
 * O que o card do Metabase REALMENTE trouxe no último sync: quais das colunas de tipo de trabalho / remessa / oferta
 * chegaram, e todos os nomes de coluna recebidos. É a primeira coisa a olhar quando "a informação não aparece":
 * o MCM só enxerga as colunas que o Metabase exporta (colunas escondidas na configuração da tabela não vêm).
 * `chave` só serve pra reler quando um novo sync termina.
 */
export function DiagnosticoColunas({ chave }: { chave?: unknown }) {
  void chave;
  const d = lerDiagnostico();
  if (!d) return null;
  const faltando = rotulosFaltando(d);
  return (
    <div className="rounded-md border border-border p-2.5 space-y-1.5 text-xs" data-testid="diagnostico-colunas">
      <p className="text-muted-foreground">
        Último sync {d.origem === "planilha" ? "(planilha)" : "do Metabase"}: {d.linhas} linhas · {d.colunas.length} colunas
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {CAMPOS_DO_CARD.map((c) => {
          const nome = d.achadas[c.campo];
          return (
            <span key={c.campo} className={`inline-flex items-center gap-1 ${nome ? "text-success" : "text-destructive"}`} title={nome ? `Veio como "${nome}"` : "O card não trouxe esta coluna"}>
              {nome ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
              {c.rotulo} {nome ? "" : "— não veio"}
            </span>
          );
        })}
      </div>
      {faltando.length > 0 && d.origem === "metabase" && (
        <p className="text-warning">
          O card não trouxe: {faltando.join(", ")}. O MCM só recebe as colunas que o Metabase exporta — confira no card se elas estão
          visíveis (configurações da tabela) e se o card foi salvo depois de acrescentá-las.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver os nomes das {d.colunas.length} colunas recebidas</summary>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground break-words">{d.colunas.join(" · ")}</p>
      </details>
    </div>
  );
}
