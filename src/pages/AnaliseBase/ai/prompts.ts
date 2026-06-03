import type { ChapaClassificado, AnaliseResultado, ListaAcionavel, ListaItem } from "../types"

export const SYSTEM_FICHA = `Você é um consultor operacional especializado em gestão de chapas logísticos.
Ao receber dados de um chapa, produza uma análise CURTA e DIRETA em 3 blocos obrigatórios:

[DIAGNÓSTICO]
1 ou 2 frases sobre o estado atual do chapa. Use os dados: categoria, tendência, recência, fill rate.

[ABORDAGEM]
- Bullet 1: tom recomendado (ex: "abordagem direta" / "tom motivacional" / "verificar disponibilidade")
- Bullet 2: o que perguntar ou oferecer
- Bullet 3 (se Em Risco ou Dormente): urgência e ação concreta

[SCRIPT]
Mensagem curta de WhatsApp pronta para copiar. Máximo 3 linhas. Sem emojis excessivos.
Chame pelo primeiro nome. Mencione a empresa. Seja objetivo.

Regras:
- Escreva APENAS os 3 blocos, sem mais texto
- Português brasileiro, tom operacional (não corporativo)
- Se fill rate < 60%: mencione isso na abordagem
- Se tendência = "caindo": destaque na urgência`

export const SYSTEM_LISTA = `Você é um especialista em reativação de trabalhadores operacionais.
Ao receber uma lista de chapas com critérios, produza UM PLANO DE CAMPANHA em 3 blocos:

[SEQUÊNCIA]
Numere os 5 chapas prioritários com justificativa em 1 linha cada.
Formato: "1. [Nome] — [motivo em 5 palavras]"

[SCRIPT DE ABERTURA]
Uma mensagem padrão de abertura para WhatsApp (serve para todos da lista).
Máximo 4 linhas. Mencione a empresa e o contexto (reativação / oportunidade / bonificação).

[QUEM IGNORAR]
Liste os chapas que não vale contatar agora (score muito baixo, sem interesse marcado, etc).
Se não houver ninguém para ignorar, escreva "Nenhum".

Regras:
- Escreva APENAS os 3 blocos
- Português brasileiro, tom direto`

export const SYSTEM_DASHBOARD = `Você é um analista sênior que faz briefings operacionais de 30 segundos.
Ao receber os KPIs de uma base de chapas, produza UM BRIEFING em 3 blocos curtos:

[PANORAMA]
1 frase resumindo o estado geral da base. Use fill rate, churn e concentração.

[PRIORIDADE]
1 ação concreta para hoje (a mais urgente). Baseie-se nos alertas e categorias.

[RISCOS]
- Até 3 bullet points com riscos identificados (dependência de chapa único, churn alto, etc)

Regras:
- APENAS os 3 blocos, sem mais texto
- Tom analítico, sem jargão corporativo`

export const SYSTEM_COMPARACAO = `Você narra mudanças semanais de base de chapas de forma direta e acionável.
Ao receber o estado atual vs. anterior, produza UMA NARRATIVA FLUIDA de 2 a 4 frases.

Mencione: quantos viraram Em Risco, quantos foram reativados, qual chapa merece atenção imediata.
Termine com a principal mudança que o analista deve agir hoje.

Exemplo de tom: "Esta semana 3 chapas viraram Em Risco (Carlos, Pedro, Ana).
Lucas e Marcos voltaram após 45 dias dormentes.
Atenção principal: Carlos era Pilar há 30 dias — ligar hoje."

Regras:
- UMA NARRATIVA contínua, sem blocos ou bullets
- Máximo 4 frases
- Use nomes reais dos chapas`

// ── Context builders ──────────────────────────────────────────────────────

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

export function buildFichaContext(chapa: ChapaClassificado, cliente: string): string {
  return JSON.stringify({
    nome: chapa.nome,
    categoria: chapa.categoria,
    score: chapa.score,
    recencia_dias: chapa.recencia_dias,
    fill_rate: `${(chapa.fill_rate_individual * 100).toFixed(0)}%`,
    frequencia_semanal: chapa.frequencia_semanal.toFixed(1),
    tendencia: chapa.tendencia,
    turno_perfil: chapa.turno_perfil,
    turno_principal: chapa.turno_principal,
    dias_preferidos: chapa.dias_preferidos.map((d) => DIAS[d]),
    total_finalizado: chapa.total_finalizado,
    total_cancelado: chapa.total_cancelado,
    era_pilar: chapa.era_pilar_60d,
    cliente,
  })
}

export function buildListaContext(
  lista: ListaAcionavel,
  scores: Map<string, number>,
  cliente: string,
): string {
  const top = lista.chapas.slice(0, 10).map((c) => ({
    nome: c.nome,
    score: c.score,
    criterio: c.criterio,
  }))
  return JSON.stringify({
    tipo: lista.tipo,
    titulo: lista.titulo,
    total: lista.chapas.length,
    top10: top,
    cliente,
  })
}

export function buildDashboardContext(resultado: AnaliseResultado): string {
  const cats: Record<string, number> = {}
  for (const c of resultado.chapas) cats[c.categoria] = (cats[c.categoria] ?? 0) + 1

  const totalFin = resultado.chapas.reduce((s, c) => s + c.total_finalizado, 0)
  const totalTar = resultado.chapas.reduce((s, c) => s + c.total_tarefas, 0)
  const fillRate = totalTar > 0 ? (totalFin / totalTar * 100).toFixed(1) : "0"

  return JSON.stringify({
    cliente: resultado.cliente,
    periodo: `${resultado.periodo_inicio.toLocaleDateString("pt-BR")} – ${resultado.periodo_fim.toLocaleDateString("pt-BR")}`,
    total_chapas: resultado.total_chapas,
    fill_rate_geral: `${fillRate}%`,
    churn_mensal: `${(resultado.cohort.churn_mensal * 100).toFixed(0)}%`,
    concentracao_top5: `${(resultado.concentracao.top5_pct * 100).toFixed(0)}%`,
    distribuicao: cats,
    spof_turnos: resultado.concentracao.spof_turnos.slice(0, 3).map((s) => ({
      turno: s.turno_nome,
      chapa: s.chapa_nome,
      cobertura: `${(s.pct_turno * 100).toFixed(0)}%`,
    })),
  })
}

export function buildComparacaoContext(
  atual: AnaliseResultado,
  anteriorCats: Record<string, number>,
  anteriorPeriodo: string,
): string {
  const atualCats: Record<string, number> = {}
  for (const c of atual.chapas) atualCats[c.categoria] = (atualCats[c.categoria] ?? 0) + 1

  return JSON.stringify({
    periodo_atual: atual.periodo_fim.toLocaleDateString("pt-BR"),
    periodo_anterior: anteriorPeriodo,
    atual: atualCats,
    anterior: anteriorCats,
    em_risco_nomes: atual.chapas
      .filter((c) => c.categoria === "em_risco")
      .slice(0, 5)
      .map((c) => c.nome),
    dormentes_nomes: atual.chapas
      .filter((c) => c.categoria === "dormente")
      .slice(0, 3)
      .map((c) => c.nome),
  })
}
