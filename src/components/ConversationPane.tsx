import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Send, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchUmblerRecentMessages, sendUmblerFreeText, humanizarErroUmbler, umblerChatLink, type UmblerMessage } from "@/lib/umbler";
import { type UmblerSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/datetime";

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

export type ConversationPaneHandle = {
  // Preenche o composer sem enviar — todo atalho que insere texto (lista de
  // alocados, resposta rápida etc.) só digita; o Enter fica com o analista.
  fillReply: (text: string) => void;
};

type ConversationPaneProps = {
  chatId: string | null;
  personName: string;
  personTelefone: string | null;
  settings: UmblerSettings;
};

// Últimas mensagens de um chat do Umbler Talk — texto, imagem e áudio, mais
// composer de resposta. Sem wrapper de Sheet/Dialog — usado tanto dentro de
// um painel dedicado quanto (via ChatSheet) num Sheet lateral.
export const ConversationPane = forwardRef<ConversationPaneHandle, ConversationPaneProps>(
  function ConversationPane({ chatId, personName, personTelefone, settings }, ref) {
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
      setMessages([]);
      setError(null);
      setReply("");
      setSendError(null);
      if (chatId) load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatId]);

    useImperativeHandle(ref, () => ({
      fillReply: (text: string) => setReply((prev) => (prev ? `${prev}\n${text}` : text)),
    }), []);

    const hoursSinceContact = hoursSinceLastContactMessage(messages);
    const windowOpen = hoursSinceContact === null ? null : hoursSinceContact < REPLY_WINDOW_HOURS;
    const overLimit = reply.length > MAX_REPLY_LENGTH;

    async function handleSend() {
      const text = reply.trim();
      if (!text || !personTelefone || sending || overLimit) return;
      setSending(true);
      setSendError(null);
      try {
        await sendUmblerFreeText({ chapaTelefone: personTelefone, message: text, settings });
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
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{personName}</p>
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
        <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
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
        {personTelefone && (
          <div className="border-t border-border p-2.5 space-y-2 shrink-0">
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
                placeholder={windowOpen === false ? "Janela de 24h fechada — envio pode falhar" : "Responder"}
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
      </div>
    );
  },
);

function ChatBubble({ message }: { message: UmblerMessage }) {
  // Mensagens de Bot não são conversa entre pessoas — vira um aviso de
  // sistema centralizado, igual WhatsApp mostra mudança de assunto/grupo,
  // em vez de balão como se fosse alguém falando.
  if (message.source === "Bot") {
    return (
      <div className="flex flex-col items-center gap-0.5 py-1">
        <span className="inline-flex items-center gap-1.5 max-w-[90%] text-[11px] text-muted-foreground bg-muted/50 rounded-full px-3 py-1 text-center">
          <Bot className="h-3 w-3 shrink-0" />
          <ChatBubbleContent message={message} />
        </span>
        <span className="text-[9px] text-muted-foreground">{fmtDateTime(message.eventAtUTC)}</span>
      </div>
    );
  }

  const fromChapa = message.source === "Contact";
  const label = fromChapa ? "Chapa" : (message.senderName || "Analista");

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
