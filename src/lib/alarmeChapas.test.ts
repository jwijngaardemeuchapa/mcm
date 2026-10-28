import { describe, expect, it } from "vitest";
import {
  bipesDoAlarme, CONFIG_ALARME_PADRAO, diagnosticar, diagnosticarTarefa, diagnosticarTudo, fmtMin, novosAlarmes, textosDeNotificacao,
  type Acao, type EntradaChapa, type EntradaTarefa, type TipoDisparo,
} from "./alarmeChapas";

const AGORA = Date.UTC(2026, 9, 28, 15, 0, 0);
const MIN = 60_000;

const chapa = (over: Partial<EntradaChapa> = {}): EntradaChapa => ({
  id: "c1", nome: "Ana", telefone: "11999990001", status: "pendente", semRespostaEnviado: false, naoLida: false,
  ultimoDisparo: null, disparos: 0, estrelas: null, faltas: null, ...over,
});
/** Disparo feito `haMin` minutos atrás. */
const disparo = (tipo: TipoDisparo, haMin: number) => ({ quando: AGORA - haMin * MIN, tipo, canal: "umbler_talk" });
const ctx = (over: Partial<{ minParaTarefa: number; tipoSugerido: TipoDisparo; vagasAbertas: number }> = {}) =>
  ({ minParaTarefa: 120, tipoSugerido: "fup" as TipoDisparo, vagasAbertas: 2, ...over });
const diag = (c: Partial<EntradaChapa>, x: Parameters<typeof ctx>[0] = {}, cfg = CONFIG_ALARME_PADRAO) =>
  diagnosticar(chapa(c), ctx(x), AGORA, cfg);

describe("padrões pedidos: FUP 25 min, PréFUP 1 h", () => {
  it("o padrão da config é 25 e 60", () => {
    expect(CONFIG_ALARME_PADRAO).toEqual({ limiteFupMin: 25, limitePrefupMin: 60 });
  });

  it("FUP: antes de 25 min sem resposta NÃO recomenda remover; com 25 min, recomenda", () => {
    expect(diag({ ultimoDisparo: disparo("fup", 24), disparos: 1 }).recomendaRemocao).toBe(false);
    const d = diag({ ultimoDisparo: disparo("fup", 25), disparos: 1 });
    expect(d.acao).toBe("remover");
    expect(d.recomendaRemocao).toBe(true);
    expect(d.motivos[0]).toBe("FUP há 25 min sem resposta (limite: 25 min)");
  });

  it("PréFUP: com 59 min ainda não; com 60 min recomenda (tarefa longe, fora da janela do FUP)", () => {
    const longe = { tipoSugerido: "prefup" as TipoDisparo, minParaTarefa: 24 * 60 };
    expect(diag({ ultimoDisparo: disparo("prefup", 59), disparos: 1 }, longe).recomendaRemocao).toBe(false);
    const d = diag({ ultimoDisparo: disparo("prefup", 60), disparos: 1 }, longe);
    expect(d.acao).toBe("remover");
    expect(d.motivos[0]).toBe("PréFUP há 1 h sem resposta (limite: 60 min)");
  });

  it("os limites são configuráveis", () => {
    const cfg = { limiteFupMin: 10, limitePrefupMin: 90 };
    expect(diag({ ultimoDisparo: disparo("fup", 10), disparos: 1 }, {}, cfg).acao).toBe("remover");
    const longe = { tipoSugerido: "prefup" as TipoDisparo, minParaTarefa: 24 * 60 };
    expect(diag({ ultimoDisparo: disparo("prefup", 60), disparos: 1 }, longe, cfg).recomendaRemocao).toBe(false);
    expect(diag({ ultimoDisparo: disparo("prefup", 90), disparos: 1 }, longe, cfg).recomendaRemocao).toBe(true);
  });
});

describe("a escada: aguardar → cobrar → remover", () => {
  it("FUP há 5 min: aguardar, com quanto falta pra decisão", () => {
    const d = diag({ ultimoDisparo: disparo("fup", 5), disparos: 1 });
    expect(d.acao).toBe("aguardar");
    expect(d.nivel).toBe("calmo");
    expect(Math.round(d.minutosParaDecidir!)).toBe(20);
    expect(d.motivos.join(" ")).toContain("20 min");
  });

  it("passou de 60% do prazo (15 min no FUP): hora de cobrar por outro canal", () => {
    expect(diag({ ultimoDisparo: disparo("fup", 14), disparos: 1 }).acao).toBe("aguardar");
    const d = diag({ ultimoDisparo: disparo("fup", 15), disparos: 1 });
    expect(d.acao).toBe("cobrar");
    expect(d.nivel).toBe("atencao");
    expect(d.titulo).toContain("Ligar");
    expect(d.motivos[0]).toBe("Sem resposta há 15 min. Tente outro canal; remoção em 10 min");
  });

  it("PréFUP: cobra a partir de 36 min", () => {
    const longe = { tipoSugerido: "prefup" as TipoDisparo, minParaTarefa: 24 * 60 };
    expect(diag({ ultimoDisparo: disparo("prefup", 35), disparos: 1 }, longe).acao).toBe("aguardar");
    expect(diag({ ultimoDisparo: disparo("prefup", 36), disparos: 1 }, longe).acao).toBe("cobrar");
  });
});

describe("o relógio da tarefa só encurta a espera", () => {
  it("faltam menos de 10 min pra tarefa: remover mesmo com FUP recém-enviado", () => {
    const d = diag({ ultimoDisparo: disparo("fup", 2), disparos: 1 }, { minParaTarefa: 9 });
    expect(d.acao).toBe("remover");
    expect(d.motivos[0]).toContain("Faltam só 9 min para a tarefa");
  });

  it("a decisão chega antes do limite quando a tarefa está perto", () => {
    // FUP há 5 min (limite 25 → 20 min restantes), mas a tarefa começa em 25 min → só 15 min até o "crítico"
    const d = diag({ ultimoDisparo: disparo("fup", 5), disparos: 1 }, { minParaTarefa: 25 });
    expect(Math.round(d.minutosParaDecidir!)).toBe(15);
  });

  it("remoção recomendada com 30 min ou menos pra tarefa = urgência crítica; mais que isso = decidir", () => {
    expect(diag({ ultimoDisparo: disparo("fup", 30), disparos: 1 }, { minParaTarefa: 31 }).nivel).toBe("decidir");
    expect(diag({ ultimoDisparo: disparo("fup", 30), disparos: 1 }, { minParaTarefa: 30 }).nivel).toBe("critico");
  });

  it("tarefa longe não acelera nada", () => {
    expect(diag({ ultimoDisparo: disparo("fup", 5), disparos: 1 }, { minParaTarefa: 600 }).acao).toBe("aguardar");
  });
});

describe("exceções que vencem o relógio", () => {
  it("resposta não lida: ler primeiro — mesmo passado o limite, nunca recomenda remover", () => {
    const d = diag({ naoLida: true, ultimoDisparo: disparo("fup", 90), disparos: 1 });
    expect(d.acao).toBe("ler_resposta");
    expect(d.recomendaRemocao).toBe(false);
    expect(d.nivel).toBe("atencao");
  });

  it("resposta não lida vence até o 'respondeu que não vai'", () => {
    expect(diag({ naoLida: true, status: "cancelado" }).acao).toBe("ler_resposta");
  });

  it("respondeu que não vai (cancelado): remover já, sem esperar o relógio", () => {
    const d = diag({ status: "cancelado", ultimoDisparo: disparo("fup", 1), disparos: 1 });
    expect(d.acao).toBe("remover");
    expect(d.motivos[0]).toBe("Respondeu que não vai");
  });

  it("já recebeu o aviso de 'sem resposta': remover", () => {
    const d = diag({ semRespostaEnviado: true, ultimoDisparo: disparo("fup", 1), disparos: 1 });
    expect(d.acao).toBe("remover");
    expect(d.motivos[0]).toBe("Já recebeu o aviso de sem resposta");
  });

  it("nunca contatado: enviar — PréFUP ou FUP conforme a janela de hoje", () => {
    expect(diag({}, { tipoSugerido: "fup" })).toMatchObject({ acao: "enviar", titulo: "Enviar FUP", tipoDisparo: "fup", nivel: "atencao" });
    expect(diag({}, { tipoSugerido: "prefup" })).toMatchObject({ acao: "enviar", titulo: "Enviar PréFUP", tipoDisparo: "prefup" });
  });

  it("sem telefone: achar o número; com 30 min ou menos pra tarefa, remover", () => {
    expect(diag({ telefone: null }, { minParaTarefa: 31 }).acao).toBe("achar_telefone");
    expect(diag({ telefone: "" }, { minParaTarefa: 31 }).acao).toBe("achar_telefone");
    const d = diag({ telefone: null }, { minParaTarefa: 30 });
    expect(d.acao).toBe("remover");
    expect(d.motivos[0]).toContain("Sem telefone");
  });

  it("tarefa já completa: a chapa que sobra não gera alarme (nem remoção)", () => {
    const d = diag({ ultimoDisparo: disparo("fup", 90), disparos: 1 }, { vagasAbertas: 0 });
    expect(d.acao).toBe("sobrando");
    expect(d.nivel).toBe("calmo");
    expect(d.recomendaRemocao).toBe(false);
  });

  it("tarefa com mais confirmados que o pedido também conta como completa", () => {
    expect(diag({}, { vagasAbertas: -1 }).acao).toBe("sobrando");
  });
});

describe("urgência pela distância da tarefa (rotina não vira alarme)", () => {
  it("primeiro contato: rotina com a tarefa longe; alerta com 2 h ou menos", () => {
    expect(diag({}, { minParaTarefa: 121 }).nivel).toBe("calmo");
    expect(diag({}, { minParaTarefa: 120 }).nivel).toBe("atencao");
    expect(diag({}, { minParaTarefa: 121 }).acao).toBe("enviar"); // a recomendação existe, só não toca nem pisca
  });

  it("achar o telefone: idem", () => {
    expect(diag({ telefone: null }, { minParaTarefa: 600 }).nivel).toBe("calmo");
    expect(diag({ telefone: null }, { minParaTarefa: 100 }).nivel).toBe("atencao");
  });

  it("remoção recomendada: crítico até 30 min, decidir até 5 h, atenção além (ex.: PréFUP de amanhã)", () => {
    const sem = (min: number) => diag({ status: "cancelado" }, { minParaTarefa: min });
    expect(sem(30).nivel).toBe("critico");
    expect(sem(31).nivel).toBe("decidir");
    expect(sem(300).nivel).toBe("decidir");
    expect(sem(301).nivel).toBe("atencao");
    expect(sem(1200).recomendaRemocao).toBe(true); // continua recomendando, só toca mais suave
  });

  it("tarefa longe com só rotina: nada acionável — tudo em dia", () => {
    const t = diagnosticarTarefa(tarefa({ minParaTarefa: 1000 }, [chapa({ id: "a" }), chapa({ id: "b", telefone: null }), chapa({ id: "c", ultimoDisparo: disparo("fup", 3), disparos: 1 })]), AGORA);
    expect(t.acionaveis).toEqual([]);
    expect(t.emDia.map((i) => i.chapa.id).sort()).toEqual(["a", "b", "c"]);
    expect(t.nivel).toBe("calmo");
  });
});

describe("PréFUP sem resposta e a tarefa já na janela do FUP", () => {
  it("manda o FUP de reforço (segunda chance) em vez de recomendar remover", () => {
    const d = diag({ ultimoDisparo: disparo("prefup", 600), disparos: 1 }, { tipoSugerido: "fup", minParaTarefa: 180 });
    expect(d.acao).toBe("enviar");
    expect(d.titulo).toBe("Enviar FUP");
    expect(d.motivos[0]).toBe("Não confirmou o PréFUP: mande o FUP de reforço");
  });

  it("mas a menos de 10 min da tarefa não dá mais tempo de reforço: remover", () => {
    expect(diag({ ultimoDisparo: disparo("prefup", 600), disparos: 1 }, { tipoSugerido: "fup", minParaTarefa: 8 }).acao).toBe("remover");
  });

  it("depois do FUP de reforço, vale o relógio do FUP (25 min)", () => {
    expect(diag({ ultimoDisparo: disparo("fup", 25), disparos: 2 }, { tipoSugerido: "fup", minParaTarefa: 180 }).acao).toBe("remover");
    expect(diag({ ultimoDisparo: disparo("fup", 5), disparos: 2 }, { tipoSugerido: "fup", minParaTarefa: 180 }).acao).toBe("aguardar");
  });
});

describe("fmtMin", () => {
  it("minutos e horas", () => {
    expect(fmtMin(0)).toBe("0 min");
    expect(fmtMin(24.6)).toBe("25 min");
    expect(fmtMin(60)).toBe("1 h");
    expect(fmtMin(125)).toBe("2 h 5 min");
  });
});

/* ── por tarefa ───────────────────────────────────────────────────────────────── */

const tarefa = (over: Partial<EntradaTarefa> = {}, chapas: EntradaChapa[] = []): EntradaTarefa => ({
  id_tarefa: 1, empresa: "ACME", data_tarefa: "2026-10-28T18:00:00-03:00", minParaTarefa: 120, solicitados: 5, confirmados: 3,
  tipoSugerido: "fup", chapas, ...over,
});

describe("diagnosticarTarefa", () => {
  it("conta vagas, ordena por prioridade (remover primeiro) e separa os grupos", () => {
    const t = diagnosticarTarefa(tarefa({}, [
      chapa({ id: "espera", nome: "Espera", ultimoDisparo: disparo("fup", 3), disparos: 1 }),
      chapa({ id: "remover", nome: "Remover", ultimoDisparo: disparo("fup", 40), disparos: 1 }),
      chapa({ id: "ler", nome: "Ler", naoLida: true }),
      chapa({ id: "enviar", nome: "Enviar" }),
      chapa({ id: "cobrar", nome: "Cobrar", ultimoDisparo: disparo("fup", 18), disparos: 1 }),
    ]), AGORA);
    expect(t.vagasAbertas).toBe(2);
    expect(t.itens.map((i) => i.chapa.id)).toEqual(["remover", "ler", "cobrar", "enviar", "espera"]);
    expect(t.acionaveis.map((i) => i.chapa.id)).toEqual(["remover", "ler", "cobrar", "enviar"]);
    expect(t.emDia.map((i) => i.chapa.id)).toEqual(["espera"]);
    expect(t.sobrando).toEqual([]);
    expect(t.nivel).toBe("decidir");
  });

  it("o nível da tarefa é o pior entre as chapas", () => {
    const calma = diagnosticarTarefa(tarefa({}, [chapa({ ultimoDisparo: disparo("fup", 3), disparos: 1 })]), AGORA);
    expect(calma.nivel).toBe("calmo");
    const critica = diagnosticarTarefa(tarefa({ minParaTarefa: 20 }, [chapa({ ultimoDisparo: disparo("fup", 40), disparos: 1 })]), AGORA);
    expect(critica.nivel).toBe("critico");
  });

  it("tarefa completa: tudo vira 'sobrando'", () => {
    const t = diagnosticarTarefa(tarefa({ confirmados: 5 }, [chapa({ ultimoDisparo: disparo("fup", 90), disparos: 1 })]), AGORA);
    expect(t.sobrando).toHaveLength(1);
    expect(t.acionaveis).toEqual([]);
    expect(t.nivel).toBe("calmo");
  });

  it("empate de prioridade: quem está há mais tempo em silêncio vem primeiro", () => {
    const t = diagnosticarTarefa(tarefa({}, [
      chapa({ id: "a", ultimoDisparo: disparo("fup", 30), disparos: 1 }),
      chapa({ id: "b", ultimoDisparo: disparo("fup", 50), disparos: 1 }),
    ]), AGORA);
    expect(t.itens.map((i) => i.chapa.id)).toEqual(["b", "a"]);
  });
});

describe("diagnosticarTudo", () => {
  it("tarefas mais próximas do início primeiro (no mesmo nível); tarefa sem chapa pendente some", () => {
    const r = diagnosticarTudo([
      tarefa({ id_tarefa: 3, minParaTarefa: 300 }, [chapa({ id: "x" })]),
      tarefa({ id_tarefa: 2, minParaTarefa: 40 }, [chapa({ id: "y" })]),
      tarefa({ id_tarefa: 4, minParaTarefa: 10 }, []),
    ], AGORA);
    expect(r.map((t) => t.tarefa.id_tarefa)).toEqual([2, 3]);
  });

  it("as mais graves vêm antes: uma remoção recomendada passa na frente de outra que só precisa de primeiro contato", () => {
    const r = diagnosticarTudo([
      tarefa({ id_tarefa: 1, minParaTarefa: 20 }, [chapa({ id: "novo" })]), // enviar (atenção), mas começa antes
      tarefa({ id_tarefa: 2, minParaTarefa: 50 }, [chapa({ id: "rem", ultimoDisparo: disparo("fup", 40), disparos: 1 })]), // decidir
      tarefa({ id_tarefa: 3, minParaTarefa: 400 }, [chapa({ id: "calma", ultimoDisparo: disparo("fup", 2), disparos: 1 })]), // calmo
      tarefa({ id_tarefa: 4, minParaTarefa: 25 }, [chapa({ id: "crit", ultimoDisparo: disparo("fup", 40), disparos: 1 })]), // crítico
    ], AGORA);
    expect(r.map((t) => [t.tarefa.id_tarefa, t.nivel])).toEqual([[4, "critico"], [2, "decidir"], [1, "atencao"], [3, "calmo"]]);
  });
});

/* ── som e notificação ────────────────────────────────────────────────────────── */

describe("novosAlarmes — só toca quando uma chapa ENTRA numa ação que pede o analista", () => {
  const leitura = (...cs: EntradaChapa[]) => diagnosticarTudo([tarefa({}, cs)], AGORA);

  it("a 1ª leitura só registra (abrir o app não toca por tudo que já estava pendente)", () => {
    const avisado = new Map<string, Acao>();
    expect(novosAlarmes(avisado, leitura(chapa({ ultimoDisparo: disparo("fup", 40), disparos: 1 })), true)).toEqual([]);
    expect(avisado.get("c1")).toBe("remover");
    // e na leitura seguinte, igual, também não toca
    expect(novosAlarmes(avisado, leitura(chapa({ ultimoDisparo: disparo("fup", 41), disparos: 1 })))).toEqual([]);
  });

  it("toca quando a chapa passa de aguardar para cobrar, e de cobrar para remover (uma vez cada)", () => {
    const avisado = new Map<string, Acao>();
    novosAlarmes(avisado, leitura(chapa({ ultimoDisparo: disparo("fup", 3), disparos: 1 })), true);
    expect(novosAlarmes(avisado, leitura(chapa({ ultimoDisparo: disparo("fup", 16), disparos: 1 })))).toMatchObject([{ acao: "cobrar", nome: "Ana", empresa: "ACME" }]);
    expect(novosAlarmes(avisado, leitura(chapa({ ultimoDisparo: disparo("fup", 18), disparos: 1 })))).toEqual([]); // continua cobrar
    expect(novosAlarmes(avisado, leitura(chapa({ ultimoDisparo: disparo("fup", 26), disparos: 1 })))).toMatchObject([{ acao: "remover" }]);
  });

  it("resposta não lida toca; enviar, aguardar e sobrando não tocam", () => {
    const avisado = new Map<string, Acao>();
    novosAlarmes(avisado, leitura(), true);
    expect(novosAlarmes(avisado, leitura(chapa({ id: "a", naoLida: true })))).toMatchObject([{ acao: "ler_resposta" }]);
    expect(novosAlarmes(avisado, leitura(chapa({ id: "b" })))).toEqual([]); // enviar
    expect(novosAlarmes(avisado, leitura(chapa({ id: "c", ultimoDisparo: disparo("fup", 2), disparos: 1 })))).toEqual([]); // aguardar
  });

  it("quem sai da lista (confirmou/removeu) é esquecido: se voltar a precisar, avisa de novo", () => {
    const avisado = new Map<string, Acao>();
    novosAlarmes(avisado, leitura(chapa({ ultimoDisparo: disparo("fup", 3), disparos: 1 })), true);
    expect(novosAlarmes(avisado, leitura(chapa({ ultimoDisparo: disparo("fup", 30), disparos: 1 })))).toHaveLength(1);
    novosAlarmes(avisado, leitura()); // saiu
    expect(avisado.size).toBe(0);
    expect(novosAlarmes(avisado, leitura(chapa({ ultimoDisparo: disparo("fup", 30), disparos: 1 })))).toHaveLength(1);
  });
});

describe("bipesDoAlarme — firmeza proporcional à urgência", () => {
  const novo = (nivel: "atencao" | "decidir" | "critico") =>
    ({ chapaId: "c", id_tarefa: 1, empresa: "E", nome: "N", acao: "remover" as Acao, nivel });
  it("nada novo = silêncio; atenção 1; decidir 2; crítico 3 (vale o pior do conjunto)", () => {
    expect(bipesDoAlarme([])).toBe(0);
    expect(bipesDoAlarme([novo("atencao")])).toBe(1);
    expect(bipesDoAlarme([novo("atencao"), novo("decidir")])).toBe(2);
    expect(bipesDoAlarme([novo("decidir"), novo("critico")])).toBe(3);
  });
});

describe("textosDeNotificacao", () => {
  const n = (id_tarefa: number, empresa: string, nome: string, acao: Acao) => ({ chapaId: nome, id_tarefa, empresa, nome, acao, nivel: "decidir" as const });

  it("uma notificação por tarefa, agrupada por ação (remover primeiro), com o tempo que falta", () => {
    const r = textosDeNotificacao([
      n(1, "ACME", "Ana", "cobrar"), n(1, "ACME", "Bia", "remover"), n(1, "ACME", "Caio", "remover"), n(2, "Beta", "Dani", "ler_resposta"),
    ], new Map([[1, 22], [2, 95]]));
    expect(r).toEqual([
      { tag: "alarme-1", titulo: "ACME — faltam 22 min", corpo: "Remover e repor: Bia, Caio\nLigar ou chamar no WhatsApp: Ana" },
      { tag: "alarme-2", titulo: "Beta — faltam 1 h 35 min", corpo: "Ler a resposta: Dani" },
    ]);
  });

  it("mais de 3 nomes numa linha vira 'e mais N'", () => {
    const r = textosDeNotificacao(["A", "B", "C", "D", "E"].map((x) => n(1, "ACME", x, "remover")), new Map());
    expect(r[0].titulo).toBe("ACME");
    expect(r[0].corpo).toBe("Remover e repor: A, B, C e mais 2");
  });
});
