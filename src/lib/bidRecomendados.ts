// Seleção da aba "Recomendados" do BID Dashboard.
//
// Antes a lista e o "selecionar todos" só enxergavam as 30 primeiras do ranking (uma leva),
// então marcar todos pegava 30 mesmo havendo 150. Agora a seleção é sobre o ranking
// INTEIRO — igual à aba Disponíveis — e quem divide em levas de 30 (5 min entre levas,
// parando quando a tarefa fecha) é o próprio disparo (BidDispatchQueue / rodarEmLevas).

export type ItemRanqueado = {
  _key: string;
  telefone: string | null;
  origin: "disponivel" | "novo" | "lead_saac" | "lead_regiao";
};

// Quantas linhas a aba mostra antes de "ver todos" — o mesmo 40 de Disponíveis.
export const LINHAS_INICIAIS = 40;

/** Linhas exibidas: as primeiras 40 até o analista pedir "ver todos" (ou buscar). */
export function linhasExibidas<T>(ranqueados: T[], verTodos: boolean): T[] {
  return verTodos ? ranqueados : ranqueados.slice(0, LINHAS_INICIAIS);
}

/** Chaves que o "selecionar todos" marca: TODOS os ranqueados com telefone. */
export function chavesSelecionaveis(ranqueados: ItemRanqueado[]): string[] {
  return ranqueados.filter((it) => !!it.telefone).map((it) => it._key);
}

/**
 * Separa o que foi marcado por mecanismo de disparo, mantendo a ordem do ranking:
 * quem é chapa (cadastro/Novos/Leads Saac) vai pro bot de BID em levas; Lead Região vai
 * pro template de Captação (nunca se cadastrou, não pode receber oferta de vaga).
 */
export function separarSelecionados<T extends ItemRanqueado>(
  ranqueados: T[],
  selecionados: Set<string>,
): { bot: T[]; captacao: T[] } {
  const marcados = ranqueados.filter((it) => selecionados.has(it._key) && !!it.telefone);
  return {
    bot: marcados.filter((it) => it.origin !== "lead_regiao"),
    captacao: marcados.filter((it) => it.origin === "lead_regiao"),
  };
}
