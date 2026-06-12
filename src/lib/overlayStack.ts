import { useEffect, useState, type RefObject } from "react";

// Empilhamento dos painéis flutuantes do canto inferior direito.
// Ordem fixa, de baixo para cima: approaching (alerta de proximidade) → dispatches (disparos).
// Cada painel publica sua altura real (ResizeObserver) e recebe o deslocamento
// imposto pelos painéis abaixo — funciona expandido, recolhido ou minimizado em pílula.

const ORDER = ["approaching", "dispatches"] as const;
export type OverlayId = (typeof ORDER)[number];

const GAP = 8; // px entre painéis
const heights = new Map<OverlayId, number>();
const subs = new Set<() => void>();

function publish(id: OverlayId, h: number) {
  const cur = heights.get(id) ?? 0;
  if (cur === h) return;
  if (h <= 0) heights.delete(id);
  else heights.set(id, h);
  subs.forEach((cb) => cb());
}

function offsetFor(id: OverlayId): number {
  let off = 0;
  for (const o of ORDER) {
    if (o === id) break;
    const h = heights.get(o) ?? 0;
    if (h > 0) off += h + GAP;
  }
  return off;
}

// `remeasureKey`: inclua aqui qualquer estado que troque o elemento raiz
// (ex.: minimizado ↔ expandido) para religar o ResizeObserver no nó novo.
export function useOverlaySlot(
  id: OverlayId,
  ref: RefObject<HTMLElement>,
  active: boolean,
  remeasureKey?: unknown,
): number {
  const [offset, setOffset] = useState(() => offsetFor(id));

  useEffect(() => {
    const cb = () => setOffset(offsetFor(id));
    subs.add(cb);
    cb();
    return () => { subs.delete(cb); };
  }, [id]);

  useEffect(() => {
    if (!active || !ref.current) {
      publish(id, 0);
      return;
    }
    const el = ref.current;
    publish(id, el.offsetHeight);
    const ro = new ResizeObserver(() => publish(id, el.offsetHeight));
    ro.observe(el);
    return () => { ro.disconnect(); publish(id, 0); };
  }, [id, active, ref, remeasureKey]);

  return offset;
}
