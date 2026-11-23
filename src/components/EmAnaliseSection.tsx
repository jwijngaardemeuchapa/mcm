import { useMemo, useState } from "react";
import { ChevronDown, Hourglass, Info } from "lucide-react";
import { fmtSP, todayDateISO_SP } from "@/lib/datetime";
import { criadaHa, rotuloDoDia, type TarefaEmAnalise } from "@/lib/emAnalise";

// Seção "Em análise" — aparece nas 3 visualizações (Cards, Panorama, Timeline),
// logo acima da lista de tarefas. Princípios aplicados (heurísticas de Nielsen,
// Gestalt, WCAG):
//  • Reconhecimento em vez de memória: cabeçalho de coluna sempre visível e a
//    linha repete o mesmo rótulo no celular (nada de adivinhar o que o número é).
//  • Minimalismo: só os 4 dados que decidem algo (empresa, quando, quantos
//    chapas, desde quando existe). Sem urgência inventada: a ordem já é por data.
//  • Proximidade/alinhamento: números com `tabular-nums`, colunas fixas.
//  • Cor nunca sozinha: ícone + texto + contagem junto da cor do status.
//  • Divulgação progressiva: recolhe (e lembra a escolha); some quando vazia.
//  • Alvo de clique grande e acessível por teclado (linha = botão com foco visível).

const CHAVE_ABERTA = "dash_em_analise_aberta";

function lerAberta(): boolean {
  try {
    return localStorage.getItem(CHAVE_ABERTA) !== "0";
  } catch {
    return true;
  }
}

type Props = {
  tarefas: TarefaEmAnalise[];
  onAbrir: (idTarefa: number) => void;
};

// empresa | quando | chapas | criada — a empresa leva o espaço que sobra
const GRADE = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_150px_110px_150px] gap-x-4 gap-y-1";

export function EmAnaliseSection({ tarefas, onAbrir }: Props) {
  const [aberta, setAberta] = useState(lerAberta);
  const hoje = todayDateISO_SP();
  const agora = Date.now();
  const algumaTemCriacao = useMemo(() => tarefas.some((t) => !!t.criada_em), [tarefas]);

  if (tarefas.length === 0) return null;

  function alternar() {
    setAberta((v) => {
      try { localStorage.setItem(CHAVE_ABERTA, v ? "0" : "1"); } catch { /* sem armazenamento: só não lembra */ }
      return !v;
    });
  }

  return (
    <section
      aria-labelledby="em-analise-titulo"
      className="rounded-xl border border-border border-l-4 border-l-analise bg-card shadow-card"
    >
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberta}
        aria-controls="em-analise-lista"
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left rounded-t-xl hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="h-7 w-7 rounded-lg bg-analise/20 text-analise-foreground flex items-center justify-center shrink-0">
          <Hourglass className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <h2 id="em-analise-titulo" className="font-display font-semibold text-base text-foreground">
              Em análise
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-analise/25 text-analise-foreground text-xs font-semibold tabular-nums">
              {tarefas.length}
            </span>
          </span>
          <span className="block text-xs text-muted-foreground">
            Tarefas com status “Em Análise”, da mais próxima para a mais distante. Saem daqui quando o status muda.
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${aberta ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {aberta && (
        <div id="em-analise-lista" className="border-t border-border">
          <div
            className={`${GRADE} hidden sm:grid px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground`}
            aria-hidden="true"
          >
            <span>Empresa</span>
            <span>Quando</span>
            <span className="text-right">Chapas pedidos</span>
            <span>Criada</span>
          </div>
          <ul className="divide-y divide-border">
            {tarefas.map((t) => {
              const dia = rotuloDoDia(t.data_tarefa, hoje, (iso) => fmtSP(`${iso}T12:00:00-03:00`, "EEE dd/MM"));
              const hora = fmtSP(t.data_tarefa, "HH:mm");
              const qtd = t.quantidade_chapas ?? 0;
              const ha = criadaHa(t.criada_em, agora);
              const criadaAbs = t.criada_em ? fmtSP(t.criada_em, "dd/MM/yyyy HH:mm") : null;
              return (
                <li key={t.id_tarefa}>
                  <button
                    type="button"
                    onClick={() => onAbrir(t.id_tarefa)}
                    className={`${GRADE} w-full items-center px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
                    title={`Abrir a tarefa #${t.id_tarefa}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{t.empresa || "—"}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">Tarefa #{t.id_tarefa}</span>
                    </span>
                    <span className="text-sm text-foreground tabular-nums text-right sm:text-left">
                      <span className="sm:hidden text-xs text-muted-foreground mr-1">Quando</span>
                      <span className="font-medium">{dia}</span> · {hora}
                    </span>
                    <span className="text-sm text-foreground tabular-nums sm:text-right">
                      <span className="sm:hidden text-xs text-muted-foreground mr-1">Chapas</span>
                      <span className="font-semibold">{qtd > 0 ? qtd : "—"}</span>
                    </span>
                    <span className="text-sm text-foreground tabular-nums text-right sm:text-left" title={criadaAbs ?? undefined}>
                      <span className="sm:hidden text-xs text-muted-foreground mr-1">Criada</span>
                      {ha ? (
                        <>
                          {ha}
                          {criadaAbs && <span className="hidden lg:inline text-xs text-muted-foreground"> · {fmtSP(t.criada_em!, "dd/MM HH:mm")}</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!algumaTemCriacao && (
            <p className="flex items-start gap-1.5 px-4 py-2.5 text-xs text-muted-foreground border-t border-border bg-muted/20 rounded-b-xl">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              A data de criação ainda não vem do Metabase. Inclua a coluna “Data de Criação” no card de tarefas do dia
              (o MCM reconhece sozinho; Integrações → Metabase mostra se chegou).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
