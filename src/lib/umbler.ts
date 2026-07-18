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

// Corpo de resposta comum aos 2 endpoints de disparo — só nos interessa
// chat.id, resto do payload é ignorado.
type UmblerDispatchResponse = { chat?: { id?: string | null } };

async function extractChatId(res: Response): Promise<string | null> {
  try {
    const body = await res.clone().json() as UmblerDispatchResponse;
    return body?.chat?.id ?? null;
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
