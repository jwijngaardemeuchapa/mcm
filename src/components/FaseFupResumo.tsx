import { Check, Clock, RotateCcw } from "lucide-react";

type Props = {
  /** a tarefa está na fase do FUP (≤ 5 h do início, ou antecipada pelo analista) */
  faseFup: boolean;
  /** a fase foi antecipada pelo botão (não é a janela automática): dá pra desfazer */
  antecipada: boolean;
  fupOk: number;
  aguardaFup: number;
  /** confirmaram só o PréFUP, ainda na fase do PréFUP */
  prefupOk: number;
  requested: number;
  onResetar?: () => void;
  onDesfazer?: () => void;
};

/**
 * Resumo das duas fases no cabeçalho do card.
 *  • Fase do PréFUP, com gente que confirmou o PréFUP: botão "Resetar PréFUPs" (passa a mostrar quem
 *    falta no FUP: quem confirmou só o PréFUP deixa de ficar verde).
 *  • Fase do FUP: "FUP 3/8" + "5 aguardando FUP" (âmbar, com ícone e texto — nunca só a cor).
 */
export function FaseFupResumo({ faseFup, antecipada, fupOk, aguardaFup, prefupOk, requested, onResetar, onDesfazer }: Props) {
  if (!faseFup) {
    if (prefupOk <= 0 || !onResetar) return null;
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onResetar(); }}
        title="Passa a mostrar quem já respondeu o FUP: quem confirmou só o PréFUP deixa de ficar verde e fica 'Aguardando FUP'. Ninguém perde a confirmação nem o fill rate."
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-warning/50 hover:bg-warning/5 transition-colors shrink-0"
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
        Resetar PréFUPs
      </button>
    );
  }
  if (aguardaFup <= 0 && fupOk <= 0) return null;
  const completo = aguardaFup === 0 && requested > 0 && fupOk >= requested;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap shrink-0">
      <span
        title={`${fupOk} de ${requested} confirmaram o FUP`}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border tabular-nums ${
          completo ? "border-success/40 bg-success/15 text-success" : "border-border bg-muted/50 text-foreground"
        }`}
      >
        {completo && <Check className="h-3 w-3" aria-hidden="true" />}
        FUP {fupOk}/{requested}
      </span>
      {aguardaFup > 0 && (
        <span
          title="Confirmaram o PréFUP e ainda não responderam o FUP (contam no fill rate, mas não ficam verdes)"
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border border-warning/40 bg-warning/15 text-warning tabular-nums"
        >
          <Clock className="h-3 w-3" aria-hidden="true" />
          {aguardaFup} aguardando FUP
        </span>
      )}
      {antecipada && onDesfazer && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDesfazer(); }}
          title="Volta a mostrar os confirmados do PréFUP como confirmados (a fase do FUP começa sozinha 5 h antes)"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Voltar ao PréFUP
        </button>
      )}
    </span>
  );
}
