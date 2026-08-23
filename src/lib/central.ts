import { readSettings } from "./settings";
import { getDb } from "./db";

// MeuChapa Central — app separado (repo central-hub, deploy no Lovable)
// que centraliza acompanhamento pra liderança. Config pública (mesma
// natureza da config do Firebase em firebase.ts — chave publishable,
// segura pra embutir no bundle, a segurança vem de RLS no lado da Central).
const CENTRAL_APP_URL = "https://central-chapa-nexus.lovable.app";
const CENTRAL_API_KEY = "sb_publishable_Sb79_R6K0Rndkz_TNXpO0g_8_5g-KYb";
const CENTRAL_SUPABASE_URL = "https://uesgakycmstdhnctdtpc.supabase.co";
// Segredo dos hooks de ESCRITA (POST /api/public/hooks/*) — DIFERENTE da
// chave publishable acima. checkHookAuth (central-hub/src/lib/hook-auth.
// server.ts) exige isso via header x-mcm-hook-secret desde a correção de
// segurança de 2026-08-16; até esta mudança o MCM ainda mandava a chave
// publishable no header antigo (apikey), então todo POST estava voltando
// 401/503 silenciosamente engolido pelos try/catch abaixo. Precisa bater
// com o valor de MCM_HOOK_SECRET configurado no deploy da Central.
const CENTRAL_HOOK_SECRET = "94e9c82169fa1ed39616e32e5eca162d87553131d195cdeb5705856510d2ab7a";

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
      headers: { "Content-Type": "application/json", "x-mcm-hook-secret": CENTRAL_HOOK_SECRET },
      body: JSON.stringify({ ...params, analista: operadorNome || null }),
    });
  } catch {
    // Silencioso de propósito — a ação local já foi concluída, a Central é
    // só um espelho pra liderança acompanhar, não pode bloquear o analista.
  }
}

// Espelha um disparo (FUP ou BID) na Central — append-only, diferente de
// pushChapaStatusToCentral (que faz UPDATE num registro que já existe):
// um chapa pode receber vários disparos ao longo do tempo, cada um é um
// evento próprio. Best-effort silencioso, mesmo padrão dos outros pushes
// — nunca bloqueia o disparo local se a Central estiver fora do ar.
export async function pushDispatchEventToCentral(params: {
  id_tarefa: number;
  telefone_chapa: string | null;
  cpf: string | null;
  nome_chapa: string | null;
  canal: string;
  observacao?: string | null;
}): Promise<void> {
  try {
    const { operadorNome } = readSettings();
    await fetch(`${CENTRAL_APP_URL}/api/public/hooks/chapa-dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mcm-hook-secret": CENTRAL_HOOK_SECRET },
      body: JSON.stringify({ ...params, analista: operadorNome || null }),
    });
  } catch {
    // Silencioso — mesmo motivo de pushChapaStatusToCentral.
  }
}

// Espelha o motivo de uma tarefa "Em Andamento" desfalcada — feature
// inteiramente dependente da Central (só existe pra dar visibilidade à
// liderança), por isso vive só na beta, MCM e Central juntos. Best-effort
// silencioso, mesmo padrão dos outros pushes — o registro local em
// `tarefas.andamento_motivo` já aconteceu antes desta chamada.
export async function pushAndamentoMotivoToCentral(params: {
  id_tarefa: number;
  motivo: string;
  acao: string;
}): Promise<void> {
  try {
    const { operadorNome } = readSettings();
    await fetch(`${CENTRAL_APP_URL}/api/public/hooks/tarefa-andamento-motivo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mcm-hook-secret": CENTRAL_HOOK_SECRET },
      body: JSON.stringify({ ...params, analista: operadorNome || null }),
    });
  } catch {
    // Silencioso — mesmo motivo de pushChapaStatusToCentral.
  }
}

// Lista de ações possíveis pra tarefa desfalcada — configurável na Central
// (Integrações → Ações — tarefa desfalcada), não fixa no MCM. Best-effort:
// se a Central estiver fora do ar, cai num fallback local com as 3 ações
// conhecidas até agora, pra não travar o fluxo do analista.
const ACOES_FALLBACK = [
  "Bloqueio por No Show",
  "Pedido de captação de mais chapas pro SAAC",
  "Ligação posterior para o chapa e entender o motivo real do cancelamento",
];

export async function fetchAndamentoAcoes(): Promise<string[]> {
  try {
    const res = await fetch(`${CENTRAL_APP_URL}/api/public/hooks/andamento-acoes`, {
      headers: { "x-mcm-hook-secret": CENTRAL_HOOK_SECRET },
    });
    if (!res.ok) return ACOES_FALLBACK;
    const body = (await res.json()) as { acoes?: string[] };
    return Array.isArray(body.acoes) && body.acoes.length > 0 ? body.acoes : ACOES_FALLBACK;
  } catch {
    return ACOES_FALLBACK;
  }
}

// Empurra uma solicitação de pagamento gerada no TaskDetailPanel — fica
// registrada na Central pra liderança/dev verem (não é a Central que gera).
// Diferente de pushChapaStatusToCentral, aqui um erro é reportado ao
// analista (não é best-effort silencioso): a solicitação só existe se
// chegou na Central, não tem "cópia local" de fallback.
export async function pushPaymentRequestToCentral(params: {
  id_tarefa: number;
  empresa: string | null;
  motivo: string;
  itens: { nome: string; telefone: string; valor: number }[];
}): Promise<void> {
  const { operadorNome } = readSettings();
  const res = await fetch(`${CENTRAL_APP_URL}/api/public/hooks/payment-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-mcm-hook-secret": CENTRAL_HOOK_SECRET },
    body: JSON.stringify({ ...params, criado_por: operadorNome || null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Falha ao enviar solicitação pra Central");
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

// Espelha o "chat atual conhecido" de um chapa numa tarefa (chat_links local,
// ver migration em lib.rs) — permite a OUTRO analista, em outra máquina, abrir
// a mesma conversa mesmo sem ter disparado nada ele mesmo pra este chapa.
// Best-effort silencioso, mesmo padrão dos outros pushes — nunca bloqueia o
// disparo local se a Central estiver fora do ar.
export async function pushChatLinkToCentral(params: {
  id_tarefa: number;
  telefone_chapa: string | null;
  cpf: string | null;
  nome_chapa: string | null;
  umbler_chat_id: string;
  canal: string | null;
}): Promise<void> {
  try {
    const { operadorNome } = readSettings();
    await fetch(`${CENTRAL_APP_URL}/api/public/hooks/chat-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mcm-hook-secret": CENTRAL_HOOK_SECRET },
      body: JSON.stringify({ ...params, analista: operadorNome || null }),
    });
  } catch {
    // Silencioso — mesmo motivo de pushChapaStatusToCentral.
  }
}

export type CentralChatLink = {
  id_tarefa: number;
  telefone_chapa: string | null;
  cpf: string | null;
  nome_chapa: string | null;
  umbler_chat_id: string;
  canal: string | null;
  atualizado_em: string;
};

// Puxa da Central os chat_links gravados por QUALQUER analista (ou pela
// própria Central, se ela algum dia gerar um chat) — best-effort, mesmo
// padrão tolerante de pullCentralStatus.
export async function pullChatLinksFromCentral(): Promise<CentralChatLink[]> {
  try {
    const url =
      `${CENTRAL_SUPABASE_URL}/rest/v1/chat_links` +
      `?select=id_tarefa,telefone_chapa,cpf,nome_chapa,umbler_chat_id,canal,atualizado_em`;
    const res = await fetch(url, {
      headers: { apikey: CENTRAL_API_KEY, Authorization: `Bearer ${CENTRAL_API_KEY}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as CentralChatLink[];
  } catch {
    return [];
  }
}

// Aplica localmente os chat_links vindos da Central — mesmo match tolerante
// de applyCentralStatusLocally (cpf → telefone normalizado). Só sobrescreve
// um registro local existente se o `atualizado_em` que veio da Central for
// mais novo que o local, pra um sync atrasado nunca apagar um vínculo mais
// recente gravado nesta própria máquina (ver upsertChatLink em chatLinks.ts,
// que já grava local + empurra pra Central na hora do disparo).
export async function applyChatLinksLocally(): Promise<number> {
  const rows = await pullChatLinksFromCentral();
  if (rows.length === 0) return 0;

  const db = await getDb();
  let updated = 0;
  for (const r of rows) {
    if (!r.umbler_chat_id) continue;
    const telefoneDigits = (r.telefone_chapa ?? "").replace(/\D/g, "");

    let existing: { rowid: number; atualizado_em: string }[] = [];
    if (r.cpf) {
      existing = await db.select<{ rowid: number; atualizado_em: string }[]>(
        `SELECT rowid, atualizado_em FROM chat_links WHERE id_tarefa = ? AND cpf = ? LIMIT 1`,
        [r.id_tarefa, r.cpf],
      );
    } else if (telefoneDigits) {
      existing = await db.select<{ rowid: number; atualizado_em: string }[]>(
        `SELECT rowid, atualizado_em FROM chat_links WHERE id_tarefa = ?
           AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telefone_chapa,''),'(',''),')',''),'-',''),' ','') LIKE ?
         LIMIT 1`,
        [r.id_tarefa, `%${telefoneDigits.slice(-11)}`],
      );
    } else {
      continue;
    }

    if (existing.length > 0) {
      if (r.atualizado_em > existing[0].atualizado_em) {
        await db.execute(
          `UPDATE chat_links SET telefone_chapa = ?, cpf = COALESCE(?, cpf), nome_chapa = ?, umbler_chat_id = ?, canal = ?, atualizado_em = ? WHERE rowid = ?`,
          [r.telefone_chapa, r.cpf, r.nome_chapa, r.umbler_chat_id, r.canal, r.atualizado_em, existing[0].rowid],
        );
        updated++;
      }
    } else {
      await db.execute(
        `INSERT INTO chat_links (id_tarefa, telefone_chapa, cpf, nome_chapa, umbler_chat_id, canal, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [r.id_tarefa, r.telefone_chapa, r.cpf, r.nome_chapa, r.umbler_chat_id, r.canal, r.atualizado_em],
      );
      updated++;
    }
  }
  return updated;
}

// ── Camada 1: MCM lê tarefas e cadastro geral DA CENTRAL, não mais direto
// do Metabase. A Central é quem fala com o Metabase agora (reduz de 16
// chamadas redundantes pra 1). Ver CENTRAL_APP_BACKLOG.md no repo da
// Central pro levantamento completo. ──

type CentralTarefaChapaRow = {
  id_tarefa: number;
  nome_chapa: string | null;
  telefone_chapa: string | null;
  cpf: string | null;
};

type CentralTarefaRow = {
  id_tarefa: number;
  data_tarefa: string | null;
  cidade_uf: string | null;
  empresa: string | null;
  cnpj: string | null;
  status_tarefa: string | null;
  quantidade_chapas: number | null;
};

// Monta linhas no mesmo formato "uma linha por ajudante escalado" que
// ingestTarefas() já espera do Metabase — os nomes de campo batem
// (id_tarefa/empresa/nome_chapa/telefone_chapa/cpf/etc já são snake_case
// nas duas pontas), então dá pra reaproveitar ingestTarefas() sem alterar
// uma linha dele.
export async function pullTarefasFromCentral(): Promise<Record<string, unknown>[]> {
  const [tarefasRes, chapasRes] = await Promise.all([
    fetch(
      `${CENTRAL_SUPABASE_URL}/rest/v1/tarefas?select=id_tarefa,data_tarefa,cidade_uf,empresa,cnpj,status_tarefa,quantidade_chapas&ativo=eq.true`,
      { headers: { apikey: CENTRAL_API_KEY, Authorization: `Bearer ${CENTRAL_API_KEY}` } },
    ),
    fetch(
      `${CENTRAL_SUPABASE_URL}/rest/v1/tarefa_chapas?select=id_tarefa,nome_chapa,telefone_chapa,cpf`,
      { headers: { apikey: CENTRAL_API_KEY, Authorization: `Bearer ${CENTRAL_API_KEY}` } },
    ),
  ]);
  if (!tarefasRes.ok || !chapasRes.ok) throw new Error("Central indisponível ao buscar tarefas");
  const tarefas = (await tarefasRes.json()) as CentralTarefaRow[];
  const chapas = (await chapasRes.json()) as CentralTarefaChapaRow[];

  const tarefaById = new Map(tarefas.map((t) => [t.id_tarefa, t]));
  const rows: Record<string, unknown>[] = [];
  for (const c of chapas) {
    const t = tarefaById.get(c.id_tarefa);
    if (!t) continue;
    rows.push({
      id_tarefa: t.id_tarefa,
      data_tarefa: t.data_tarefa,
      cidade_uf: t.cidade_uf,
      empresa: t.empresa,
      cnpj: t.cnpj,
      status_tarefa: t.status_tarefa,
      quantidade_chapas: t.quantidade_chapas,
      nome_chapa: c.nome_chapa,
      telefone_chapa: c.telefone_chapa,
      cpf: c.cpf,
    });
  }
  // Tarefas sem nenhum ajudante escalado ainda não entram (ingestTarefas só
  // cria a tarefa a partir de uma linha com chapa) — mesma limitação que já
  // existia sincronizando direto do Metabase.
  return rows;
}

type CentralChapaRegistryRow = {
  external_id: string | null;
  nome: string | null;
  telefone: string | null;
  cpf: string | null;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  rua: string | null;
  cep: string | null;
  numero_casa: string | null;
  tarefas: number | null;
  data_primeira_tarefa: string | null;
  data_ultima_tarefa: string | null;
  situacao: string | null;
  bloqueio_tudo: boolean | null;
  motivo_bloqueio: string | null;
  aso: string | null;
};

// Cadastro geral de chapas — grava direto em chapa_registry local, sem
// passar pelo parser de coluna-por-regex (esse existe só pra tolerar as
// variações de nome de coluna de um export cru do Metabase; aqui os dois
// lados já são schemas normalizados que eu controlo).
export async function syncRegistroFromCentral(): Promise<number> {
  const res = await fetch(
    `${CENTRAL_SUPABASE_URL}/rest/v1/chapa_registry?select=external_id,nome,telefone,cpf,cidade,bairro,estado,rua,cep,numero_casa,tarefas,data_primeira_tarefa,data_ultima_tarefa,situacao,bloqueio_tudo,motivo_bloqueio,aso`,
    { headers: { apikey: CENTRAL_API_KEY, Authorization: `Bearer ${CENTRAL_API_KEY}` } },
  );
  if (!res.ok) throw new Error("Central indisponível ao buscar cadastro geral");
  const rows = (await res.json()) as CentralChapaRegistryRow[];
  if (rows.length === 0) return 0;

  const db = await getDb();
  try { await db.execute("ALTER TABLE chapa_registry ADD COLUMN fonte TEXT DEFAULT 'metabase'"); } catch { /* já existe */ }

  // Insere as linhas novas ANTES de apagar as antigas (nunca DELETE-then-INSERT
  // — isso deixava a tabela momentaneamente vazia caso o app fosse fechado ou
  // uma chunk falhasse no meio do processo, igual ao bug já corrigido em
  // ingestTarefas.ts/MCM-151). cpf não é PK aqui de propósito (ver comentário
  // na migração chapa_registry_and_cep_cache em lib.rs — o mesmo CPF pode
  // aparecer em metabase + leads_saac, ou duplicado num feed, e um UNIQUE
  // constraint historicamente derrubava o chunk inteiro em silêncio), então
  // não dá pra fazer upsert por ON CONFLICT(cpf) sem reabrir aquele bug —
  // em vez disso, marca cada linha com o timestamp do sync e só remove no
  // final as linhas 'metabase' de syncs anteriores a este.
  const now = new Date().toISOString();
  const CHUNK = 30;
  const COLS = "(cpf,nome,telefone,cidade,bairro,estado,rua,cep,numero,tarefas,data_primeira_tarefa,data_ultima_tarefa,situacao,bloqueio,motivo_bloqueio,aso,importado_em,fonte)";
  const ROW_PH = "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  let count = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const ph = Array(chunk.length).fill(ROW_PH).join(",");
    const vals = chunk.flatMap((r) => [
      r.cpf, r.nome, r.telefone, r.cidade, r.bairro, r.estado, r.rua, r.cep, r.numero_casa,
      r.tarefas ?? 0, r.data_primeira_tarefa, r.data_ultima_tarefa, r.situacao,
      r.bloqueio_tudo ? "Bloqueado em tudo" : "Desbloqueado em tudo", r.motivo_bloqueio, r.aso,
      now, "metabase",
    ]);
    try {
      await db.execute(`INSERT INTO chapa_registry ${COLS} VALUES ${ph}`, vals);
      count += chunk.length;
    } catch { /* chunk isolado — um erro não derruba o resto */ }
  }
  if (count > 0) {
    await db.execute(
      "DELETE FROM chapa_registry WHERE (fonte IS NULL OR fonte = 'metabase') AND (importado_em IS NULL OR importado_em < ?)",
      [now],
    );
  }
  return count;
}
