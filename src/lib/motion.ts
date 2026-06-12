// Tokens de duração e curvas de animação — usar sempre estas constantes.
// Proibido usar valores soltos em className/style para timing de animação.

export const DUR = {
  fast: 120,   // ms — press states, badges, chips
  base: 200,   // ms — hover, toggle, toast
  slow: 320,   // ms — painéis, dialogs, expansão de cards
} as const;

export const EASE = {
  enter: "cubic-bezier(0.16, 1, 0.3, 1)",  // ease-out acentuado — entradas
  move:  "cubic-bezier(0.45, 0, 0.25, 1)", // ease-in-out — movimentos de posição
} as const;

// Spring configs para Framer Motion (fase futura)
export const SPRING = {
  snappy: { type: "spring", damping: 20, stiffness: 400 } as const,
  smooth: { type: "spring", damping: 30, stiffness: 200 } as const,
} as const;
