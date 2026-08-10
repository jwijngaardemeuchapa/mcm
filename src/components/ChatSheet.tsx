import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Send } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchUmblerRecentMessages, sendUmblerFreeText, humanizarErroUmbler, umblerChatLink, type UmblerMessage } from "@/lib/umbler";
import { type UmblerSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/datetime";

type ChatSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string | null;
  chapaNome: string;
  chapaTelefone: string | null;
  settings: UmblerSettings;
};

const TAKE = 15;
// WhatsApp Business API fecha a janela de resposta livre 24h após a última
// mensagem recebida DO contato — não é campo exposto por essa API da Umbler
// (confirmado: não documentado em umbler_talk_schema.md), então calculamos
// aqui do mesmo jeito que o próprio painel da Umbler provavelmente faz.
const REPLY_WINDOW_HOURS = 24;
// Limite prático de mensagem — WhatsApp não define um hard limit curto, mas
// evita colar blocos gigantes por engano.
const MAX_REPLY_LENGTH = 4096;

function hoursSinceLastContactMessage(messages: UmblerMessage[]): number | null {
  const contactMsgs = messages.filter((m) => m.source === "Contact" && m.eventAtUTC);
  if (contactMsgs.length === 0) return null;
  const last = contactMsgs[contactMsgs.length - 1]; // já ordenado por eventAtUTC asc
  return (Date.now() - new Date(last.eventAtUTC).getTime()) / (1000 * 60 * 60);
}

// Últimas mensagens de um chat do Umbler Talk — texto, imagem e áudio.
// Busca só ao abrir (nunca em background pra toda a lista de chapas — ver
// nota de rate limit em umbler.ts/fetchUmblerRecentMessages).
export function ChatSheet({ open, onOpenChange, chatId, chapaNome, chapaTelefone, settings }: ChatSheetProps) {
  const [messages, setMessages] = useState<UmblerMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  function load() {
    if (!chatId) return;
    setLoading(true);
    setError(null);
    fetchUmblerRecentMessages({ chatId, settings, take: TAKE })
      .then(setMessages)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (open && chatId) load();
    if (!open) { setMessages([]); setError(null); setReply(""); setSendError(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chatId]);

  const hoursSinceContact = hoursSinceLastContactMessage(messages);
  const windowOpen = hoursSinceContact === null ? null : hoursSinceContact < REPLY_WINDOW_HOURS;
  const overLimit = reply.length > MAX_REPLY_LENGTH;

  async function handleSend() {
    const text = reply.trim();
    if (!text || !chapaTelefone || sending || overLimit) return;
    setSending(true);
    setSendError(null);
    try {
      await sendUmblerFreeText({ chapaTelefone, message: text, settings });
      setReply("");
      // Mensagem enviada pode demorar alguns segundos pra aparecer no
      // relative-messages — recarrega em seguida, sem travar a UI.
      load();
    } catch (e) {
      setSendError(humanizarErroUmbler(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <SheetTitle className="text-sm truncate">Conversa — {chapaNome}</SheetTitle>
              <p className="text-[10px] text-muted-foreground">Últimas {TAKE} mensagens</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} title="Atualizar" disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
              {chatId && (
                <a href={umblerChatLink(chatId) ?? "#"} target="_blank" rel="noopener noreferrer"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
                  title="Abrir no Umbler Talk">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && messages.length === 0 && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
              Falha ao carregar mensagens — {error}
            </div>
          )}
          {!loading && !error && messages.length === 0 && (
            <div className="text-xs text-muted-foreground italic text-center py-10">
              Nenhuma mensagem recente encontrada. A Umbler só disponibiliza uma janela recente de mensagens, não o histórico completo.
            </div>
          )}
          {messages.map((m) => (
            <ChatBubble key={m.id} message={m} />
          ))}
        </div>
        {chapaTelefone && (
          <div className="border-t border-border p-3 space-y-2">
            {windowOpen === false && (
              <div className="text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-md px-2 py-1.5">
                Janela de 24h fechada — o chapa não responde há mais de 24h. Mensagem livre pode falhar; use um template pra reabrir a conversa.
              </div>
            )}
            {sendError && (
              <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-2 py-1.5">
                {sendError}
              </div>
            )}
            <div className="flex items-end gap-2">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={windowOpen === false ? "Janela de 24h fechada — envio pode falhar" : "Responder ao chapa"}
                className="min-h-9 h-9 max-h-24 resize-none text-xs"
                disabled={sending}
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={sending || !reply.trim() || overLimit}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            {overLimit && (
              <p className="text-[10px] text-destructive">
                Mensagem muito longa ({reply.length}/{MAX_REPLY_LENGTH}) — encurte pra poder enviar.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ChatBubble({ message }: { message: UmblerMessage }) {
  const fromChapa = message.source === "Contact";
  const label = fromChapa ? "Chapa" : message.source === "Bot" ? "Bot" : message.senderName ?? "Analista";

  return (
    <div className={`flex flex-col gap-1 ${fromChapa ? "items-start" : "items-end"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
          fromChapa ? "bg-muted text-foreground" : "bg-primary/10 text-foreground"
        }`}
      >
        <div className="text-[10px] font-semibold text-muted-foreground mb-1">{label}</div>
        <ChatBubbleContent message={message} />
      </div>
      <span className="text-[10px] text-muted-foreground px-1">{fmtDateTime(message.eventAtUTC)}</span>
    </div>
  );
}

function ChatBubbleContent({ message }: { message: UmblerMessage }) {
  if (message.messageType === "Image" && message.fileUrl) {
    return (
      <a href={message.fileUrl} target="_blank" rel="noopener noreferrer">
        <img
          src={message.fileUrl}
          alt={message.fileName ?? "Imagem"}
          className="max-h-56 rounded-md object-contain"
        />
      </a>
    );
  }
  if (message.messageType === "Audio" && message.fileUrl) {
    return (
      <div className="space-y-1">
        <audio controls src={message.fileUrl} className="max-w-full h-9" />
        {message.transcription && (
          <p className="text-muted-foreground italic whitespace-pre-wrap">"{message.transcription}"</p>
        )}
      </div>
    );
  }
  if (message.content) {
    return <p className="whitespace-pre-wrap">{message.content}</p>;
  }
  return <p className="text-muted-foreground italic">[{message.messageType}]</p>;
}
