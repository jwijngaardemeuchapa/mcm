import { describe, expect, it } from "vitest";
import { FOLGA_RELOGIO_MS, instanteUtc, respostaDoPrefup, type MensagemChat } from "./respostaPrefup";

const T0 = Date.parse("2026-10-14T12:00:00.000Z"); // disparo do PréFUP
const em = (deltaMs: number) => new Date(T0 + deltaMs).toISOString();
const contato = (deltaMs: number, texto: string | null = "SIM"): MensagemChat => ({ source: "Contact", content: texto, eventAtUTC: em(deltaMs) });
const janela = (extra: { proximoDisparoEm?: string | null } = {}) => ({ disparoEm: em(0), ...extra });

describe("instanteUtc", () => {
  it("lê ISO com Z, com offset e SEM fuso (tratado como UTC, não como hora local)", () => {
    expect(instanteUtc("2026-10-14T12:00:00Z")).toBe(T0);
    expect(instanteUtc("2026-10-14T09:00:00-03:00")).toBe(T0);
    expect(instanteUtc("2026-10-14T12:00:00")).toBe(T0);
    expect(instanteUtc("2026-10-14T12:00:00.000")).toBe(T0);
  });
  it("vazio, nulo ou lixo → NaN", () => {
    expect(instanteUtc("")).toBeNaN();
    expect(instanteUtc(null)).toBeNaN();
    expect(instanteUtc("ontem")).toBeNaN();
  });
});

describe("respostaDoPrefup — só a fala do contato dentro da janela do disparo", () => {
  it("resposta depois do disparo vale", () => {
    expect(respostaDoPrefup([contato(2 * 60_000, "SIM")], janela())).toBe("SIM");
  });

  it("'sim' de horas ou dias antes não vale", () => {
    expect(respostaDoPrefup([contato(-3 * 3_600_000)], janela())).toBeNull();
    expect(respostaDoPrefup([contato(-3 * 86_400_000)], janela())).toBeNull();
  });

  it("folga de relógio: resposta logo depois, mesmo marcada ligeiramente antes do disparo local, ainda vale; uma de minutos antes não", () => {
    expect(respostaDoPrefup([contato(-(FOLGA_RELOGIO_MS - 5_000))], janela())).toBe("SIM");
    expect(respostaDoPrefup([contato(-(FOLGA_RELOGIO_MS + 5_000))], janela())).toBeNull();
    expect(respostaDoPrefup([contato(-5 * 60_000)], janela())).toBeNull();
  });

  it("fala depois do PRÓXIMO disparo no mesmo chat é de outra mensagem: não vale; a de antes dele vale", () => {
    const proximo = em(30 * 60_000);
    expect(respostaDoPrefup([contato(10 * 60_000, "SIM")], janela({ proximoDisparoEm: proximo }))).toBe("SIM");
    expect(respostaDoPrefup([contato(31 * 60_000, "SIM")], janela({ proximoDisparoEm: proximo }))).toBeNull();
    // colada no próximo disparo (dentro da folga) também é ambígua → não vale
    expect(respostaDoPrefup([contato(30 * 60_000 - 10_000, "SIM")], janela({ proximoDisparoEm: proximo }))).toBeNull();
  });

  it("vale a ÚLTIMA fala da janela, qualquer que seja a ordem do array", () => {
    const msgs = [contato(5 * 60_000, "NÃO"), contato(1 * 60_000, "SIM"), contato(-2 * 3_600_000, "SIM")];
    expect(respostaDoPrefup(msgs, janela())).toBe("NÃO");
  });

  it("ignora quem não é o contato, texto vazio e mensagem sem hora legível", () => {
    const msgs: MensagemChat[] = [
      { source: "Member", content: "SIM", eventAtUTC: em(60_000) },
      { source: "Bot", content: "SIM", eventAtUTC: em(60_000) },
      contato(60_000, "   "),
      contato(60_000, null),
      { source: "Contact", content: "SIM", eventAtUTC: "" },
      { source: "Contact", content: "SIM", eventAtUTC: "lixo" },
    ];
    expect(respostaDoPrefup(msgs, janela())).toBeNull();
  });

  it("disparo sem hora legível: nada vale (não dá pra saber o que veio depois)", () => {
    expect(respostaDoPrefup([contato(60_000)], { disparoEm: "" })).toBeNull();
  });

  it("sem mensagens, sem resposta", () => {
    expect(respostaDoPrefup([], janela())).toBeNull();
  });
});
