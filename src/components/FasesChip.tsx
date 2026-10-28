import { fmtDateTime } from "@/lib/datetime";

// As duas fases de confirmação do chapa (ver lib/fasesConfirmacao.ts): "PréFUP ✓" quando ele
// confirmou o PréFUP, "FUP ✓" quando confirmou o FUP. Quem confirmou só o PréFUP mostra "FUP —"
// (ainda sem resposta do reforço) — é quem o FUP em massa reforça quando chega a janela.
const BASE = "inline-flex items-center rounded border px-1 text-[10px] font-semibold leading-4";

function quando(iso: string): string {
  try {
    return fmtDateTime(iso);
  } catch {
    return iso; // flag com data ilegível nunca derruba a linha
  }
}

export function FasesChip({ prefup, fup }: { prefup?: string | null; fup?: string | null }) {
  if (!prefup && !fup) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-1 font-normal">
      {prefup ? (
        <span className={`${BASE} border-success/40 bg-success/20 text-success`} title={`Confirmou o PréFUP em ${quando(prefup)}`}>
          PréFUP ✓
        </span>
      ) : null}
      {fup ? (
        <span className={`${BASE} border-success/40 bg-success/20 text-success`} title={`Confirmou o FUP em ${quando(fup)}`}>
          FUP ✓
        </span>
      ) : prefup ? (
        <span
          className={`${BASE} border-dashed border-muted-foreground/40 text-muted-foreground`}
          title="Confirmou o PréFUP; ainda sem resposta do FUP de reforço"
        >
          FUP —
        </span>
      ) : null}
    </span>
  );
}
