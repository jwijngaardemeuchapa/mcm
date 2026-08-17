import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent } from "react";
import { ExternalLink, Loader2, RefreshCw, Send, Bot, Paperclip, X, FileText, ChevronDown, Pencil, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { fetchUmblerRecentMessages, sendUmblerFreeText, humanizarErroUmbler, umblerChatLink, resolveContactName, type UmblerMessage } from "@/lib/umbler";
import { readSettings, writeSettings, type UmblerSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/datetime";

const ATTACHMENT_ACCEPT = "image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx";
const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024; // limite prático do WhatsApp pra mídia/documento

const TAKE = 30;
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
  // Grupo (cliente) tem várias pessoas do lado "Contact" — precisa resolver
  // nome por mensagem em vez do rótulo genérico "Chapa" usado no 1:1.
  isGroup?: boolean;
};

// Últimas mensagens de um chat do Umbler Talk — texto, imagem e áudio, mais
// composer de resposta. Sem wrapper de Sheet/Dialog — usado tanto dentro de
// um painel dedicado quanto (via ChatSheet) num Sheet lateral.
export const ConversationPane = forwardRef<ConversationPaneHandle, ConversationPaneProps>(
  function ConversationPane({ chatId, personName, personTelefone, settings, isGroup }, ref) {
    const [messages, setMessages] = useState<UmblerMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reply, setReply] = useState("");
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
    const [contactNames, setContactNames] = useState<Record<string, string>>({});
    // Atalhos de mensagem — mesmo mecanismo (e mesma lista salva) já usado
    // no "Mensagem personalizada" do TaskCard (Cards): settings globais,
    // clique só preenche o composer, nunca envia sozinho.
    const [msgTemplates, setMsgTemplates] = useState<string[]>(() => readSettings().customMsgTemplates);
    const [shortcutsOpen, setShortcutsOpen] = useState(true);
    const [editingTplIdx, setEditingTplIdx] = useState<number | null>(null);
    const [editingTplText, setEditingTplText] = useState("");
    function persistTemplates(next: string[]) {
      setMsgTemplates(next);
      writeSettings({ customMsgTemplates: next });
    }
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Blob URLs criadas só pro eco otimista (ver handleSend) — revogadas
    // assim que o próximo load() troca a lista inteira por dados reais.
    const optimisticUrlsRef = useRef<string[]>([]);

    function scrollToBottom(smooth = false) {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    }

    function load() {
      if (!chatId) return;
      setLoading(true);
      setError(null);
      fetchUmblerRecentMessages({ chatId, settings, take: TAKE })
        .then((msgs) => {
          for (const url of optimisticUrlsRef.current) URL.revokeObjectURL(url);
          optimisticUrlsRef.current = [];
          setMessages(msgs);
          // Chat sempre abre com o scroll no fim (mensagem mais recente). Um
          // rAF só não bastava: o painel (TaskDetailPanel) entra com uma
          // animação de slide-in de 300ms, então a altura medida logo depois
          // do setMessages ainda reflete o layout em transição — reforça o
          // scroll de novo depois da animação terminar.
          requestAnimationFrame(() => scrollToBottom(false));
          setTimeout(() => scrollToBottom(false), 350);
          if (isGroup) resolveGroupSenderNames(msgs);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setLoading(false));
    }

    // Grupo: a API só devolve o id de quem mandou (`senderContactId`), não o
    // nome — resolve um por um (cache em `umbler.ts` evita repetir a mesma
    // pessoa em reloads seguintes do mesmo chat).
    function resolveGroupSenderNames(msgs: UmblerMessage[]) {
      const ids = Array.from(new Set(
        msgs.filter((m) => m.source === "Contact" && m.senderContactId).map((m) => m.senderContactId as string),
      ));
      for (const id of ids) {
        resolveContactName(id, settings).then((name) => {
          if (name) setContactNames((prev) => (prev[id] ? prev : { ...prev, [id]: name }));
        });
      }
    }

    useEffect(() => {
      setMessages([]);
      setError(null);
      setReply("");
      setSendError(null);
      clearAttachment();
      if (chatId) load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatId]);

    // Revoga a object URL de preview ao desmontar ou trocar de arquivo, senão vaza memória.
    useEffect(() => {
      return () => {
        if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      };
    }, [pendingPreviewUrl]);

    // Revoga qualquer blob URL de eco otimista que ainda não tenha sido
    // limpa por um load() bem-sucedido, ao desmontar o painel.
    useEffect(() => {
      return () => {
        for (const url of optimisticUrlsRef.current) URL.revokeObjectURL(url);
      };
    }, []);

    function clearAttachment() {
      setPendingFile((prev) => {
        if (prev) setPendingPreviewUrl((url) => { if (url) URL.revokeObjectURL(url); return null; });
        return null;
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function handleAttachChange(e: ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setSendError(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB) — limite de ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setSendError(null);
      setPendingFile(file);
      setPendingPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    }

    useImperativeHandle(ref, () => ({
      fillReply: (text: string) => setReply((prev) => (prev ? `${prev}\n${text}` : text)),
    }), []);

    const hoursSinceContact = hoursSinceLastContactMessage(messages);
    const windowOpen = hoursSinceContact === null ? null : hoursSinceContact < REPLY_WINDOW_HOURS;
    const overLimit = reply.length > MAX_REPLY_LENGTH;

    async function handleSend() {
      const text = reply.trim();
      const fileSent = pendingFile;
      if ((!text && !fileSent) || !personTelefone || sending || overLimit || windowOpen === false) return;
      setSending(true);
      setSendError(null);
      try {
        await sendUmblerFreeText({ chapaTelefone: personTelefone, message: text, file: fileSent ?? undefined, settings });
        // Eco otimista: o GET relative-messages pode demorar alguns segundos
        // pra devolver a mensagem recém-enviada — sem isso, imagem/áudio
        // enviados ficavam sem NENHUM preview até o reload seguinte pegar a
        // versão definitiva (bug reportado: "chat não mostra preview de
        // imagem enviada"). Usa uma blob URL própria — a de pendingPreviewUrl
        // já é revogada por clearAttachment() logo abaixo. Também cobre
        // mensagem só-texto agora: a Umbler não devolve o nome de quem
        // enviou via essa API simples (sentByOrganizationMember vem vazio),
        // então sem isso o remetente aparecia como "Analista" genérico —
        // aqui a gente SABE quem mandou (o operador desta máquina).
        const { operadorNome } = readSettings();
        const optimistic: UmblerMessage = {
          id: `local-${Date.now()}`,
          source: "Member",
          content: text || null,
          messageType: fileSent
            ? fileSent.type.startsWith("image/")
              ? "Image"
              : fileSent.type.startsWith("audio/")
                ? "Audio"
                : "Document"
            : "Text",
          eventAtUTC: new Date().toISOString(),
          fileUrl: fileSent ? URL.createObjectURL(fileSent) : null,
          fileMimeType: fileSent?.type || null,
          fileName: fileSent?.name ?? null,
          transcription: null,
          senderName: operadorNome || null,
          senderContactId: null,
        };
        if (fileSent && optimistic.fileUrl) optimisticUrlsRef.current.push(optimistic.fileUrl);
        setMessages((prev) => [...prev, optimistic]);
        requestAnimationFrame(() => scrollToBottom(true));
        setReply("");
        clearAttachment();
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto p-3 space-y-3">
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
            <ChatBubble key={m.id} message={m} isGroup={isGroup} contactNames={contactNames} />
          ))}
        </div>
        </div>
        {personTelefone && (
          <div className="border-t border-border p-2.5 shrink-0">
          <div className="max-w-3xl mx-auto space-y-2">
            {windowOpen === false && (
              <div className="text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-md px-2 py-1.5">
                Janela de 24h fechada — o chapa não responde há mais de 24h. Envio de texto livre bloqueado; use um template (FUP/BID) pra reabrir a conversa.
              </div>
            )}
            {sendError && (
              <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-2 py-1.5">
                {sendError}
              </div>
            )}
            {msgTemplates.length > 0 && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setShortcutsOpen((o) => !o)}
                  className="flex items-center gap-1.5 w-full text-left"
                >
                  <span className="text-[10px] font-medium text-muted-foreground">Atalhos</span>
                  <span className="text-[9px] text-muted-foreground/60 bg-muted rounded-full px-1.5 py-0.5 leading-none tabular-nums">
                    {msgTemplates.length}
                  </span>
                  <ChevronDown className={`h-3 w-3 text-muted-foreground/50 ml-auto transition-transform duration-150 ${shortcutsOpen ? "rotate-180" : ""}`} />
                </button>
                {shortcutsOpen && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {msgTemplates.map((tpl, idx) =>
                      editingTplIdx === idx ? (
                        <div key={idx} className="flex items-center gap-1.5 w-full">
                          <Input
                            value={editingTplText}
                            onChange={(e) => setEditingTplText(e.target.value)}
                            className="h-7 text-xs flex-1"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingTplText.trim()) {
                                persistTemplates(msgTemplates.map((t, i) => (i === idx ? editingTplText.trim() : t)));
                                setEditingTplIdx(null);
                              }
                              if (e.key === "Escape") setEditingTplIdx(null);
                            }}
                          />
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-success" disabled={!editingTplText.trim()}
                            onClick={() => { persistTemplates(msgTemplates.map((t, i) => (i === idx ? editingTplText.trim() : t))); setEditingTplIdx(null); }}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={() => setEditingTplIdx(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div key={idx} className="group relative inline-flex items-center max-w-[calc(50%-4px)]">
                          <button
                            type="button"
                            onClick={() => { setReply(tpl); setShortcutsOpen(false); }}
                            title={tpl}
                            className="inline-flex items-center rounded-full border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 pl-2.5 pr-7 py-1 text-[11px] transition-colors w-full truncate"
                          >
                            {tpl}
                          </button>
                          <div className="absolute right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button type="button" title="Editar" className="text-muted-foreground/50 hover:text-primary transition-colors"
                              onClick={(e) => { e.stopPropagation(); setEditingTplIdx(idx); setEditingTplText(tpl); }}>
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                            <button type="button" title="Excluir" className="text-muted-foreground/50 hover:text-destructive transition-colors"
                              onClick={(e) => { e.stopPropagation(); persistTemplates(msgTemplates.filter((_, i) => i !== idx)); }}>
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            )}
            {pendingFile && (
              <div className="flex items-center gap-2 bg-muted rounded-md px-2 py-1.5">
                {pendingPreviewUrl ? (
                  <img src={pendingPreviewUrl} alt={pendingFile.name} className="h-9 w-9 rounded object-cover shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="text-[11px] truncate flex-1">{pendingFile.name}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={clearAttachment} disabled={sending} title="Remover anexo">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileInputRef} type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleAttachChange} />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || windowOpen === false}
                title="Anexar imagem, áudio ou documento"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={windowOpen === false ? "Janela de 24h fechada — use um template pra reabrir" : "Responder"}
                className="min-h-9 h-9 max-h-24 resize-none text-xs"
                disabled={sending || windowOpen === false}
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={sending || (!reply.trim() && !pendingFile) || overLimit || windowOpen === false}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                disabled={!reply.trim() || msgTemplates.includes(reply.trim())}
                className="text-[10px] text-primary hover:underline disabled:opacity-40 disabled:no-underline flex items-center gap-1"
                onClick={() => persistTemplates([...msgTemplates, reply.trim()])}
              >
                <Plus className="h-3 w-3" /> Salvar como atalho
              </button>
              {overLimit && (
                <p className="text-[10px] text-destructive">
                  Mensagem muito longa ({reply.length}/{MAX_REPLY_LENGTH}) — encurte pra poder enviar.
                </p>
              )}
            </div>
          </div>
          </div>
        )}
      </div>
    );
  },
);

function ChatBubble({ message, isGroup, contactNames }: { message: UmblerMessage; isGroup?: boolean; contactNames?: Record<string, string> }) {
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
  // Grupo: várias pessoas do lado do cliente — mostra o nome real (resolvido
  // por id) em vez do rótulo genérico "Chapa", que só faz sentido no 1:1.
  const groupSenderName = isGroup && message.senderContactId ? contactNames?.[message.senderContactId] : undefined;
  const label = fromChapa ? (isGroup ? (groupSenderName ?? "…") : "Chapa") : (message.senderName || "Analista");

  return (
    <div className={`flex flex-col gap-1 ${fromChapa ? "items-start" : "items-end"}`}>
      <div
        className={`max-w-[70%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
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
