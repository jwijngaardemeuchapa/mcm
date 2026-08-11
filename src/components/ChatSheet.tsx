import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConversationPane } from "@/components/ConversationPane";
import { type UmblerSettings } from "@/lib/settings";

type ChatSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string | null;
  chapaNome: string;
  chapaTelefone: string | null;
  settings: UmblerSettings;
};

// Painel lateral (Sheet) com a conversa de um chat do Umbler Talk — usado
// nos pontos onde ainda não faz sentido o painel de tarefa completo
// (Caderno de Clientes, disparo BID). Ver ConversationPane pro conteúdo.
export function ChatSheet({ open, onOpenChange, chatId, chapaNome, chapaTelefone, settings }: ChatSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetTitle className="sr-only">Conversa — {chapaNome}</SheetTitle>
        <ConversationPane
          chatId={chatId}
          personName={chapaNome}
          personTelefone={chapaTelefone}
          settings={settings}
        />
      </SheetContent>
    </Sheet>
  );
}
