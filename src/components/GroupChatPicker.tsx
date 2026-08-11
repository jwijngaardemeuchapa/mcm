import { useEffect, useState } from "react";
import { Loader2, Search, Users, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchUmblerGroupChats, humanizarErroUmbler, type UmblerChatSummary } from "@/lib/umbler";
import { type UmblerSettings } from "@/lib/settings";
import { getDb } from "@/lib/db";
import { toast } from "sonner";

type GroupChatPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string | null;
  settings: UmblerSettings;
  onLinked: (chatId: string) => void;
};

// Busca + seleção do grupo de WhatsApp do cliente na Umbler, persistindo em
// cliente_book.umbler_group_chat_id — MCM-137 fase 2. Não existe filtro de
// telefone na API, então busca automática roda por nome do cliente e o
// operador pode refinar manualmente (telefone, apelido do grupo etc.).
export function GroupChatPicker({
  open,
  onOpenChange,
  clienteId,
  clienteNome,
  clienteTelefone,
  settings,
  onLinked,
}: GroupChatPickerProps) {
  const [query, setQuery] = useState(clienteNome);
  const [results, setResults] = useState<UmblerChatSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  function search(q: string) {
    setLoading(true);
    setError(null);
    searchUmblerGroupChats({ settings, query: q })
      .then(setResults)
      .catch((e) => setError(humanizarErroUmbler(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!open) { setResults([]); setError(null); return; }
    setQuery(clienteNome);
    search(clienteNome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clienteId]);

  async function handleLink(chat: UmblerChatSummary) {
    setLinkingId(chat.id);
    try {
      const db = await getDb();
      await db.execute(
        "UPDATE cliente_book SET umbler_group_chat_id = ? WHERE id = ?",
        [chat.id, clienteId],
      );
      onLinked(chat.id);
      toast.success(`Grupo "${chat.contactName}" vinculado a ${clienteNome}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Falha ao salvar vínculo: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" /> Vincular grupo — {clienteNome}
          </DialogTitle>
        </DialogHeader>
        <div className="p-4 border-b border-border shrink-0 flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") search(query); }}
            placeholder="Nome do grupo ou telefone"
            className="h-9 text-sm"
          />
          <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={() => search(query)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && results.length === 0 && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
              {error}
            </div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="text-xs text-muted-foreground italic text-center py-10">
              Nenhum grupo encontrado{clienteTelefone ? "" : " — tente buscar por nome ou telefone"}.
            </div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleLink(r)}
              disabled={linkingId !== null}
              className="w-full text-left p-3 rounded-md border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground truncate">{r.contactName || "(sem nome)"}</span>
                {linkingId === r.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : (
                  <Check className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
              </div>
              {r.contactPhone && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{r.contactPhone}</p>
              )}
              {r.lastMessagePreview && (
                <p className="text-[11px] text-muted-foreground mt-1 truncate italic">"{r.lastMessagePreview}"</p>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
