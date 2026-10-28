/**
 * Alarme de chapas pendentes: pra cada chapa que ainda não confirmou, diz O QUE FAZER AGORA e POR QUÊ.
 *
 * O relógio que manda é o do SILÊNCIO — quanto tempo passou desde o último disparo sem resposta:
 *   - FUP     → recomenda remover depois de `limiteFupMin`    (padrão 25 min)
 *   - PréFUP  → recomenda remover depois de `limitePrefupMin` (padrão 60 min)
 * O relógio da tarefa só ENCURTA a espera (faltam menos de CRITICO_MIN: não dá mais pra esperar) e
 * define a urgência do alarme. Nunca remove sozinho: é uma recomendação, o analista confirma.
 *
 * Escada por chapa:  enviar → aguardar → cobrar (outro canal) → remover e repor.
 *
 * Sem imports de propósito (mesmo motivo de fasesConfirmacao.ts): é regra pura, testável sem banco nem tela.
 */

export type TipoDisparo = "prefup" | "fup";
export type Acao = "ler_resposta" | "enviar" | "aguardar" | "cobrar" | "remover" | "achar_telefone" | "sobrando";
/** Urgência (pro som, a cor e a notificação). */
export type Nivel = "calmo" | "atencao" | "decidir" | "critico";

export type ConfigAlarme = {
  limiteFupMin: number;
  limitePrefupMin: number;
};
export const CONFIG_ALARME_PADRAO: ConfigAlarme = { limiteFupMin: 25, limitePrefupMin: 60 };

/** Passou desta fração do limite sem resposta → hora de tentar outro canal (ligar / WhatsApp). */
export const COBRAR_APOS = 0.6;
/** Faltando menos que isso pra tarefa, esperar resposta não faz mais sentido. */
export const CRITICO_MIN = 10;
/** Sem telefone: dá este tempo pra achar o número antes de recomendar remover. */
export const TELEFONE_LIMITE_MIN = 30;
/** Remoção recomendada com menos que isso pra tarefa = urgência máxima (pouco tempo pra repor). */
export const REPOR_APERTADO_MIN = 30;
/** Entre isso e REPOR_APERTADO_MIN a remoção é "decidir"; com a tarefa mais longe é só "atenção" (dá tempo de repor). */
export const REPOR_DECIDIR_MIN = 300;
/** "Enviar" e "achar o telefone" só viram alerta quando a tarefa está perto; antes disso é rotina (calmo). */
export const URGENTE_PRA_AGIR_MIN = 120;

export type EntradaChapa = {
  id: string;
  nome: string;
  telefone: string | null;
  /** status_contato: pendente | nao_respondeu | cancelado (confirmado e removido nem entram) */
  status: string;
  /** Já recebeu o aviso de "sem resposta" (canal umbler_cancelamento) e continua sem confirmar. */
  semRespostaEnviado: boolean;
  /** Tem mensagem dele no chat que ninguém leu. */
  naoLida: boolean;
  ultimoDisparo: { quando: number; tipo: TipoDisparo; canal: string } | null;
  /** Quantos disparos ele já recebeu nesta tarefa. */
  disparos: number;
  /** Confiabilidade nos últimos 15 dias (só informa; não muda a regra). */
  estrelas: number | null;
  faltas: number | null;
};

export type EntradaTarefa = {
  id_tarefa: number;
  empresa: string;
  data_tarefa: string;
  minParaTarefa: number;
  solicitados: number;
  confirmados: number;
  /** O próximo disparo, pela janela de hoje: PréFUP (≥ 5 h antes ou amanhã) ou FUP. */
  tipoSugerido: TipoDisparo;
  chapas: EntradaChapa[];
};

export type Diagnostico = {
  acao: Acao;
  nivel: Nivel;
  recomendaRemocao: boolean;
  /** Rótulo curto da ação ("Remover e repor"). */
  titulo: string;
  /** Os porquês, em português simples. */
  motivos: string[];
  /** Em aguardar/cobrar: minutos até a remoção ser recomendada. */
  minutosParaDecidir: number | null;
  silencioMin: number | null;
  tipoDisparo: TipoDisparo | null;
};

export const rotuloDisparo = (t: TipoDisparo): string => (t === "prefup" ? "PréFUP" : "FUP");

export function fmtMin(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h} h ${r} min` : `${h} h`;
}

function limiteDe(tipo: TipoDisparo, cfg: ConfigAlarme): number {
  return tipo === "prefup" ? cfg.limitePrefupMin : cfg.limiteFupMin;
}

function nivelDaRemocao(minParaTarefa: number): Nivel {
  return minParaTarefa <= REPOR_APERTADO_MIN ? "critico" : minParaTarefa <= REPOR_DECIDIR_MIN ? "decidir" : "atencao";
}

/** Primeiro contato / achar telefone: rotina enquanto a tarefa está longe, alerta quando chega perto. */
function nivelDeRotina(minParaTarefa: number): Nivel {
  return minParaTarefa <= URGENTE_PRA_AGIR_MIN ? "atencao" : "calmo";
}

export function diagnosticar(
  c: EntradaChapa,
  ctx: { minParaTarefa: number; tipoSugerido: TipoDisparo; vagasAbertas: number },
  agora: number,
  cfg: ConfigAlarme = CONFIG_ALARME_PADRAO,
): Diagnostico {
  const base = { recomendaRemocao: false, minutosParaDecidir: null, silencioMin: null, tipoDisparo: null } as const;
  const remover = (motivos: string[], extra: Partial<Diagnostico> = {}): Diagnostico => ({
    ...base, acao: "remover", nivel: nivelDaRemocao(ctx.minParaTarefa), recomendaRemocao: true,
    titulo: "Remover e repor", motivos, ...extra,
  });

  // 1. Quem acabou de escrever nunca é tratado como "sem resposta".
  if (c.naoLida) {
    return {
      ...base, acao: "ler_resposta", nivel: "atencao", titulo: "Ler a resposta",
      motivos: ["Mandou mensagem. Leia antes de cobrar ou remover"],
    };
  }

  // 2. Tarefa já completa: quem sobra não abre vaga nem precisa de alarme.
  if (ctx.vagasAbertas <= 0) {
    return {
      ...base, acao: "sobrando", nivel: "calmo", titulo: "Sobra na tarefa",
      motivos: ["Tarefa já completa: dá para liberar"],
    };
  }

  // 3. Decisão já tomada por ele (ou por um aviso que você mandou).
  if (c.status === "cancelado") {
    return remover(["Respondeu que não vai"]);
  }
  if (c.semRespostaEnviado) {
    return remover(["Já recebeu o aviso de sem resposta"]);
  }

  // 4. Sem telefone não há como cobrar.
  if (!c.telefone) {
    if (ctx.minParaTarefa > TELEFONE_LIMITE_MIN) {
      return {
        ...base, acao: "achar_telefone", nivel: nivelDeRotina(ctx.minParaTarefa), titulo: "Achar o telefone",
        motivos: ["Sem número. Procure no cadastro ou no grupo"],
      };
    }
    return remover([`Sem telefone e faltam só ${fmtMin(ctx.minParaTarefa)} para a tarefa`]);
  }

  // 5. Nunca recebeu nada.
  const d = c.ultimoDisparo;
  if (!d) {
    return {
      ...base, acao: "enviar", nivel: nivelDeRotina(ctx.minParaTarefa), titulo: `Enviar ${rotuloDisparo(ctx.tipoSugerido)}`, tipoDisparo: ctx.tipoSugerido,
      motivos: ["Ainda sem contato"],
    };
  }

  // 6. Respondeu ao PréFUP? Não: agora é a hora do FUP de reforço, que ganha o seu próprio relógio.
  if (d.tipo === "prefup" && ctx.tipoSugerido === "fup" && ctx.minParaTarefa > CRITICO_MIN) {
    return {
      ...base, acao: "enviar", nivel: nivelDeRotina(ctx.minParaTarefa), titulo: "Enviar FUP", tipoDisparo: "fup",
      silencioMin: (agora - d.quando) / 60_000,
      motivos: ["Não confirmou o PréFUP: mande o FUP de reforço"],
    };
  }

  // 7. Contatado e sem resposta: o relógio do silêncio.
  const limite = limiteDe(d.tipo, cfg);
  const silencio = Math.max(0, (agora - d.quando) / 60_000);
  const restanteResposta = limite - silencio;
  const restanteTarefa = ctx.minParaTarefa - CRITICO_MIN;
  const restante = Math.min(restanteResposta, restanteTarefa);
  const rotulo = rotuloDisparo(d.tipo);
  const ctxDisparo = { silencioMin: silencio, tipoDisparo: d.tipo } as const;

  if (restante <= 0) {
    const porSilencio = restanteResposta <= 0;
    return remover(
      [
        porSilencio
          ? `${rotulo} há ${fmtMin(silencio)} sem resposta (limite: ${limite} min)`
          : `Faltam só ${fmtMin(ctx.minParaTarefa)} para a tarefa`,
      ],
      ctxDisparo,
    );
  }

  if (restante <= (1 - COBRAR_APOS) * limite) {
    return {
      ...base, ...ctxDisparo, acao: "cobrar", nivel: "atencao", titulo: "Ligar ou chamar no WhatsApp",
      minutosParaDecidir: restante,
      motivos: [`Sem resposta há ${fmtMin(silencio)}. Tente outro canal; remoção em ${fmtMin(restante)}`],
    };
  }

  return {
    ...base, ...ctxDisparo, acao: "aguardar", nivel: "calmo", titulo: "Aguardando resposta",
    minutosParaDecidir: restante,
    motivos: [`${rotulo} há ${fmtMin(silencio)}. Decisão em ${fmtMin(restante)}`],
  };
}

/* ── por tarefa ───────────────────────────────────────────────────────────────── */

// Genéricos pra quem carrega campos a mais (ex.: o id da conversa) não perder o tipo ao diagnosticar.
export type ItemDiagnosticado<C extends EntradaChapa = EntradaChapa> = { chapa: C; d: Diagnostico };
type TarefaDe<C extends EntradaChapa> = Omit<EntradaTarefa, "chapas"> & { chapas: C[] };

export type TarefaDiagnosticada<C extends EntradaChapa = EntradaChapa, T extends TarefaDe<C> = TarefaDe<C>> = {
  tarefa: T;
  vagasAbertas: number;
  nivel: Nivel;
  itens: ItemDiagnosticado<C>[];
  /** Itens que pedem o analista agora (urgência acima de "calmo"). */
  acionaveis: ItemDiagnosticado<C>[];
  /** Rotina em dia: aguardando resposta, ou primeiro contato de tarefa ainda distante. */
  emDia: ItemDiagnosticado<C>[];
  /** Excedente de tarefa que já está completa. */
  sobrando: ItemDiagnosticado<C>[];
};

const PRIORIDADE: Record<Acao, number> = {
  remover: 0, ler_resposta: 1, cobrar: 2, enviar: 3, achar_telefone: 4, aguardar: 5, sobrando: 6,
};
const ORDEM_NIVEL: Nivel[] = ["calmo", "atencao", "decidir", "critico"];
export const maiorNivel = (a: Nivel, b: Nivel): Nivel => (ORDEM_NIVEL.indexOf(a) >= ORDEM_NIVEL.indexOf(b) ? a : b);

export function diagnosticarTarefa<C extends EntradaChapa, T extends TarefaDe<C>>(
  t: T, agora: number, cfg: ConfigAlarme = CONFIG_ALARME_PADRAO,
): TarefaDiagnosticada<C, T> {
  const vagasAbertas = t.solicitados - t.confirmados;
  const itens = t.chapas
    .map((chapa) => ({ chapa, d: diagnosticar(chapa, { minParaTarefa: t.minParaTarefa, tipoSugerido: t.tipoSugerido, vagasAbertas }, agora, cfg) }))
    .sort((a, b) => PRIORIDADE[a.d.acao] - PRIORIDADE[b.d.acao] || (b.d.silencioMin ?? 0) - (a.d.silencioMin ?? 0));
  return {
    tarefa: t,
    vagasAbertas,
    nivel: itens.reduce<Nivel>((n, i) => maiorNivel(n, i.d.nivel), "calmo"),
    itens,
    acionaveis: itens.filter((i) => i.d.nivel !== "calmo"),
    emDia: itens.filter((i) => i.d.nivel === "calmo" && i.d.acao !== "sobrando"),
    sobrando: itens.filter((i) => i.d.acao === "sobrando"),
  };
}

/** Todas as tarefas: as mais graves primeiro (crítico > decidir > atenção > em dia) e, no mesmo nível, as mais próximas do início. */
export function diagnosticarTudo<C extends EntradaChapa, T extends TarefaDe<C>>(
  tarefas: T[], agora: number, cfg: ConfigAlarme = CONFIG_ALARME_PADRAO,
): TarefaDiagnosticada<C, T>[] {
  return tarefas
    .map((t) => diagnosticarTarefa<C, T>(t, agora, cfg))
    .filter((t) => t.itens.length > 0)
    .sort((a, b) => ORDEM_NIVEL.indexOf(b.nivel) - ORDEM_NIVEL.indexOf(a.nivel) || a.tarefa.minParaTarefa - b.tarefa.minParaTarefa);
}

/* ── o que toca/notifica ──────────────────────────────────────────────────────── */

/** Ações que merecem chamar a atenção quando uma chapa ENTRA nelas. */
const ALARMANTES: Acao[] = ["ler_resposta", "cobrar", "remover"];

export type NovoAlarme = { chapaId: string; id_tarefa: number; empresa: string; nome: string; acao: Acao; nivel: Nivel };

/**
 * Compara com o que já foi avisado (`avisado`: chapa → ação) e devolve só quem ENTROU numa ação alarmante.
 * Atualiza `avisado` (some quem saiu, pra poder avisar de novo se voltar a precisar). Sem `primeira=true`
 * a 1ª leitura só registra o estado (abrir o app não toca o alarme por tudo que já estava pendente).
 */
export function novosAlarmes<C extends EntradaChapa, T extends TarefaDe<C>>(
  avisado: Map<string, Acao>, tarefas: TarefaDiagnosticada<C, T>[], primeira = false,
): NovoAlarme[] {
  const novos: NovoAlarme[] = [];
  const presentes = new Set<string>();
  for (const t of tarefas) {
    for (const { chapa, d } of t.itens) {
      presentes.add(chapa.id);
      const antes = avisado.get(chapa.id);
      if (!primeira && ALARMANTES.includes(d.acao) && antes !== d.acao) {
        novos.push({ chapaId: chapa.id, id_tarefa: t.tarefa.id_tarefa, empresa: t.tarefa.empresa, nome: chapa.nome, acao: d.acao, nivel: d.nivel });
      }
      avisado.set(chapa.id, d.acao);
    }
  }
  for (const id of [...avisado.keys()]) if (!presentes.has(id)) avisado.delete(id);
  return novos;
}

/** Quantos bipes (e a firmeza do aviso) pro conjunto de alarmes novos. */
export function bipesDoAlarme(novos: NovoAlarme[]): number {
  if (novos.length === 0) return 0;
  const n = novos.reduce<Nivel>((acc, a) => maiorNivel(acc, a.nivel), "calmo");
  return n === "critico" ? 3 : n === "decidir" ? 2 : 1;
}

/* ── notificação do Windows ───────────────────────────────────────────────────── */

const ROTULO_NOTIFICACAO: Partial<Record<Acao, string>> = {
  remover: "Remover e repor", cobrar: "Ligar ou chamar no WhatsApp", ler_resposta: "Ler a resposta",
};
const ORDEM_NOTIFICACAO: Acao[] = ["remover", "ler_resposta", "cobrar"];

export type TextoNotificacao = { tag: string; titulo: string; corpo: string };

/** Uma notificação por tarefa (a tag faz a nova substituir a anterior em vez de empilhar). */
export function textosDeNotificacao(novos: NovoAlarme[], minPorTarefa: Map<number, number>): TextoNotificacao[] {
  const porTarefa = new Map<number, NovoAlarme[]>();
  for (const n of novos) (porTarefa.get(n.id_tarefa) ?? porTarefa.set(n.id_tarefa, []).get(n.id_tarefa)!).push(n);
  const out: TextoNotificacao[] = [];
  for (const [id, lista] of porTarefa) {
    const min = minPorTarefa.get(id);
    const linhas = ORDEM_NOTIFICACAO.flatMap((acao) => {
      const nomes = lista.filter((n) => n.acao === acao).map((n) => n.nome);
      if (nomes.length === 0) return [];
      const mostra = nomes.slice(0, 3).join(", ") + (nomes.length > 3 ? ` e mais ${nomes.length - 3}` : "");
      return [`${ROTULO_NOTIFICACAO[acao]}: ${mostra}`];
    });
    out.push({
      tag: `alarme-${id}`,
      titulo: `${lista[0].empresa}${min !== undefined ? ` — faltam ${fmtMin(min)}` : ""}`,
      corpo: linhas.join("\n"),
    });
  }
  return out;
}
