import { getDb, uuid } from "./db";
import { normalize } from "./normalize";

/* ──────────────────────────────────────────────────────────────────────────
 * Consumidor da fila Firestore — porta para TypeScript da lógica que vivia no
 * webhook axum em Rust (`process_webhook_response` / `classify_response`).
 * Mantém o match resposta→disparo por telefone e dispara as transições de
 * status no FUP Dashboard (chapas) e no BID Dashboard (bid_disparos, 2 etapas).
 * ────────────────────────────────────────────────────────────────────────── */

export type RespostaCode =
  | "confirmado"
  | "cancelado"
  | "precisa_ajuda"
  | "aceita_app"
  | "nao_aceita_app"
  | "interesse_sim"
  | "interesse_nao";

export type RespostaEvent = {
  tipo: "fup" | "bid";
  chapa_nome: string;
  chapa_telefone: string | null;
  resposta: string;
  id_tarefa: number | null;
  empresa: string | null;
  disparo_id: string | null;
  message_body: string | null;
  received_at: string;
};

export type ProcessResult =
  | { handled: false; reason: string }
  | { handled: true; event: RespostaEvent };

/** Classifica um texto de resposta cru num código canônico. Porta fiel de
 *  `classify_response` (src-tauri/src/lib.rs). */
export function classifyResponse(raw: string): RespostaCode | null {
  const norm = normalize(raw).trim();

  // Botões do FUP: "SIM, tô nessa!" → confirmado / "NÃO, quero cancelar!" → cancelado
  if (norm.includes("nessa")) {
    return "confirmado";
  }
  if (norm.includes("quero cancelar") || norm.includes("nao quero")) {
    return "cancelado";
  }
  // BID / respostas genéricas
  if (norm.includes("preciso de ajuda") || norm.includes("preciso ajuda") || norm === "ajuda" || norm === "3") {
    return "precisa_ajuda";
  }
  if (norm.includes("aceito o app") || norm.includes("aceita o app") || norm.includes("aceito app")) {
    return "aceita_app";
  }
  if (norm.includes("nao aceito") || norm.includes("nao aceita")) {
    return "nao_aceita_app";
  }
  // Respostas curtas de uma palavra/número
  const words = norm.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length <= 4) {
    const hasSim = words.some((w) => w === "sim" || w === "1");
    const hasNao = words.some((w) => w === "nao" || w === "2");
    if (hasSim && !hasNao) return "interesse_sim";
    if (hasNao && !hasSim) return "interesse_nao";
  }
  return null;
}

/* ── Extratores tolerantes a múltiplos formatos de payload da Umbler ────────── */

function pick(obj: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const key of path) {
      if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[key];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === "string" && cur.trim() !== "") return cur;
  }
  return null;
}

function stripNonDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export function extractPhone(payload: unknown): string | null {
  // Caminhos diretos (string)
  const raw = pick(payload, [
    ["Chat", "PhoneNumber"],   // Vercel mapeia Contact → Chat (PascalCase)
    ["Chat", "phone"],
    ["Chat", "number"],
    ["Contact", "PhoneNumber"],
    ["chat"],
    ["from"],
    ["data", "from"],
    ["contact", "phone"],
    ["sender"],
    ["phone"],
    ["telefone"],
  ]);
  if (raw) {
    const d = stripNonDigits(raw);
    if (d.length >= 10) return d;
  }

  // Fallback: Chat pode ser objeto ou número
  const p = payload as Record<string, unknown>;
  const chatVal = p?.Chat ?? p?.chat;
  if (chatVal != null && typeof chatVal === "object") {
    const chatObj = chatVal as Record<string, unknown>;
    const phoneVal = chatObj.PhoneNumber ?? chatObj.phone ?? chatObj.Phone ?? chatObj.number;
    if (phoneVal != null) {
      const d = stripNonDigits(String(phoneVal));
      if (d.length >= 10) return d;
    }
  } else if (chatVal != null) {
    const d = stripNonDigits(String(chatVal));
    if (d.length >= 10) return d;
  }

  return null;
}

export function extractBody(payload: unknown): string | null {
  const named = pick(payload, [
    ["resposta_opcao"],    // FUP D0/D1: "SIM, tô nessa!" / "NÃO, quero cancelar!"
    ["resposta_interesse"],// BID etapa 1: "SIM" / "NÃO"
    ["resposta_aceite"],   // BID etapa 2: "Sim" / "Não" / "Preciso de ajuda"
    ["Data", "Data"],
    ["data", "Data"],
    ["data", "body"],
    ["data", "text"],
    ["body"],
    ["text"],
    ["message", "body"],
    ["message", "text"],
    ["payload", "Data"],
  ]);
  if (named) return named;

  // Fallback: varre todos os valores string do payload raiz e de objetos
  // aninhados procurando qualquer um que classifyResponse classifique.
  const p = payload as Record<string, unknown>;
  for (const val of Object.values(p)) {
    if (typeof val === "string" && val.trim() && classifyResponse(val) !== null) {
      return val;
    }
  }
  for (const key of ["Data", "data"]) {
    const dataObj = p?.[key];
    if (dataObj && typeof dataObj === "object") {
      for (const val of Object.values(dataObj as Record<string, unknown>)) {
        if (typeof val === "string" && val.trim() && classifyResponse(val) !== null) {
          return val;
        }
      }
    }
  }
  return null;
}

export function extractName(payload: unknown): string | null {
  return pick(payload, [
    ["contact", "name"],
    ["data", "contact", "name"],
    ["contact_name"],
    ["data", "contact_name"],
    ["name"],
  ]);
}

/** Sufixo dos últimos 11 dígitos para o LIKE de telefone (igual ao Rust). */
function phonePattern(digits: string): string {
  return `%${digits.slice(Math.max(0, digits.length - 11))}`;
}

/** Mapeia o código classificado para o status do BID conforme a etapa atual
 *  do disparo (aguardando = etapa 1 / interesse_sim = etapa 2). */
function mapBidStatus(
  code: RespostaCode,
  currentStatus: string,
): { status: string; step: 1 | 2 } | null {
  const positive = code === "interesse_sim" || code === "confirmado" || code === "aceita_app";
  const negative = code === "interesse_nao" || code === "cancelado" || code === "nao_aceita_app";

  if (currentStatus === "aguardando") {
    // Etapa 1 — há interesse?
    if (positive) return { status: "interesse_sim", step: 1 };
    if (negative) return { status: "interesse_nao", step: 1 };
    if (code === "precisa_ajuda") return { status: "precisa_ajuda", step: 1 };
    return null;
  }
  if (currentStatus === "interesse_sim") {
    // Etapa 2 — consegue aceitar no app?
    if (code === "precisa_ajuda") return { status: "precisa_ajuda", step: 2 };
    if (positive) return { status: "aceita_app", step: 2 };
    if (negative) return { status: "nao_aceita_app", step: 2 };
    return null;
  }
  return null;
}

type BidRow = {
  id: string;
  chapa_nome: string;
  chapa_telefone: string;
  id_tarefa: number | null;
  empresa: string | null;
  data_tarefa: string | null;
  status: string;
};

type FupRow = {
  id: string;
  nome_chapa: string;
  telefone_chapa: string | null;
  id_tarefa: number;
  empresa: string;
};

function extractMotivoNao(payload: unknown): string | null {
  return pick(payload, [["motivo_nao"]]);
}

const MOTIVOS_VALIDOS = [
  "Em cima da hora",
  "Localização da Tarefa",
  "Valor da Tarefa",
  "Não uso mais o App",
  "Outro",
];

/** Processa uma mensagem da fila: classifica, correlaciona por telefone e grava
 *  no SQLite (atualiza disparo/chapa + resposta_log). Retorna se foi tratada —
 *  o chamador só apaga o documento do Firestore quando `handled === true`. */
export async function processFirestoreMessage(payload: unknown): Promise<ProcessResult> {
  const phoneDigits = extractPhone(payload);
  if (!phoneDigits) return { handled: false, reason: "sem telefone no payload" };

  const pattern = phonePattern(phoneDigits);
  const db = await getDb();
  const now = new Date().toISOString();

  // Etapa 3 BID: motivo_nao (por que não aceitou no app)
  const motivo = extractMotivoNao(payload);
  if (motivo && MOTIVOS_VALIDOS.includes(motivo)) {
    const bidRows = await db.select<BidRow[]>(
      `SELECT id, chapa_nome, chapa_telefone, id_tarefa, empresa, data_tarefa, status
       FROM bid_disparos
       WHERE REPLACE(REPLACE(chapa_telefone,'-',''),' ','') LIKE ?
         AND status = 'nao_aceita_app'
         AND data_disparo >= datetime('now','-7 days')
       ORDER BY data_disparo DESC LIMIT 1`,
      [pattern],
    );
    const bid = bidRows[0];
    if (bid) {
      await db.execute("UPDATE bid_disparos SET motivo_nao = ? WHERE id = ?", [motivo, bid.id]);
      await db.execute(
        `INSERT OR IGNORE INTO resposta_log (id,tipo,chapa_nome,chapa_telefone,resposta,id_tarefa,empresa,data_tarefa,disparo_id,fonte,message_body,received_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uuid(), "bid", bid.chapa_nome, bid.chapa_telefone, `motivo_nao:${motivo}`, bid.id_tarefa, bid.empresa, bid.data_tarefa, bid.id, "firestore", motivo, now],
      );
      return {
        handled: true,
        event: {
          tipo: "bid",
          chapa_nome: bid.chapa_nome,
          chapa_telefone: bid.chapa_telefone,
          resposta: `motivo_nao:${motivo}`,
          id_tarefa: bid.id_tarefa,
          empresa: bid.empresa,
          disparo_id: bid.id,
          message_body: motivo,
          received_at: now,
        },
      };
    }
    return { handled: false, reason: `motivo_nao recebido mas sem disparo nao_aceita_app para o telefone` };
  }

  const body = extractBody(payload);
  if (!body) return { handled: false, reason: "sem corpo no payload" };

  const code = classifyResponse(body);
  if (!code) return { handled: false, reason: `resposta não classificada: "${body}"` };

  // 1. BID primeiro — disparo aguardando (etapa 1) ou interesse_sim (etapa 2)
  const bidRows = await db.select<BidRow[]>(
    `SELECT id, chapa_nome, chapa_telefone, id_tarefa, empresa, data_tarefa, status
     FROM bid_disparos
     WHERE REPLACE(REPLACE(chapa_telefone,'-',''),' ','') LIKE ?
       AND status IN ('aguardando','interesse_sim')
       AND data_disparo >= datetime('now','-7 days')
     ORDER BY data_disparo DESC LIMIT 1`,
    [pattern],
  );
  const bid = bidRows[0];
  if (bid) {
    const mapped = mapBidStatus(code, bid.status);
    if (mapped) {
      if (mapped.step === 1) {
        await db.execute("UPDATE bid_disparos SET status=?, data_resposta1=? WHERE id=?", [mapped.status, now, bid.id]);
      } else {
        await db.execute("UPDATE bid_disparos SET status=?, data_resposta2=? WHERE id=?", [mapped.status, now, bid.id]);
      }
      await db.execute(
        `INSERT OR IGNORE INTO resposta_log (id,tipo,chapa_nome,chapa_telefone,resposta,id_tarefa,empresa,data_tarefa,disparo_id,fonte,message_body,received_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [uuid(), "bid", bid.chapa_nome, bid.chapa_telefone, mapped.status, bid.id_tarefa, bid.empresa, bid.data_tarefa, bid.id, "firestore", body, now],
      );
      return {
        handled: true,
        event: {
          tipo: "bid",
          chapa_nome: bid.chapa_nome,
          chapa_telefone: bid.chapa_telefone,
          resposta: mapped.status,
          id_tarefa: bid.id_tarefa,
          empresa: bid.empresa,
          disparo_id: bid.id,
          message_body: body,
          received_at: now,
        },
      };
    }
  }

  // 2. FUP — chapa com canal umbler_talk ainda não resolvido
  const fupRows = await db.select<FupRow[]>(
    `SELECT c.id, c.nome_chapa, c.telefone_chapa, c.id_tarefa, t.empresa
     FROM chapas c
     JOIN tarefas t ON c.id_tarefa = t.id_tarefa
     WHERE REPLACE(REPLACE(COALESCE(c.telefone_chapa,''),'-',''),' ','') LIKE ?
       AND t.ativo = 1
       AND c.canal_contato = 'umbler_talk'
       AND c.status_contato NOT IN ('confirmado','removido')
     ORDER BY c.data_contato DESC LIMIT 1`,
    [pattern],
  );
  const fup = fupRows[0];
  if (fup) {
    const fupResposta = code === "interesse_sim" || code === "confirmado"
      ? "confirmado"
      : code === "interesse_nao" || code === "cancelado"
        ? "cancelado"
        : code;
    await db.execute("UPDATE chapas SET status_contato=?, data_contato=? WHERE id=?", [fupResposta, now, fup.id]);
    await db.execute(
      `INSERT OR IGNORE INTO resposta_log (id,tipo,chapa_nome,chapa_telefone,resposta,id_tarefa,empresa,fonte,message_body,received_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uuid(), "fup", fup.nome_chapa, fup.telefone_chapa, fupResposta, fup.id_tarefa, fup.empresa, "firestore", body, now],
    );
    return {
      handled: true,
      event: {
        tipo: "fup",
        chapa_nome: fup.nome_chapa,
        chapa_telefone: fup.telefone_chapa,
        resposta: fupResposta,
        id_tarefa: fup.id_tarefa,
        empresa: fup.empresa,
        disparo_id: null,
        message_body: body,
        received_at: now,
      },
    };
  }

  return { handled: false, reason: `sem disparo pendente para o telefone ${phoneDigits}` };
}
