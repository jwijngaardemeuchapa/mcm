import { toast } from "sonner";
import { normalizeCompany } from "./company";
import { readSettings, type MensagemAutomatica, type MensagemPosConfirmacaoSettings } from "./settings";
import { sendUmblerFreeText } from "./umbler";

// "prefup"/"fup": o próprio chapa respondeu SIM (Firestore ou leitura do chat);
// "manual": o analista clicou em confirmar.
export type OrigemConfirmacao = "prefup" | "fup" | "manual";

export type AlvoMensagem = {
  idTarefa: number;
  chapaId: string;
  nome: string | null;
  telefone: string | null;
  // Empresa da tarefa — decide se existe mensagem específica pra ela.
  empresa: string | null;
};

// Mensagem específica da empresa (uma que lista essa empresa em `empresas`).
// A comparação é a mesma tolerante usada na Carteira (normalizeCompany: sem
// acento, sem "LTDA/S.A."); se mais de uma casar, vale a mais precisa —
// nome idêntico ganha de nome contido, e entre contidos o mais longo.
export function mensagemDaEmpresa(
  mensagens: MensagemAutomatica[],
  empresa: string | null | undefined,
): MensagemAutomatica | null {
  const e = normalizeCompany(empresa);
  if (!e) return null;
  let melhor: { msg: MensagemAutomatica; score: number } | null = null;
  for (const msg of mensagens) {
    for (const nome of msg.empresas ?? []) {
      const n = normalizeCompany(nome);
      if (!n) continue;
      let score: number;
      if (e === n) score = 1000 + n.length;
      else if (e.includes(n) || n.includes(e)) score = n.length;
      else continue;
      if (!melhor || score > melhor.score) melhor = { msg, score };
    }
  }
  return melhor?.msg ?? null;
}

// Decisão pura: qual texto enviar (ou null se não deve enviar nada). A
// mensagem da empresa tem prioridade; as demais empresas recebem a ativa
// (padrão). Mensagem específica sem texto cai pra padrão em vez de calar.
export function mensagemParaEnviar(
  cfg: MensagemPosConfirmacaoSettings,
  origem: OrigemConfirmacao,
  empresa?: string | null,
): string | null {
  if (!cfg.ativo || !cfg.gatilhos[origem]) return null;
  const especifica = mensagemDaEmpresa(cfg.mensagens, empresa)?.texto.trim();
  if (especifica) return especifica;
  const padrao = cfg.mensagens.find((m) => m.id === cfg.mensagemAtivaId)?.texto.trim();
  return padrao || null;
}

// Uma vez por chapa/tarefa: reabrir e confirmar de novo (ou a mesma resposta
// chegar por dois caminhos) não manda a mensagem duas vezes.
const chaveEnviado = (a: AlvoMensagem) => `msg_pos_confirmacao_${a.idTarefa}_${a.chapaId}`;

async function enviarUma(alvo: AlvoMensagem, texto: string): Promise<"enviada" | "ja_enviada" | "falha"> {
  const { umblerSettings } = readSettings();
  if (!alvo.telefone || !umblerSettings.bearerToken) return "falha";
  const chave = chaveEnviado(alvo);
  try {
    if (localStorage.getItem(chave)) return "ja_enviada";
    localStorage.setItem(chave, new Date().toISOString());
  } catch {
    /* sem localStorage: segue sem a trava de duplicidade */
  }
  try {
    await sendUmblerFreeText({ chapaTelefone: alvo.telefone, message: texto, settings: umblerSettings });
    return "enviada";
  } catch {
    try {
      localStorage.removeItem(chave);
    } catch {
      /* noop */
    }
    return "falha";
  }
}

// Fire-and-forget: nunca lança nem atrasa a confirmação que já aconteceu.
export function enviarMensagemPosConfirmacao(alvos: AlvoMensagem[], origem: OrigemConfirmacao): void {
  void (async () => {
    try {
      const cfg = readSettings().mensagemPosConfirmacao;
      let enviadas = 0;
      const falhas: string[] = [];
      for (const alvo of alvos) {
        const texto = mensagemParaEnviar(cfg, origem, alvo.empresa);
        if (!texto) continue;
        const r = await enviarUma(alvo, texto);
        if (r === "enviada") enviadas++;
        else if (r === "falha") falhas.push(alvo.nome ?? "chapa");
      }
      if (enviadas > 0) {
        toast.success(
          alvos.length === 1
            ? `Mensagem automática enviada — ${alvos[0].nome ?? "chapa"}`
            : `Mensagem automática enviada para ${enviadas} chapa(s)`,
        );
      }
      if (falhas.length > 0) {
        toast.warning(`Mensagem automática não enviada: ${falhas.join(", ")}`, { duration: 8_000 });
      }
    } catch {
      /* best-effort */
    }
  })();
}
