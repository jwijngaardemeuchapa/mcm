// Registro global e mínimo de "qual painel de tarefa está aberto agora" —
// permite que o atalho de teclado ←/→ do Dashboard (usado hoje pra navegar
// entre dias) ceda espaço pra navegação prev/next de tarefa quando o
// TaskDetailPanel (dialog usado por Panorama/Timeline) está aberto, e volte
// a navegar por dia assim que ele fecha. Sem contexto/provider porque só
// existe um TaskDetailPanel montado por vez na árvore (Panorama tem o seu,
// Dashboard tem o da Timeline) — um singleton simples resolve sem prop
// drilling até o keydown handler do Dashboard.
export type TaskNavHandlers = {
  hasPrev: boolean;
  hasNext: boolean;
  onNavigate: (direction: "prev" | "next") => void;
};

let active: TaskNavHandlers | null = null;

export function setActiveTaskNav(nav: TaskNavHandlers | null) {
  active = nav;
}

export function getActiveTaskNav(): TaskNavHandlers | null {
  return active;
}

/**
 * Chamado pelo keydown handler do Dashboard antes de decidir se ←/→ deve
 * navegar por dia. Retorna true se o evento foi consumido pela navegação de
 * tarefa (inclusive quando está no limite e não faz nada) — o chamador não
 * deve fazer mais nada nesse caso.
 */
export function consumeArrowKey(key: "ArrowLeft" | "ArrowRight"): boolean {
  if (!active) return false;
  const direction = key === "ArrowLeft" ? "prev" : "next";
  const canGo = direction === "prev" ? active.hasPrev : active.hasNext;
  if (canGo) active.onNavigate(direction);
  return true;
}
