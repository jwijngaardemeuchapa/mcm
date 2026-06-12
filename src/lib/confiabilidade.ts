import { normalize } from "./normalize";

// Score de confiabilidade do chapa — janela móvel de 15 dias, calculado em memória
// a partir de tarefas + chapas já carregados no Dashboard (zero query extra).
// Exibido apenas no painel FUP. Identidade tolerante: CPF → telefone → nome.

export const CONFIABILIDADE_JANELA_DIAS = 15;
// Mínimo de participações para exibir o indicador — 1 evento é ruído, não sinal.
export const CONFIABILIDADE_MIN_PARTICIPACOES = 2;

export type ConfiabilidadeStats = {
  participacoes: number; // alocações na janela (inclui removidos)
  presencas: number;     // validacao_presenca === "presente"
  faltas: number;        // validacao_presenca === "ausente"
  confirmacoes: number;  // status_contato === "confirmado"
  removidos: number;     // status_contato === "removido"
  score: number;         // 0–100
  stars: number;         // 0–5, passo 0.5
};

type ChapaLike = {
  cpf?: string | null;
  telefone_chapa?: string | null;
  nome_chapa?: string | null;
};

type ChapaHist = ChapaLike & {
  id_tarefa: number;
  status_contato?: string | null;
  validacao_presenca?: string | null;
};

type TarefaLike = { id_tarefa: number; data_tarefa: string };

function identityKeys(c: ChapaLike): string[] {
  const keys: string[] = [];
  const cpf = (c.cpf ?? "").replace(/\D/g, "");
  if (cpf.length >= 11) keys.push(`c:${cpf}`);
  const tel = (c.telefone_chapa ?? "").replace(/\D/g, "");
  if (tel.length >= 10) keys.push(`t:${tel.slice(-11)}`); // tolera prefixo 55
  const nome = normalize((c.nome_chapa ?? "").trim());
  if (nome) keys.push(`n:${nome}`);
  return keys;
}

function computeScore(s: Omit<ConfiabilidadeStats, "score" | "stars">): number {
  const validacoes = s.presencas + s.faltas;
  const presRate = validacoes > 0 ? s.presencas / validacoes : null;
  const confRate = s.participacoes > 0 ? s.confirmacoes / s.participacoes : 0;
  const remRate = s.participacoes > 0 ? s.removidos / s.participacoes : 0;
  // Presença validada pesa mais que confirmação; sem validações o score é um
  // proxy conservador da taxa de confirmação. Remoções penalizam.
  let score = presRate !== null
    ? 100 * (0.65 * presRate + 0.35 * confRate)
    : 100 * confRate * 0.85;
  score -= 20 * remRate;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildConfiabilidadeMap(
  tarefas: TarefaLike[],
  chapas: ChapaHist[],
  windowDays = CONFIABILIDADE_JANELA_DIAS,
): Map<string, ConfiabilidadeStats> {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const taskTime = new Map<number, number>();
  for (const t of tarefas) {
    const ms = new Date(t.data_tarefa).getTime();
    if (!Number.isNaN(ms)) taskTime.set(t.id_tarefa, ms);
  }

  const acc = new Map<string, Omit<ConfiabilidadeStats, "score" | "stars">>();
  for (const c of chapas) {
    if (!c.nome_chapa) continue; // vaga em captação
    const ms = taskTime.get(c.id_tarefa);
    if (ms === undefined || ms < cutoff || ms > Date.now()) continue;
    const keys = identityKeys(c);
    if (keys.length === 0) continue;

    const confirmado = c.status_contato === "confirmado";
    const removido = c.status_contato === "removido";
    const presente = c.validacao_presenca === "presente";
    const ausente = c.validacao_presenca === "ausente";

    for (const k of keys) {
      let s = acc.get(k);
      if (!s) {
        s = { participacoes: 0, presencas: 0, faltas: 0, confirmacoes: 0, removidos: 0 };
        acc.set(k, s);
      }
      s.participacoes++;
      if (confirmado) s.confirmacoes++;
      if (removido) s.removidos++;
      if (presente) s.presencas++;
      if (ausente) s.faltas++;
    }
  }

  const out = new Map<string, ConfiabilidadeStats>();
  acc.forEach((s, k) => {
    const score = computeScore(s);
    out.set(k, { ...s, score, stars: Math.round((score / 20) * 2) / 2 });
  });
  return out;
}

export function lookupConfiabilidade(
  map: Map<string, ConfiabilidadeStats> | null | undefined,
  c: ChapaLike,
): ConfiabilidadeStats | null {
  if (!map || map.size === 0) return null;
  for (const k of identityKeys(c)) {
    const v = map.get(k);
    if (v) return v;
  }
  return null;
}
