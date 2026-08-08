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
};

function parseUmblerMessage(raw: Record<string, unknown>): UmblerMessage {
  const file = raw.file as Record<string, unknown> | undefined;
  const sentBy = raw.sentByOrganizationMember as Record<string, unknown> | undefined;
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
  };
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
  settings,
}: {
  chapaTelefone: string;
  message: string;
  settings: UmblerSettings;
}): Promise<void> {
  const res = await fetch("https://app-utalk.umbler.com/api/v1/messages/simplified/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${settings.bearerToken}`,
    },
    body: JSON.stringify({
      toPhone: toInternationalPhone(chapaTelefone),
      fromPhone: settings.fromPhone,
      organizationId: settings.organizationId,
      message,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Umbler msg ${res.status}: ${text}`);
  }
}
