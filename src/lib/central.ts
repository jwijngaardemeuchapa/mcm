import { readSettings } from "./settings";
import { getDb } from "./db";

// MeuChapa Central — app separado (repo central-hub, deploy no Lovable)
// que centraliza acompanhamento pra liderança. Config pública (mesma
// natureza da config do Firebase em firebase.ts — chave publishable,
// segura pra embutir no bundle, a segurança vem de RLS no lado da Central).
const CENTRAL_APP_URL = "https://central-chapa-nexus.lovable.app";
const CENTRAL_API_KEY = "sb_publishable_Sb79_R6K0Rndkz_TNXpO0g_8_5g-KYb";
const CENTRAL_SUPABASE_URL = "https://uesgakycmstdhnctdtpc.supabase.co";

// Envia quando o analista confirma/cancela manualmente na tela — best
// effort, nunca deve travar nem quebrar a ação local se a Central estiver
// fora do ar. Match no lado de lá é tolerante (cpf → telefone → nome).
export async function pushChapaStatusToCentral(params: {
  id_tarefa: number;
  telefone_chapa: string | null;
  cpf: string | null;
  nome_chapa: string | null;
  status_contato: "confirmado" | "cancelado";
}): Promise<void> {
  try {
    const { operadorNome } = readSettings();
    await fetch(`${CENTRAL_APP_URL}/api/public/hooks/chapa-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CENTRAL_API_KEY },
      body: JSON.stringify({ ...params, analista: operadorNome || null }),
    });
  } catch {
    // Silencioso de propósito — a ação local já foi concluída, a Central é
    // só um espelho pra liderança acompanhar, não pode bloquear o analista.
  }
}

export type CentralChapaStatus = {
  id_tarefa: number;
  telefone_chapa: string | null;
  cpf: string | null;
  status_contato: string;
  status_source: string | null;
  status_changed_at: string | null;
};

// Puxa da Central o status de chapas confirmadas/canceladas por OUTRO
// analista ou pelo bot da Umbler — pra este MCM local espelhar sem
// precisar que o próprio analista tenha visto a resposta.
export async function pullCentralStatus(): Promise<CentralChapaStatus[]> {
  try {
    const url =
      `${CENTRAL_SUPABASE_URL}/rest/v1/tarefa_chapas` +
      `?select=id_tarefa,telefone_chapa,cpf,status_contato,status_source,status_changed_at` +
      `&status_source=not.is.null`;
    const res = await fetch(url, {
      headers: { apikey: CENTRAL_API_KEY, Authorization: `Bearer ${CENTRAL_API_KEY}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as CentralChapaStatus[];
  } catch {
    return [];
  }
}

// Aplica localmente os status que vieram de OUTRO analista (via Central) ou
// do bot da Umbler processado lá. Nunca sobrescreve um status já mais forte
// no MCM local ('confirmado'/'cancelado') — só preenche quem ainda tá
// 'pendente'/'nao_respondeu' aqui, pra não brigar com uma ação que o
// próprio analista acabou de fazer nesta máquina.
export async function applyCentralStatusLocally(): Promise<number> {
  const rows = await pullCentralStatus();
  const relevant = rows.filter((r) => r.status_contato === "confirmado" || r.status_contato === "cancelado");
  if (relevant.length === 0) return 0;

  const db = await getDb();
  let updated = 0;
  for (const r of relevant) {
    const telefoneDigits = (r.telefone_chapa ?? "").replace(/\D/g, "");
    let res;
    if (r.cpf) {
      res = await db.execute(
        `UPDATE chapas SET status_contato = ?, data_contato = ?, canal_contato = 'central_sync'
         WHERE id_tarefa = ? AND cpf = ? AND status_contato IN ('pendente','nao_respondeu')`,
        [r.status_contato, r.status_changed_at ?? new Date().toISOString(), r.id_tarefa, r.cpf],
      );
    } else if (telefoneDigits) {
      res = await db.execute(
        `UPDATE chapas SET status_contato = ?, data_contato = ?, canal_contato = 'central_sync'
         WHERE id_tarefa = ?
           AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telefone_chapa,''),'(',''),')',''),'-',''),' ','') LIKE ?
           AND status_contato IN ('pendente','nao_respondeu')`,
        [r.status_contato, r.status_changed_at ?? new Date().toISOString(), r.id_tarefa, `%${telefoneDigits.slice(-11)}`],
      );
    } else {
      continue;
    }
    updated += res.rowsAffected ?? 0;
  }
  return updated;
}
