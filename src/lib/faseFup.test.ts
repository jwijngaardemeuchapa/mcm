import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _reiniciarFaseFup,
  anteciparFaseFup,
  contagemDaFase,
  desfazerFaseFup,
  estadoDaFase,
  EVENTO_FASE_FUP,
  faseFupAntecipada,
  faseFupAtiva,
  fupEnviadoDepoisDoPrefup,
  naJanelaAutomaticaDoFup,
  versaoDaFaseFup,
} from "./faseFup";

const H = 3_600_000;
const AGORA = Date.parse("2026-11-26T12:00:00-03:00");
// tarefa que começa daqui a `horas` horas (fuso de SP)
const tarefa = (horas: number, extra: Record<string, unknown> = {}) => ({
  id_tarefa: 1,
  data_tarefa: new Date(AGORA + horas * H).toISOString(),
  cidade_uf: "São Paulo/SP",
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
  _reiniciarFaseFup();
});

describe("janela automática do FUP (≤ 5 h e a tarefa ainda não começou)", () => {
  it("fora: mais de 5 h antes (ainda é a fase do PréFUP)", () => {
    expect(naJanelaAutomaticaDoFup(tarefa(5.5).data_tarefa, "São Paulo/SP", AGORA)).toBe(false);
    expect(naJanelaAutomaticaDoFup(tarefa(24).data_tarefa, "São Paulo/SP", AGORA)).toBe(false);
  });
  it("dentro: de 5 h até o início", () => {
    expect(naJanelaAutomaticaDoFup(tarefa(5).data_tarefa, "São Paulo/SP", AGORA)).toBe(true);
    expect(naJanelaAutomaticaDoFup(tarefa(1).data_tarefa, "São Paulo/SP", AGORA)).toBe(true);
    expect(naJanelaAutomaticaDoFup(tarefa(0.01).data_tarefa, "São Paulo/SP", AGORA)).toBe(true);
  });
  it("depois que a tarefa começou, a fase do FUP acaba", () => {
    expect(naJanelaAutomaticaDoFup(tarefa(0).data_tarefa, "São Paulo/SP", AGORA)).toBe(false);
    expect(naJanelaAutomaticaDoFup(tarefa(-2).data_tarefa, "São Paulo/SP", AGORA)).toBe(false);
  });
});

describe("faseFupAtiva", () => {
  it("automática dentro da janela, mesmo sem o analista fazer nada", () => {
    expect(faseFupAtiva(tarefa(2), AGORA)).toBe(true);
    expect(faseFupAtiva(tarefa(8), AGORA)).toBe(false);
  });

  it("'Resetar PréFUPs' antecipa a fase antes da janela; desfazer volta ao normal", () => {
    const t = tarefa(8);
    expect(faseFupAtiva(t, AGORA)).toBe(false);
    anteciparFaseFup([1], AGORA);
    expect(faseFupAtiva(t, AGORA)).toBe(true);
    expect(faseFupAntecipada([1])).toBe(true);
    desfazerFaseFup([1]);
    expect(faseFupAtiva(t, AGORA)).toBe(false);
  });

  it("depois do início não vale nem a antecipação (a tarefa já começou)", () => {
    anteciparFaseFup([1], AGORA);
    expect(faseFupAtiva(tarefa(-1), AGORA)).toBe(false);
  });

  it("card de grupo: vale se QUALQUER tarefa do grupo foi antecipada", () => {
    anteciparFaseFup([22], AGORA);
    const grupo = tarefa(8, { id_tarefa: 21, grupo: { ids: [21, 22, 23], membros: [] } });
    expect(faseFupAtiva(grupo, AGORA)).toBe(true);
    expect(faseFupAtiva(tarefa(8, { id_tarefa: 99 }), AGORA)).toBe(false);
  });

  it("a antecipação sobrevive a recarregar (fica no armazenamento) e marcas velhas somem", () => {
    anteciparFaseFup([5], AGORA);
    _reiniciarFaseFup(); // como se o app tivesse reaberto
    expect(faseFupAntecipada([5])).toBe(true);
    localStorage.setItem("fup_fase_antecipada", JSON.stringify({ 7: Date.now() - 10 * 86_400_000, 8: Date.now() }));
    _reiniciarFaseFup();
    expect(faseFupAntecipada([7])).toBe(false);
    expect(faseFupAntecipada([8])).toBe(true);
  });

  it("armazenamento corrompido não derruba: começa vazio", () => {
    localStorage.setItem("fup_fase_antecipada", "{não é json");
    _reiniciarFaseFup();
    expect(faseFupAntecipada([1])).toBe(false);
  });

  it("antecipar/desfazer avisa a tela (evento) e sobe a versão", () => {
    const ouvinte = vi.fn();
    window.addEventListener(EVENTO_FASE_FUP, ouvinte);
    const v0 = versaoDaFaseFup();
    anteciparFaseFup([1]);
    desfazerFaseFup([1]);
    window.removeEventListener(EVENTO_FASE_FUP, ouvinte);
    expect(ouvinte).toHaveBeenCalledTimes(2);
    expect(versaoDaFaseFup()).toBe(v0 + 2);
  });
});

describe("estadoDaFase — verde só pra quem confirmou o FUP", () => {
  const confirmado = (extra: Record<string, unknown> = {}) => ({ status_contato: "confirmado", ...extra });

  it("confirmou o FUP → fup_ok (nas duas fases)", () => {
    const c = confirmado({ prefup_confirmado_em: "2026-11-25T20:00:00Z", fup_confirmado_em: "2026-11-26T14:00:00Z" });
    expect(estadoDaFase(c, true)).toBe("fup_ok");
    expect(estadoDaFase(c, false)).toBe("fup_ok");
  });
  it("só o PréFUP: na fase do PréFUP segue verde; na fase do FUP vira 'aguarda_fup'", () => {
    const c = confirmado({ prefup_confirmado_em: "2026-11-25T20:00:00Z" });
    expect(estadoDaFase(c, false)).toBe("prefup_ok");
    expect(estadoDaFase(c, true)).toBe("aguarda_fup");
  });
  it("confirmado sem nenhuma fase registrada (dado antigo) fica normal, não vira âmbar", () => {
    expect(estadoDaFase(confirmado(), true)).toBe("normal");
  });
  it("quem não está confirmado não tem fase", () => {
    expect(estadoDaFase({ status_contato: "pendente", prefup_confirmado_em: "x" }, true)).toBe("normal");
    expect(estadoDaFase({ status_contato: "removido" }, true)).toBe("normal");
  });
});

describe("contagemDaFase", () => {
  const chapas = [
    { status_contato: "confirmado", prefup_confirmado_em: "a", fup_confirmado_em: "b" },
    { status_contato: "confirmado", prefup_confirmado_em: "a", fup_confirmado_em: null },
    { status_contato: "confirmado", prefup_confirmado_em: "a" },
    { status_contato: "pendente" },
    { status_contato: "confirmado", fup_confirmado_em: "b" },
  ];
  it("na fase do FUP: 2 confirmaram o FUP, 2 aguardam", () => {
    expect(contagemDaFase(chapas, true)).toEqual({ fupOk: 2, aguardaFup: 2, prefupOk: 0 });
  });
  it("antes dela: ninguém 'aguarda'; os do PréFUP contam como prefupOk", () => {
    expect(contagemDaFase(chapas, false)).toEqual({ fupOk: 2, aguardaFup: 0, prefupOk: 2 });
  });
  it("sem chapas", () => {
    expect(contagemDaFase([], true)).toEqual({ fupOk: 0, aguardaFup: 0, prefupOk: 0 });
  });
});

describe("fupEnviadoDepoisDoPrefup — 'FUP enviado há X' x 'FUP não enviado'", () => {
  const linha = (extra: Record<string, unknown>) => ({ chapa_id: "c1", canal: "umbler_talk", data_disparo: "2026-11-26T14:00:00Z", aguarda_resposta_chat: 0, ...extra });
  const confirmouPrefup = "2026-11-25T20:00:00Z";

  it("acha o FUP mais recente enviado depois da confirmação do PréFUP", () => {
    const log = [linha({ data_disparo: "2026-11-26T13:00:00Z" }), linha({ data_disparo: "2026-11-26T14:00:00Z" })];
    expect(fupEnviadoDepoisDoPrefup(log, "c1", confirmouPrefup)).toBe("2026-11-26T14:00:00Z");
  });
  it("o próprio PréFUP (flag de template) não conta como FUP", () => {
    expect(fupEnviadoDepoisDoPrefup([linha({ aguarda_resposta_chat: 1 })], "c1", confirmouPrefup)).toBeNull();
  });
  it("disparo ANTES de ele confirmar o PréFUP não conta (não era o reforço)", () => {
    expect(fupEnviadoDepoisDoPrefup([linha({ data_disparo: "2026-11-25T10:00:00Z" })], "c1", confirmouPrefup)).toBeNull();
  });
  it("só conta o chapa certo e só o canal do FUP (mensagem personalizada e cancelamento não são FUP)", () => {
    const log = [linha({ chapa_id: "outro" }), linha({ canal: "umbler_custom" }), linha({ canal: "umbler_cancelamento_geral" })];
    expect(fupEnviadoDepoisDoPrefup(log, "c1", confirmouPrefup)).toBeNull();
  });
  it("sem data de confirmação do PréFUP, qualquer FUP enviado conta", () => {
    expect(fupEnviadoDepoisDoPrefup([linha({})], "c1", null)).toBe("2026-11-26T14:00:00Z");
  });
  it("data de disparo ilegível é ignorada, não quebra", () => {
    expect(fupEnviadoDepoisDoPrefup([linha({ data_disparo: "lixo" })], "c1", confirmouPrefup)).toBeNull();
  });
});
