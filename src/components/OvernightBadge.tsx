import { Moon } from "lucide-react";

export function OvernightBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const cls =
    size === "md"
      ? "text-xs px-2.5 py-1"
      : "text-[10px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider bg-overnight text-overnight-foreground ${cls}`}
    >
      <Moon className="h-3 w-3" /> Overnight
    </span>
  );
}
