// Telefone da lista do 3C Plus. A lista era gravada com o telefone EXATAMENTE como está no banco, e o banco mistura
// formatos ("27992263119", "+5573998171702", com máscara, às vezes sem DDD). O 3C não lê tudo igual: número sem DDD
// ele completa com o DDD padrão da conta (11) — a "ligação pra São Paulo" que o pessoal viu numa tarefa de outro estado.
// Aqui todo número vai no MESMO formato (DDD + número, só dígitos) e o que não tem DDD válido NÃO vai pra lista:
// melhor aparecer num aviso do que ser discado no DDD errado.
//
// Sem imports de propósito (regra pura, testada).

// (tipo "achatado" de propósito: o tsconfig do projeto não é strict e não estreita união discriminada por boolean)
export type Telefone3c = { ok: boolean; numero?: string; motivo?: "sem_ddd" | "invalido" };

export function telefoneParaLista3c(bruto: string | null | undefined): Telefone3c {
  let d = String(bruto ?? "").replace(/\D/g, "");
  if (!d) return { ok: false, motivo: "invalido" };
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); // DDI do Brasil
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1); // "0" de operadora/tronco
  if (d.length === 8 || d.length === 9) return { ok: false, motivo: "sem_ddd" };
  if (d.length !== 10 && d.length !== 11) return { ok: false, motivo: "invalido" };
  if (!/^[1-9][1-9]/.test(d)) return { ok: false, motivo: "invalido" }; // DDD de 11 a 99, sem zero
  if (d.length === 11 && d[2] !== "9") return { ok: false, motivo: "invalido" }; // celular tem 9 na frente
  return { ok: true, numero: d };
}

export type Linha3c = { nome: string; telefone: string | null | undefined };

/** Linhas da lista (nome já com o primeiro nome), sem repetir número, e quem ficou de fora e por quê. */
export function montarLista3c(linhas: Linha3c[]): {
  linhas: { nome: string; telefone: string }[];
  semDdd: string[];
  invalidos: string[];
  repetidos: number;
} {
  const vistos = new Set<string>();
  const saida: { nome: string; telefone: string }[] = [];
  const semDdd: string[] = [];
  const invalidos: string[] = [];
  let repetidos = 0;
  for (const l of linhas) {
    if (!String(l.telefone ?? "").trim()) continue; // sem telefone nenhum: já não entrava
    const r = telefoneParaLista3c(l.telefone);
    if (!r.ok) {
      (r.motivo === "sem_ddd" ? semDdd : invalidos).push(l.nome);
      continue;
    }
    const numero = r.numero as string;
    if (vistos.has(numero)) { repetidos++; continue; }
    vistos.add(numero);
    saida.push({ nome: l.nome, telefone: numero });
  }
  return { linhas: saida, semDdd, invalidos, repetidos };
}
