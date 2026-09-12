import { getDb } from "./db";
import { pushChatLinkToCentral } from "./central";

export type ChatLinkParams = {
  id_tarefa: number;
  telefone_chapa: string | null;
  cpf: string | null;
  nome_chapa: string | null;
  umbler_chat_id: string;
  canal: string | null;
};

function telefoneDigits(raw: string | null): string {
  return (raw ?? "").replace(/\D/g, "");
}

// Grava/atualiza o "chat atual conhecido" pra este chapa nesta tarefa (tabela
// chat_links, ver migration em src-tauri/src/lib.rs) e espelha na Central —
// permite a OUTRO analista, em outra máquina, abrir a mesma conversa mesmo
// sem ter disparado nada ele mesmo (ver PROBLEMA no topo do plano da feature).
// Sem UNIQUE constraint na tabela (cpf/telefone podem faltar em qualquer
// combinação): busca uma linha existente pra este id_tarefa por cpf (se os
// dois tiverem) senão por telefone normalizado — mesmo padrão tolerante já
// usado em pullCentralStatus/applyCentralStatusLocally (central.ts) — e
// faz UPDATE nela; sem match, INSERT. Best-effort silencioso: nunca deve
// bloquear ou atrasar o disparo que já aconteceu.
export async function upsertChatLink(params: ChatLinkParams): Promise<void> {
  try {
    const db = await getDb();
    const now = new Date().toISOString();

    let existing: { rowid: number }[] = [];
    if (params.cpf) {
      existing = await db.select<{ rowid: number }[]>(
        `SELECT rowid FROM chat_links WHERE id_tarefa = ? AND cpf = ? LIMIT 1`,
        [params.id_tarefa, params.cpf],
      );
    } else {
      const digits = telefoneDigits(params.telefone_chapa);
      if (digits) {
        existing = await db.select<{ rowid: number }[]>(
          `SELECT rowid FROM chat_links WHERE id_tarefa = ?
             AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telefone_chapa,''),'(',''),')',''),'-',''),' ','') LIKE ?
           LIMIT 1`,
          [params.id_tarefa, `%${digits.slice(-11)}`],
        );
      }
    }

    if (existing.length > 0) {
      await db.execute(
        `UPDATE chat_links SET telefone_chapa = ?, cpf = COALESCE(?, cpf), nome_chapa = ?, umbler_chat_id = ?, canal = ?, atualizado_em = ? WHERE rowid = ?`,
        [params.telefone_chapa, params.cpf, params.nome_chapa, params.umbler_chat_id, params.canal, now, existing[0].rowid],
      );
    } else {
      await db.execute(
        `INSERT INTO chat_links (id_tarefa, telefone_chapa, cpf, nome_chapa, umbler_chat_id, canal, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [params.id_tarefa, params.telefone_chapa, params.cpf, params.nome_chapa, params.umbler_chat_id, params.canal, now],
      );
    }
  } catch {
    // Best-effort — nunca bloqueia o disparo local, que já aconteceu antes desta chamada.
  }

  pushChatLinkToCentral(params); // fire-and-forget, best-effort silencioso (ver central.ts)
}

export type ChatLinkRow = {
  id_tarefa: number;
  telefone_chapa: string | null;
  cpf: string | null;
  nome_chapa: string | null;
  umbler_chat_id: string;
  canal: string | null;
  atualizado_em: string;
};

function last11(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "").slice(-11);
}

// Acha, dentro dos chat_links já carregados pra tarefa, o vínculo mais
// recente pra UM chapa específico — mesmo match tolerante (cpf se os dois
// tiverem, senão telefone normalizado) usado em upsertChatLink/
// applyChatLinksLocally. Usado por TaskCard.tsx e TaskDetailPanel.tsx pra
// mesclar com o histórico de fup_log na hora de decidir qual chat mostrar.
export function findChatLinkForChapa(
  chatLinks: ChatLinkRow[] | undefined,
  chapa: { cpf?: string | null; telefone_chapa?: string | null },
): ChatLinkRow | null {
  if (!chatLinks || chatLinks.length === 0) return null;
  const matches = chatLinks.filter((cl) => {
    if (chapa.cpf && cl.cpf) return chapa.cpf === cl.cpf;
    const chapaDigits = last11(chapa.telefone_chapa);
    const clDigits = last11(cl.telefone_chapa);
    return chapaDigits.length > 0 && chapaDigits === clDigits;
  });
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (a.atualizado_em > b.atualizado_em ? a : b));
}
