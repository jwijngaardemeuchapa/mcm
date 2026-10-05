import { toast } from "sonner";
import { readSettings, type MensagemPosConfirmacaoSettings } from "./settings";
import { sendUmblerFreeText } from "./umbler";

// "prefup"/"fup": o próprio chapa respondeu SIM (Firestore ou leitura do chat);
// "manual": o analista clicou em confirmar.
export type OrigemConfirmacao = "prefup" | "fup" | "manual";

export type AlvoMensagem = {
  idTarefa: number;
  chapaId: string;
  nome: string | null;
  telefone: string | null;
};

// Decisão pura: qual texto enviar (ou null se não deve enviar nada).
export function mensagemParaEnviar(
  cfg: MensagemPosConfirmacaoSettings,
  origem: OrigemConfirmacao,
): string | null {
  if (!cfg.ativo || !cfg.gatilhos[origem]) return null;
  const texto = cfg.mensagens.find((m) => m.id === cfg.mensagemAtivaId)?.texto.trim();
  return texto || null;
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
      const texto = mensagemParaEnviar(readSettings().mensagemPosConfirmacao, origem);
      if (!texto || alvos.length === 0) return;
      let enviadas = 0;
      const falhas: string[] = [];
      for (const alvo of alvos) {
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
