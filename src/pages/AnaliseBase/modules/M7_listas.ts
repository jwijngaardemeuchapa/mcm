import type { ChapaClassificado, ListaAcionavel, ListaItem, Turno } from "../types"

function toItem(c: ChapaClassificado, criterio: string, extra?: Partial<ListaItem>): ListaItem {
  return { ...c, criterio, ...extra }
}

export function gerarListas(
  chapas: ChapaClassificado[],
  turnos: Turno[],
  meta_semanal: number,
): ListaAcionavel[] {
  // 1. Pilares para conversa 1:1
  const pilares = chapas
    .filter((c) => c.categoria === "pilar")
    .sort((a, b) => b.score - a.score)
    .map((c) =>
      toItem(
        c,
        `${Math.round(c.concentracao_pct * 100)}% da operação · ${c.total_finalizado} finalizadas · score ${c.score}`,
      ),
    )

  // 2. Em Risco — ligar hoje
  const emRisco = chapas
    .filter((c) => c.categoria === "em_risco")
    .sort((a, b) => b.total_finalizado - a.total_finalizado)
    .map((c) =>
      toItem(
        c,
        `Sumiu há ${c.recencia_dias} dias · era ${c.era_pilar_60d ? "Pilar" : "Frequente"} antes`,
      ),
    )

  // 3. Mono-X órfãos: chapas que trabalham em apenas 1 turno
  const monoChapas = chapas.filter((c) => c.turno_perfil === "mono" && c.turno_principal)
  // Count chapas per shift
  const chapasPorTurno = new Map<string, number>()
  for (const c of chapas) {
    if (c.turno_principal) {
      chapasPorTurno.set(
        c.turno_principal,
        (chapasPorTurno.get(c.turno_principal) ?? 0) + 1,
      )
    }
  }
  const monoOrfaos = monoChapas
    .filter((c) => (chapasPorTurno.get(c.turno_principal!) ?? 0) <= 3) // small shift
    .sort((a, b) => b.total_finalizado - a.total_finalizado)
    .map((c) => {
      const tn = c.turno_distribuicao.find((td) => td.turno_id === c.turno_principal)?.turno_nome
      return toItem(c, `Exclusivo do turno ${tn ?? c.turno_principal} · ${c.total_finalizado} tarefas`)
    })

  // 4. Dormentes recuperáveis: recencia 30–60d (sweet spot for recovery)
  const dormentes = chapas
    .filter((c) => c.categoria === "dormente" && c.recencia_dias <= 60)
    .sort((a, b) => b.total_finalizado - a.total_finalizado)
    .map((c) =>
      toItem(c, `Inativo há ${c.recencia_dias} dias · ${c.total_finalizado} tarefas no histórico`),
    )

  // 5. Fantasmas para limpeza
  const fantasmas = chapas
    .filter((c) => c.categoria === "fantasma")
    .sort((a, b) => a.recencia_dias - b.recencia_dias) // most recent first (closer to recovery)
    .map((c) =>
      toItem(
        c,
        c.total_tarefas === 0
          ? "Nunca trabalhou (aprovado sem histórico)"
          : `Inativo há ${c.recencia_dias} dias · ${c.total_tarefas} tarefas`,
      ),
    )

  // 6. Novos para padrinho: suggest a pilar from same shift
  const novosPadrinho = chapas
    .filter((c) => c.categoria === "novo")
    .sort((a, b) => b.total_tarefas - a.total_tarefas)
    .map((c) => {
      const pilar = pilares.find(
        (p) => p.turno_principal === c.turno_principal,
      )
      return toItem(c, `Entrou há ${c.recencia_dias} dias · ${c.total_tarefas} tarefa(s)`, {
        pilar_sugerido: pilar?.nome ?? undefined,
      })
    })

  // 7. Candidatos à bonificação: frequencia 3-4 tasks/week, push to 5-6
  const bonificacao = chapas
    .filter(
      (c) =>
        c.frequencia_semanal >= meta_semanal * 0.5 &&
        c.frequencia_semanal < meta_semanal &&
        c.categoria !== "fantasma" &&
        c.categoria !== "dormente",
    )
    .sort((a, b) => b.frequencia_semanal - a.frequencia_semanal)
    .map((c) =>
      toItem(
        c,
        `${c.frequencia_semanal.toFixed(1)} tarefas/sem · meta: ${meta_semanal} · falta ${(meta_semanal - c.frequencia_semanal).toFixed(1)}`,
      ),
    )

  return [
    {
      tipo: "pilares_conversa",
      titulo: "Pilares — Conversa 1:1",
      descricao: "Chapas que sustentam a operação. Saída deles = catástrofe.",
      chapas: pilares,
    },
    {
      tipo: "em_risco_ligar",
      titulo: "Em Risco — Ligar Hoje",
      descricao: "Ativos que estão sumindo. Janela de recuperação ainda aberta.",
      chapas: emRisco,
    },
    {
      tipo: "mono_orfaos",
      titulo: "Mono-Turno Órfãos",
      descricao: "Trabalham em um único turno com poucos colegas — risco de descoberta.",
      chapas: monoOrfaos,
    },
    {
      tipo: "dormentes_recuperaveis",
      titulo: "Dormentes Recuperáveis",
      descricao: "Sumiram há 30–60 dias. Janela ideal para reativar.",
      chapas: dormentes,
    },
    {
      tipo: "fantasmas_limpeza",
      titulo: "Fantasmas — Limpeza",
      descricao: "Aprovados que nunca trabalharam ou inativos há 90+ dias.",
      chapas: fantasmas,
    },
    {
      tipo: "novos_padrinho",
      titulo: "Novos — Padrinho Sugerido",
      descricao: "Entraram há menos de 30 dias. Janela crítica de retenção.",
      chapas: novosPadrinho,
    },
    {
      tipo: "candidatos_bonificacao",
      titulo: "Candidatos à Bonificação",
      descricao: "Perto da meta semanal — um incentivo pode fazer a diferença.",
      chapas: bonificacao,
    },
  ]
}
