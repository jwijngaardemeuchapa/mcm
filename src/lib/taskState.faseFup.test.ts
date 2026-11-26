import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _reiniciarFaseFup, anteciparFaseFup } from "./faseFup";
import { computeTaskState, severityLabel, taskSeverityBlockClass, taskSeverityCardBorderClass } from "./taskState";
import type { TaskWithChapas } from "@/components/TaskCard";

// Quem confirmou só o PréFUP continua contando no fill rate, mas na fase do FUP o card NÃO fica verde:
// "aguarda-fup" (âmbar) até todos confirmarem o FUP.

const AGORA = Date.parse("2026-11-26T12:00:00-03:00");
const H = 3_600_000;

type Chapa = Partial<TaskWithChapas["chapas"][number]>;
const chapa = (i: number, extra: Chapa = {}): TaskWithChapas["chapas"][number] =>
  ({ id: `c${i}`, nome_chapa: `Chapa ${i}`, telefone_chapa: null, cpf: null, status_contato: "confirmado", ...extra }) as TaskWithChapas["chapas"][number];
const soPrefup = (i: number) => chapa(i, { prefup_confirmado_em: "2026-11-25T20:00:00Z" });
const comFup = (i: number) => chapa(i, { prefup_confirmado_em: "2026-11-25T20:00:00Z", fup_confirmado_em: "2026-11-26T13:00:00Z" });

function tarefa(horas: number, chapas: TaskWithChapas["chapas"], extra: Partial<TaskWithChapas> = {}): TaskWithChapas {
  return {
    id_tarefa: 1,
    data_tarefa: new Date(AGORA + horas * H).toISOString(),
    empresa: "ACME",
    cidade_uf: "São Paulo/SP",
    status_tarefa: "Em Aberto",
    quantidade_chapas: chapas.length,
    validacao_status: "aguardando",
    chapas,
    fup_log: [],
    urgent: false,
    ...extra,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  localStorage.clear();
  _reiniciarFaseFup();
});
afterEach(() => vi.useRealTimers());

describe("computeTaskState — fase do FUP", () => {
  it("fase do PréFUP (8 h antes): todos confirmaram o PréFUP → verde, como sempre", () => {
    const s = computeTaskState(tarefa(8, [soPrefup(1), soPrefup(2)]), 70);
    expect(s.faseFup).toBe(false);
    expect(s.severity).toBe("done");
    expect(s.aguardaFup).toBe(0);
  });

  it("fase do FUP (4 h antes): todos confirmaram SÓ o PréFUP → NÃO fica verde, fica 'aguarda-fup'; fill rate segue 100%", () => {
    const s = computeTaskState(tarefa(4, [soPrefup(1), soPrefup(2), soPrefup(3)]), 70);
    expect(s.faseFup).toBe(true);
    expect(s.aguardaFup).toBe(3);
    expect(s.fupOk).toBe(0);
    expect(s.severity).toBe("aguarda-fup");
    expect(s.fillPct).toBe(100);
    expect(s.confirmed).toBe(3);
  });

  it("na fase do FUP o card só volta a verde quando TODOS confirmam o FUP", () => {
    expect(computeTaskState(tarefa(4, [comFup(1), soPrefup(2)]), 70).severity).toBe("aguarda-fup");
    const completo = computeTaskState(tarefa(4, [comFup(1), comFup(2)]), 70);
    expect(completo.severity).toBe("done");
    expect(completo.fupOk).toBe(2);
  });

  it("faltando gente a menos de 3 h, continua o 'atenção' de sempre (faltam confirmações), não o aguarda-fup", () => {
    const s = computeTaskState(tarefa(2, [soPrefup(1), chapa(2, { status_contato: "pendente" })]), 70);
    expect(s.severity).toBe("approach-alert");
  });

  it("faltando gente entre 3 e 5 h, quem aguarda o FUP já destaca o card", () => {
    const s = computeTaskState(tarefa(4, [soPrefup(1), chapa(2, { status_contato: "pendente" })]), 70);
    expect(s.severity).toBe("aguarda-fup");
  });

  it("urgente (ninguém confirmou e falta ≤ 60 min) não muda", () => {
    const s = computeTaskState(tarefa(0.5, [chapa(1, { status_contato: "pendente" })]), 70);
    expect(s.severity).toBe("urgent");
  });

  it("'Resetar PréFUPs' antecipa: 8 h antes já mostra 'aguarda-fup'; sem isso seguia verde", () => {
    const t = tarefa(8, [soPrefup(1), soPrefup(2)]);
    expect(computeTaskState(t, 70).severity).toBe("done");
    anteciparFaseFup([1], AGORA);
    const s = computeTaskState(t, 70);
    expect(s.faseFup).toBe(true);
    expect(s.severity).toBe("aguarda-fup");
  });

  it("depois que a tarefa começa a fase do FUP acaba: volta a ser só confirmado (verde)", () => {
    const s = computeTaskState(tarefa(-1, [soPrefup(1), soPrefup(2)]), 70);
    expect(s.faseFup).toBe(false);
    expect(s.severity).toBe("done");
  });

  it("confirmação manual do analista conta como FUP (não fica aguardando)", () => {
    const manual = chapa(1, { fup_confirmado_em: "2026-11-26T13:00:00Z" }); // sem flag de PréFUP
    expect(computeTaskState(tarefa(4, [manual]), 70).severity).toBe("done");
  });

  it("Em Andamento e Em Análise mantêm as cores deles", () => {
    expect(computeTaskState(tarefa(4, [soPrefup(1)], { status_tarefa: "Em Andamento" }), 70).severity).toBe("andamento");
    expect(computeTaskState(tarefa(4, [soPrefup(1)], { status_tarefa: "Em Análise" }), 70).severity).toBe("default");
  });
});

describe("aguarda-fup — aparência (cor + texto, nunca só cor)", () => {
  it("tem texto próprio e a mesma cor âmbar do 'atenção'", () => {
    expect(severityLabel("aguarda-fup")).toMatch(/^Aguardando FUP/);
    expect(taskSeverityBlockClass("aguarda-fup")).toBe(taskSeverityBlockClass("approach-alert"));
    expect(taskSeverityCardBorderClass("aguarda-fup")).toBe(taskSeverityCardBorderClass("approach-alert"));
    expect(taskSeverityBlockClass("aguarda-fup")).not.toBe(taskSeverityBlockClass("done"));
  });
});
