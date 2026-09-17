import { readSettings } from "./settings";

// MeuChapa Central — app separado (repo central-hub, deploy no Lovable) que
// centraliza acompanhamento pra liderança. Diferente da beta, a produção
// NUNCA LÊ nada da Central (ver .agents/LESSONS.md — incidente 2026-08-19,
// regra em memória "feedback-beta-vs-producao": produção não pode depender
// da Central pra funcionar). Este arquivo só EMPURRA eventos, best-effort,
// puramente informativo — a Central é espectadora, nunca fonte de dado
// aqui. Se a Central cair, nada aqui trava ou muda o comportamento local.
const CENTRAL_APP_URL = "https://mcmcentral.lovable.app";
// Segredo dos hooks de escrita (POST /api/public/hooks/*) — precisa bater
// com MCM_HOOK_SECRET configurado no deploy da Central.
const CENTRAL_HOOK_SECRET = "94e9c82169fa1ed39616e32e5eca162d87553131d195cdeb5705856510d2ab7a";

// Espelha um disparo (FUP ou BID) na Central — append-only: um chapa pode
// receber vários disparos ao longo do tempo, cada um é um evento próprio.
// Best-effort silencioso, nunca bloqueia o disparo local se a Central
// estiver fora do ar.
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
    // Silencioso de propósito.
  }
}

// Envia quando o bot confirma/cancela automaticamente (ver
// processFirestoreMessage em firestoreQueue.ts) — best effort, nunca deve
// travar nem quebrar o processamento local se a Central estiver fora do
// ar. Match no lado de lá é tolerante (cpf → telefone → nome).
export async function pushChapaStatusToCentral(params: {
  id_tarefa: number;
  telefone_chapa: string | null;
  cpf: string | null;
  nome_chapa: string | null;
  status_contato: "confirmado" | "cancelado";
  confirmado_via?: "prefup" | "fup" | null;
}): Promise<void> {
  try {
    const { operadorNome } = readSettings();
    await fetch(`${CENTRAL_APP_URL}/api/public/hooks/chapa-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mcm-hook-secret": CENTRAL_HOOK_SECRET },
      body: JSON.stringify({ ...params, analista: operadorNome || null }),
    });
  } catch {
    // Silencioso — mesmo motivo de pushDispatchEventToCentral.
  }
}

// Espelha toda resposta processada (FUP ou BID) na Central — mesmo momento
// em que o MCM grava seu resposta_log local, ANTES de apagar a mensagem do
// Firestore. Sem isso a Central (que também lê o mesmo Firestore por
// polling, a cada 5min) quase sempre perde a corrida contra o deleteDoc
// quase-instantâneo do MCM na mesma mensagem — este push é o que garante o
// dado chegar de verdade, não o poll. Best-effort silencioso, mesmo padrão
// dos outros pushes.
export async function pushRespostaToCentral(params: {
  id_tarefa: number | null;
  tipo: string;
  nome_chapa: string | null;
  telefone_chapa: string | null;
  empresa: string | null;
  categoria: string | null;
  resposta: string | null;
  message_body: string | null;
  fonte: string;
}): Promise<void> {
  try {
    await fetch(`${CENTRAL_APP_URL}/api/public/hooks/resposta`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-mcm-hook-secret": CENTRAL_HOOK_SECRET },
      body: JSON.stringify(params),
    });
  } catch {
    // Silencioso — mesmo motivo de pushDispatchEventToCentral.
  }
}
