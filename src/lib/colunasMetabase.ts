/**
 * Colunas do card do Metabase que o MCM espera (tipo de trabalho, remessa, oferta a chapa dirigido) e o diagnóstico
 * de "o card trouxe?". O nome da coluna é casado sem diferenciar caixa, acento, espaço nem `_`, e aceita apelidos —
 * assim "Em Oferta", "em_oferta" e "EM OFERTA" são a mesma coluna.
 *
 * Sem imports de propósito: é regra pura, usada no sync e na tela de Integrações.
 */

export type CampoDoCard = "remessa" | "tipo_trabalho" | "em_oferta" | "chapa_em_oferta";

export const CAMPOS_DO_CARD: Array<{ campo: CampoDoCard; rotulo: string; nomes: string[] }> = [
  { campo: "remessa", rotulo: "Remessa", nomes: ["Remessa", "Shipping"] },
  { campo: "tipo_trabalho", rotulo: "Tipo de Trabalho", nomes: ["Tipo de Trabalho", "Tipo Trabalho", "Tipo do Trabalho", "Work Type"] },
  { campo: "em_oferta", rotulo: "Em Oferta", nomes: ["Em Oferta"] },
  { campo: "chapa_em_oferta", rotulo: "Chapa em Oferta", nomes: ["Chapa em Oferta", "Chapa Oferta", "Chapa Dirigido"] },
];

export const nomesDoCampo = (campo: CampoDoCard): string[] => CAMPOS_DO_CARD.find((c) => c.campo === campo)!.nomes;

/** minúsculo, sem acento, só letras e números */
export function chaveDeColuna(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

type Linha = Record<string, unknown>;

/** "Tabela → Remessa", "WorkHeader.Shipping" ou "a > b": vale o último trecho (o Metabase prefixa a origem em colunas ligadas). */
function ultimoTrecho(nome: string): string {
  return nome.split(/→|->|>|\./).pop() ?? nome;
}

/** O nome REAL da coluna nessa linha (ou null). */
export function acharColuna(row: Linha, nomes: string[]): string | null {
  const alvos = new Set(nomes.map(chaveDeColuna));
  const chaves = Object.keys(row);
  // 1º o nome inteiro; só depois o último trecho (evita casar "Tabela → Remessa" antes de uma coluna "Remessa" de verdade)
  return chaves.find((k) => alvos.has(chaveDeColuna(k))) ?? chaves.find((k) => alvos.has(chaveDeColuna(ultimoTrecho(k)))) ?? null;
}

/** O valor da coluna (aceita os apelidos); undefined se a coluna não existe. */
export function valorDaColuna(row: Linha, nomes: string[]): unknown {
  const k = acharColuna(row, nomes);
  return k === null ? undefined : row[k];
}

export type DiagnosticoDoCard = {
  quando: string;
  origem: "metabase" | "planilha";
  linhas: number;
  /** Nomes das colunas como vieram. */
  colunas: string[];
  /** Pra cada campo esperado: o nome real da coluna, ou null se o card não trouxe. */
  achadas: Record<CampoDoCard, string | null>;
};

export function diagnosticarColunas(rows: Linha[], origem: DiagnosticoDoCard["origem"] = "metabase", agora: string = new Date().toISOString()): DiagnosticoDoCard {
  const colunas = new Set<string>();
  for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) colunas.add(k);
  const achadas = {} as Record<CampoDoCard, string | null>;
  for (const c of CAMPOS_DO_CARD) {
    achadas[c.campo] = null;
    for (const r of rows) {
      const k = acharColuna(r, c.nomes);
      if (k !== null) { achadas[c.campo] = k; break; }
    }
  }
  return { quando: agora, origem, linhas: rows.length, colunas: [...colunas], achadas };
}

export const rotulosFaltando = (d: DiagnosticoDoCard): string[] =>
  CAMPOS_DO_CARD.filter((c) => d.achadas[c.campo] === null).map((c) => c.rotulo);

/* ── guardado no navegador (último sync do Metabase) ──────────────────────────── */

export const CHAVE_DIAGNOSTICO = "mcm_metabase_colunas";

export function gravarDiagnostico(d: DiagnosticoDoCard): void {
  // sincronização de planilha não substitui o retrato do card do Metabase
  try {
    if (d.origem === "metabase" || !localStorage.getItem(CHAVE_DIAGNOSTICO)) localStorage.setItem(CHAVE_DIAGNOSTICO, JSON.stringify(d));
  } catch { /* melhor-esforço */ }
}

export function lerDiagnostico(): DiagnosticoDoCard | null {
  try {
    const raw = localStorage.getItem(CHAVE_DIAGNOSTICO);
    return raw ? (JSON.parse(raw) as DiagnosticoDoCard) : null;
  } catch {
    return null;
  }
}
