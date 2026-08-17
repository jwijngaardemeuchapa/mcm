import { type UmblerSettings } from "./settings";
import { fmtSP, fmtTime, todayDateISO_SP, tomorrowDateISO_SP } from "./datetime";

const UMBLER_ERROS: [RegExp, string][] = [
  [/401/,                   "Credenciais inválidas — verifique o Bearer Token em Integrações."],
  [/403/,                   "Sem permissão — confirme o organizationId em Integrações."],
  [/422.*phone|phone.*422/, "Número de telefone inválido — corrija o telefone do chapa."],
  [/422/,                   "Dados inválidos — verifique os parâmetros do bot em Integrações."],
  [/429/,                   "Limite de envios atingido — aguarde alguns minutos e tente novamente."],
  [/5\d\d/,                 "Serviço Umbler indisponível — tente novamente em instantes."],
];

export function humanizarErroUmbler(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  for (const [pattern, msg] of UMBLER_ERROS) {
    if (pattern.test(raw)) return msg;
  }
  return `Falha no envio — ${raw.slice(0, 80)}`;
}

export function toInternationalPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) return `+${d}`;
  return `+55${d}`;
}

// Últimos 11 dígitos — mesmo padrão de normalização de telefone já usado em
// applyCentralStatusLocally (src/lib/central.ts), reaproveitado aqui pra
// casar telefone de chapa com `contact.phoneNumber` da Umbler (MCM-159).
export function last11Digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "").slice(-11);
}

export function fmtTaskDateParam(dataTarefa: string): string {
  const taskDate = fmtSP(dataTarefa, "yyyy-MM-dd");
  const time = fmtTime(dataTarefa);
  if (taskDate === todayDateISO_SP()) return `Hoje às ${time}`;
  if (taskDate === tomorrowDateISO_SP()) return `Amanhã às ${time}`;
  return `${fmtSP(dataTarefa, "dd/MM")} às ${time}`;
}

// Link direto pra conversa no painel do Umbler Talk — chatId vem de
// res.json().chat.id na resposta dos 2 endpoints de disparo (template e
// start-bot). Ambos retornam esse shape (confirmado com o schema usado
// pelo projeto saacaptacao, mesma API).
export function umblerChatLink(chatId: string | null | undefined): string | null {
  if (!chatId) return null;
  return `https://app-utalk.umbler.com/chats/${chatId}`;
}

// Corpo de resposta dos 2 endpoints de disparo — shapes DIFERENTES,
// confirmados na doc oficial (app-utalk.umbler.com/api/docs/v1/docs.json):
// - POST /v1/chats/start-bot/ (usado no BID): resposta É o chat em si
//   (schema BasicChatModel/ChatModel) — o id vem na RAIZ (`ModelBase.id`),
//   nunca aninhado em `chat`. A suposição original (`body.chat.id`) sempre
//   falhava aqui — por isso o botão "Conversa" nunca aparecia nos disparos
//   de BID (chatbot), mesmo com o request funcionando.
// - POST /v1/template-messages/simplified/ (usado no FUP): resposta é uma
//   mensagem (SentMessageModel → MessageModel), cujo `chat` é uma
//   referência `{ id }` (ChatIdReferenceModel) — aqui `body.chat.id` está
//   correto.
type UmblerDispatchResponse = Record<string, unknown>;

function pickChatId(body: UmblerDispatchResponse): string | null {
  // Checa `chat.id` primeiro: no shape de mensagem (template-messages),
  // `body.id` também existe mas é o id da PRÓPRIA mensagem (MessagePartModel
  // também herda id de ModelBase) — pegar a raiz primeiro pegaria o id
  // errado. Só cai pra raiz quando não há `chat` aninhado (shape de chat
  // puro, start-bot).
  const chat = body?.chat as Record<string, unknown> | undefined;
  const fromChat = chat?.id;
  if (typeof fromChat === "string") return fromChat;
  const rootId = body?.id;
  if (typeof rootId === "string") return rootId;
  return null;
}

let loggedUnknownShape = false;

async function extractChatId(res: Response): Promise<string | null> {
  try {
    const body = await res.clone().json() as UmblerDispatchResponse;
    const chatId = pickChatId(body);
    if (!chatId && !loggedUnknownShape) {
      loggedUnknownShape = true;
      console.warn("[umbler] resposta de disparo sem chat.id reconhecível (shape mudou?) — corpo real:", body);
    }
    return chatId;
  } catch {
    return null; // resposta sem corpo JSON ou formato inesperado — não é fatal
  }
}

export async function sendUmblerFup({
  chapaNome,
  chapaTelefone,
  dataTarefa,
  empresa,
  settings,
  overrideParams,
  templateIdOverride,
}: {
  chapaNome: string;
  chapaTelefone: string;
  dataTarefa: string;
  empresa: string;
  settings: UmblerSettings;
  overrideParams?: string[];
  templateIdOverride?: string;
}): Promise<{ chatId: string | null }> {
  const toPhone = toInternationalPhone(chapaTelefone);
  const params = overrideParams ?? [fmtTaskDateParam(dataTarefa), empresa];
  const templateId = templateIdOverride ?? settings.templateId;

  const res = await fetch(
    "https://app-utalk.umbler.com/api/v1/template-messages/simplified/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${settings.bearerToken}`,
      },
      body: JSON.stringify({
        fromPhone: settings.fromPhone,
        organizationId: settings.organizationId,
        templateId,
        toPhone,
        params,
        skipReassign: false,
        contactName: chapaNome,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Umbler ${res.status}: ${text}`);
  }
  return { chatId: await extractChatId(res) };
}

// Disparo de BID via chatbot (start-bot): o fluxo do robô já envia o template
// como primeiro passo — as variáveis vão obrigatoriamente em `initialData`.
export async function startUmblerBot({
  chapaTelefone,
  settings,
  initialData,
  botIdOverride,
  triggerNameOverride,
}: {
  chapaTelefone: string;
  settings: UmblerSettings;
  initialData: Record<string, string>;
  botIdOverride?: string;
  triggerNameOverride?: string;
}): Promise<{ chatId: string | null }> {
  const res = await fetch("https://app-utalk.umbler.com/api/v1/chats/start-bot/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${settings.bearerToken}`,
    },
    body: JSON.stringify({
      toPhone: toInternationalPhone(chapaTelefone),
      fromPhone: settings.fromPhone,
      botId: botIdOverride ?? settings.bidBotId,
      triggerName: triggerNameOverride ?? settings.bidBotTriggerName,
      organizationId: settings.organizationId,
      initialData,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Umbler bot ${res.status}: ${text}`);
  }
  return { chatId: await extractChatId(res) };
}

// Últimas mensagens "vivas" de um chat — GET /v1/chats/{id}/relative-messages/.
// NÃO é histórico retroativo completo: a conta tem plano limitado e
// hasMessagesBeforeAllowedOrganizationPlan sempre vem false pra histórico
// antigo (confirmado 04/08/2026, ver G:\Meu Drive\Utilidades\
// umbler_talk_schema.md). Com FromEventUTC=agora + Direction=TakeBefore,
// pega uma janela recente que sempre funciona — suficiente pra "últimas
// mensagens", não uma conversa completa desde o início.
export type UmblerMessage = {
  id: string;
  source: "Contact" | "Member" | "Bot" | string;
  content: string | null;
  messageType: string;
  eventAtUTC: string;
  fileUrl: string | null;
  fileMimeType: string | null;
  fileName: string | null;
  transcription: string | null;
  senderName: string | null;
  // Id do contato que enviou (campo `fromContact` do MessageModel, confirmado
  // no Swagger oficial) — só a Umbler não devolve o NOME junto, só o id.
  // Necessário pra grupo (várias pessoas do lado do cliente); em chat 1:1 com
  // chapa não faz diferença, é sempre a mesma pessoa.
  senderContactId: string | null;
};

function parseUmblerMessage(raw: Record<string, unknown>): UmblerMessage {
  const file = raw.file as Record<string, unknown> | undefined;
  const sentBy = raw.sentByOrganizationMember as Record<string, unknown> | undefined;
  const fromContact = raw.fromContact as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? ""),
    source: String(raw.source ?? "Contact"),
    content: typeof raw.content === "string" ? raw.content : null,
    messageType: String(raw.messageType ?? "Text"),
    eventAtUTC: String(raw.eventAtUTC ?? ""),
    fileUrl: typeof file?.url === "string" ? file.url : null,
    fileMimeType: typeof file?.mimeType === "string" ? file.mimeType : null,
    // Nome do arquivo: código de referência (saacaptacao) não tinha certeza
    // se é `fileName` ou `name` e caía pros dois — mantém o mesmo fallback.
    fileName: typeof file?.fileName === "string" ? file.fileName : typeof file?.name === "string" ? file.name : null,
    transcription: typeof file?.transcription === "string" ? file.transcription : null,
    senderName: typeof sentBy?.name === "string" ? sentBy.name : null,
    senderContactId: typeof fromContact?.id === "string" ? fromContact.id : null,
  };
}

// Cache em memória (por sessão do app) — nome de contato não muda durante o
// uso, evita re-resolver o mesmo id a cada reload do chat de grupo.
const contactNameCache = new Map<string, string>();

// GET /v1/contacts/{id}/ — confirmado no Swagger oficial. Resolve o nome de
// quem mandou uma mensagem de grupo (a API só devolve o id em `fromContact`,
// não o nome, na mensagem em si).
export async function resolveContactName(contactId: string, settings: UmblerSettings): Promise<string | null> {
  const cached = contactNameCache.get(contactId);
  if (cached) return cached;
  try {
    const res = await fetch(`https://app-utalk.umbler.com/api/v1/contacts/${contactId}/`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${settings.bearerToken}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const name = typeof body?.name === "string" ? body.name : null;
    if (name) contactNameCache.set(contactId, name);
    return name;
  } catch {
    return null;
  }
}

export async function fetchUmblerRecentMessages({
  chatId,
  settings,
  take = 15,
}: {
  chatId: string;
  settings: UmblerSettings;
  take?: number;
}): Promise<UmblerMessage[]> {
  const params = new URLSearchParams({
    organizationId: settings.organizationId,
    Take: String(take),
    Direction: "TakeBefore",
    FromEventUTC: new Date().toISOString(),
    IncludeMetadata: "false",
  });
  const res = await fetch(
    `https://app-utalk.umbler.com/api/v1/chats/${chatId}/relative-messages/?${params.toString()}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${settings.bearerToken}` } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Umbler ${res.status}: ${text}`);
  }
  const body = await res.json();
  // Shape do envelope: `{ messages: [...] }` é o que o código de referência
  // (saacaptacao/umbler-chats-list) usa em produção — não confirmado contra
  // payload real capturado, mas é a fonte mais confiável disponível. Mantém
  // fallback pra array direto/items/data caso o formato varie.
  const list: unknown[] = Array.isArray(body?.messages)
    ? body.messages
    : Array.isArray(body)
    ? body
    : Array.isArray(body?.items) ? body.items
    : Array.isArray(body?.data) ? body.data
    : [];
  // Ordena explicitamente por eventAtUTC — não confiar na ordem do array
  // retornado pela API (o próprio código de referência assume oldest-first
  // sem confirmação, e o parâmetro é Direction=TakeBefore, que sugere o
  // contrário).
  return list
    .map((m) => parseUmblerMessage(m as Record<string, unknown>))
    .sort((a, b) => a.eventAtUTC.localeCompare(b.eventAtUTC));
}

// Mensagem de texto livre — só funciona dentro da janela de 24h
// (chapa confirmado já respondeu, então a janela está aberta).
export async function sendUmblerFreeText({
  chapaTelefone,
  message,
  file,
  settings,
}: {
  chapaTelefone: string;
  message: string;
  // Anexo (imagem/áudio/documento) — enviado como multipart/form-data direto
  // pro campo `File` do endpoint (confirmado no schema OpenAPI oficial:
  // app-utalk.umbler.com/api/docs/v1/docs.json → CreateMessageSimplifiedModel
  // aceita multipart/form-data com File binário). Não precisa de hospedagem
  // externa — a Umbler recebe o binário na própria requisição.
  file?: File;
  settings: UmblerSettings;
}): Promise<void> {
  const toPhone = toInternationalPhone(chapaTelefone);
  let body: BodyInit;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${settings.bearerToken}`,
  };

  if (file) {
    const form = new FormData();
    form.set("ToPhone", toPhone);
    form.set("FromPhone", settings.fromPhone);
    form.set("OrganizationId", settings.organizationId);
    if (message) form.set("Message", message);
    form.set("File", file, file.name);
    body = form;
    // Não define Content-Type: o browser gera o boundary do multipart sozinho.
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      toPhone,
      fromPhone: settings.fromPhone,
      organizationId: settings.organizationId,
      message,
    });
  }

  const res = await fetch("https://app-utalk.umbler.com/api/v1/messages/simplified/", {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Umbler msg ${res.status}: ${text}`);
  }
}

// Grupo (chat do cliente) não tem telefone individual pra usar o endpoint
// "simplified" (exige ToPhone) — confirmado no Swagger oficial
// (app-utalk.umbler.com/api/docs/v1/docs.json) que POST /v1/messages/
// (não o /simplified/) aceita ChatId direto em vez de telefone, mesmo
// schema de anexo (multipart, campo File binário).
export async function sendUmblerGroupMessage({
  chatId,
  message,
  file,
  settings,
}: {
  chatId: string;
  message: string;
  file?: File;
  settings: UmblerSettings;
}): Promise<void> {
  let body: BodyInit;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${settings.bearerToken}`,
  };

  if (file) {
    const form = new FormData();
    form.set("ChatId", chatId);
    form.set("OrganizationId", settings.organizationId);
    if (message) form.set("Message", message);
    form.set("File", file, file.name);
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({
      chatId,
      organizationId: settings.organizationId,
      message,
    });
  }

  const res = await fetch("https://app-utalk.umbler.com/api/v1/messages/", {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Umbler msg grupo ${res.status}: ${text}`);
  }
}

// ── Busca de chat de grupo (cliente) por telefone/nome — MCM-137 fase 2 ──
//
// Confirmado no Swagger oficial (app-utalk.umbler.com/api/docs/v1/docs.json):
// GET /v1/chats/ tem um parâmetro `ContactTypes` (array de `ContactType`:
// DirectMessage|Group|MemberDirectMessage|MemberGroup) que filtra grupo
// DIRETO no servidor — não existe (e nunca existiu) um "canal próprio" pra
// grupo, era engano da versão anterior: grupo usa o mesmo canal WhatsApp de
// sempre, o que muda é `contact.contactType === "Group"`. Também dá pra
// combinar com `Searchtext` pra busca por nome direto no servidor.

export type UmblerChatSummary = {
  id: string;
  contactName: string;
  contactPhone: string | null;
  lastMessagePreview: string | null;
  lastMessageAtUTC: string | null;
};

function parseChatSummary(raw: Record<string, unknown>): UmblerChatSummary {
  const contact = raw.contact as Record<string, unknown> | undefined;
  const lastMessage = raw.lastMessage as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? ""),
    contactName: typeof contact?.name === "string" ? contact.name : "",
    contactPhone: typeof contact?.phoneNumber === "string" ? contact.phoneNumber : null,
    lastMessagePreview: typeof lastMessage?.content === "string" ? lastMessage.content : null,
    lastMessageAtUTC: typeof lastMessage?.eventAtUTC === "string" ? lastMessage.eventAtUTC : null,
  };
}

// Uma página da listagem de chats de grupo — GET /v1/chats/, filtrado no
// servidor por ContactTypes=Group. `ChatState=All` pra não perder grupo já
// resolvido/fechado.
async function fetchUmblerGroupChatsPage({
  settings,
  searchText,
  skip,
  take,
}: {
  settings: UmblerSettings;
  searchText?: string;
  skip: number;
  take: number;
}): Promise<UmblerChatSummary[]> {
  const params = new URLSearchParams({
    organizationId: settings.organizationId,
    ChatState: "All",
    Take: String(take),
    Skip: String(skip),
  });
  params.append("ContactTypes", "Group");
  if (searchText) params.set("Searchtext", searchText);
  const res = await fetch(`https://app-utalk.umbler.com/api/v1/chats/?${params.toString()}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${settings.bearerToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Umbler ${res.status}: ${text}`);
  }
  const body = await res.json();
  const list: unknown[] = Array.isArray(body) ? body
    : Array.isArray(body?.items) ? body.items
    : Array.isArray(body?.chats) ? body.chats
    : [];
  return list.map((c) => parseChatSummary(c as Record<string, unknown>));
}

// ── Chats com mensagem não lida — MCM-159 (notificação de "novo WhatsApp"
// mesmo com a tarefa/painel fechado) ──
//
// A Umbler já calcula `totalUnread` server-side por chat — não precisa
// diffar timestamp/id local, só ler o campo. `contact.phoneNumber` casa com
// chapa (telefone_chapa). Pro grupo do cliente: `cliente_book.umbler_group_chat_id`
// guarda o `chat.id` (ModelBase.id, raiz — confirmado em GroupChatPicker.tsx,
// que persiste `chat.id` no vínculo, o MESMO id usado em umblerChatLink/
// sendUmblerGroupMessage) — não `contact.groupIdentifier` (esse é outro
// identificador, do WhatsApp, que este app não guarda em lugar nenhum).
// Por isso o match de grupo aqui usa `chatId` (raiz), não `groupIdentifier`.
export type UmblerUnreadChat = {
  chatId: string | null;
  phoneNumber: string | null;
  totalUnread: number;
};

function parseUnreadChat(raw: Record<string, unknown>): UmblerUnreadChat {
  const contact = raw.contact as Record<string, unknown> | undefined;
  return {
    chatId: typeof raw.id === "string" ? raw.id : null,
    phoneNumber: typeof contact?.phoneNumber === "string" ? contact.phoneNumber : null,
    totalUnread: typeof raw.totalUnread === "number" ? raw.totalUnread : 0,
  };
}

// Busca de chats com mensagem não lida — melhor esforço, chamada num polling
// em background (WatcherContext). Silencioso em falha (mesmo padrão de
// resolveContactName acima): não pode derrubar o watcher nem gerar toast de
// erro por uma checagem periódica que roda sozinha.
export async function fetchUmblerUnreadChats({
  settings,
  maxPages = 5,
  pageSize = 100,
}: {
  settings: UmblerSettings;
  maxPages?: number;
  pageSize?: number;
}): Promise<UmblerUnreadChat[]> {
  const results: UmblerUnreadChat[] = [];
  try {
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        organizationId: settings.organizationId,
        ChatState: "Open",
        Order: "Desc",
        ChatOrderBy: "LastMessageAt",
        Take: String(pageSize),
        Skip: String(page * pageSize),
      });
      const res = await fetch(`https://app-utalk.umbler.com/api/v1/chats/?${params.toString()}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${settings.bearerToken}` },
      });
      if (!res.ok) break;
      const body = await res.json();
      const list: unknown[] = Array.isArray(body) ? body
        : Array.isArray(body?.items) ? body.items
        : Array.isArray(body?.chats) ? body.chats
        : [];
      if (list.length === 0) break;
      for (const raw of list) {
        const chat = parseUnreadChat(raw as Record<string, unknown>);
        if (chat.totalUnread > 0) results.push(chat);
      }
      if (list.length < pageSize) break; // última página
    }
  } catch {
    return []; // best-effort — watcher segue dormente até o próximo tick
  }
  return results;
}

// Busca os chats de grupo, opcionalmente filtrando por termo (nome ou
// telefone). `Searchtext` já filtra nome no servidor; a checagem local cobre
// telefone (não coberto por Searchtext) e serve de rede de segurança.
export async function searchUmblerGroupChats({
  settings,
  query,
  maxPages = 5,
  pageSize = 100,
}: {
  settings: UmblerSettings;
  query?: string;
  maxPages?: number;
  pageSize?: number;
}): Promise<UmblerChatSummary[]> {
  const q = query?.trim().toLowerCase() ?? "";
  const qDigits = q.replace(/\D/g, "");
  const results: UmblerChatSummary[] = [];
  for (let page = 0; page < maxPages; page++) {
    const chats = await fetchUmblerGroupChatsPage({ settings, searchText: query?.trim(), skip: page * pageSize, take: pageSize });
    if (chats.length === 0) break;
    for (const chat of chats) {
      if (q) {
        const nameMatch = chat.contactName.toLowerCase().includes(q);
        const phoneMatch = qDigits && (chat.contactPhone ?? "").replace(/\D/g, "").includes(qDigits);
        if (!nameMatch && !phoneMatch) continue;
      }
      results.push(chat);
    }
    if (chats.length < pageSize) break; // última página
  }
  return results;
}
