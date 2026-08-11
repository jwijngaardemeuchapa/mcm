import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown } from "lucide-react";
import { type ReactNode } from "react";

type TaskFullScreenViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
};

// "Modo foco" — clicar numa tarefa (Panorama/Timeline) abre os detalhes em
// tela cheia, com slide-up a partir da base. Botão de fechar volta pro
// dashboard (slide-down); clicar na tarefa de novo reabre.
export function TaskFullScreenView({ open, onOpenChange, title, subtitle, children }: TaskFullScreenViewProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:duration-200 data-[state=open]:duration-300"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-card">
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground transition-colors"
                aria-label="Fechar — voltar pro painel"
                title="Fechar — voltar pro painel"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </DialogPrimitive.Close>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground truncate">
                {title}
              </DialogPrimitive.Title>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-4">
              {children}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
