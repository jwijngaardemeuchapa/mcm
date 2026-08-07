import { useRef, useState } from "react";
import { ChevronsRight } from "lucide-react";

type SlideToConfirmProps = {
  onConfirm: () => void;
  label: string;
  icon?: React.ReactNode;
  width?: number;
  className?: string;
};

const THUMB = 28;
const PAD = 4;
const THRESHOLD = 0.85;

// Exige um arraste completo (não um clique) para disparar onConfirm — usado
// em ações destrutivas de massa onde um clique acidental é caro (dispara
// cancelamento para todos os chapas da tarefa).
export function SlideToConfirm({ onConfirm, label, icon, width = 190, className = "" }: SlideToConfirmProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const maxXRef = useRef(0);

  function handlePointerDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    maxXRef.current = Math.max(0, (trackRef.current?.clientWidth ?? width) - THUMB - PAD * 2);
    startXRef.current = e.clientX - dragX;
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const next = Math.min(maxXRef.current, Math.max(0, e.clientX - startXRef.current));
    setDragX(next);
  }

  function commit() {
    setDragging(false);
    const maxX = maxXRef.current;
    if (maxX > 0 && dragX >= maxX * THRESHOLD) {
      setDragX(maxX);
      onConfirm();
    } else {
      setDragX(0);
    }
  }

  return (
    <div
      ref={trackRef}
      className={`relative h-8 rounded-md border border-destructive/40 overflow-hidden select-none ${className}`}
      style={{ width }}
    >
      <div
        className="absolute inset-y-0 left-0 bg-destructive/10"
        style={{ width: dragX + THUMB + PAD, transition: dragging ? "none" : "width 200ms ease-out" }}
      />
      <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-destructive pointer-events-none">
        {icon}
        <span>{label}</span>
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={commit}
        onPointerCancel={commit}
        className="absolute top-0.5 left-0.5 h-7 w-7 rounded flex items-center justify-center bg-destructive text-destructive-foreground shadow-sm cursor-grab active:cursor-grabbing touch-none"
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 200ms ease-out" }}
        aria-label={`Arraste para confirmar: ${label}`}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={maxXRef.current > 0 ? Math.round((dragX / maxXRef.current) * 100) : 0}
      >
        <ChevronsRight className="h-4 w-4" />
      </div>
    </div>
  );
}
