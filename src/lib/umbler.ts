import { type UmblerSettings } from "./settings";
import { fmtSP, fmtTime, todayDateISO_SP, tomorrowDateISO_SP } from "./datetime";

const UMBLER_ERROS: [RegExp, string][] = [
  [/401/,                   "Credenciais inválidas — verifique o Bearer Token em Integrações."],
  [/403/,                   "Sem permissão — confirme o organizationId em Integrações."],
  [/404/,                   "Bot ou trigger não encontrado — confirme o Bot ID e Trigger Name em Integrações."],
  // 4436 = contato já tem conversa ativa com o bot (UTalk internal code) — deve vir antes de /422/
  [/4436/,                  "Contato já possui conversa ativa — aguarde encerramento ou finalize no UTalk."],
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
}): Promise<void> {
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
}): Promise<void> {
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

  const text = await res.text().catch(() => res.statusText);
  if (!res.ok) {
    throw new Error(`Umbler bot ${res.status}: ${text}`);
  }
  // UTalk pode retornar HTTP 200 com erro no body (ex: {"code":4436,...})
  try {
    const json = JSON.parse(text);
    const code = json?.code ?? json?.error?.code ?? json?.data?.code;
    if (code && code !== 200) throw new Error(`Umbler bot ${code}: ${json?.message ?? json?.error?.message ?? text}`);
  } catch (parseErr) {
    if (parseErr instanceof SyntaxError) { /* body não é JSON — OK */ }
    else throw parseErr;
  }
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
