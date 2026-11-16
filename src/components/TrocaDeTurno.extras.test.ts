import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMessage, type ChapaRow, type TarefaRow } from "./TrocaDeTurno";

// "Agora" = 20/11/2026 12:00 em São Paulo
beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-20T15:00:00Z"), toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

const tarefa = (over: Partial<TarefaRow> = {}): TarefaRow => ({
  id_tarefa: 1, empresa: "ACME", data_tarefa: "2026-11-20T16:00:00-03:00", cidade_uf: "São Paulo/SP", status_tarefa: "Aguardando Início",
  quantidade_chapas: 2, validacao_status: "aguardando", ...over,
});
const chapa = (id_tarefa: number, nome: string, status = "pendente"): ChapaRow => ({ id_tarefa, nome_chapa: nome, status_contato: status, data_remocao: null });
const gerar = (tarefas: TarefaRow[], chapas: ChapaRow[]) => buildMessage("Geral", tarefas, chapas, null, 0, new Set());

describe("Troca de Turno — tipo de trabalho, remessa e oferta na mensagem", () => {
  it("confirmações: acrescenta o tipo e a remessa curta à linha da tarefa", () => {
    const m = gerar([tarefa({ tipo_trabalho: "Descarga", remessa: "CTE 35260" })], [chapa(1, "Ana"), chapa(1, "Bia", "confirmado")]);
    expect(m).toContain("• ACME — 20/11 16:00 — 1/2 confirmados — Descarga · Remessa CTE 35260");
  });

  it("sem tipo nem remessa a linha é exatamente a de antes", () => {
    const m = gerar([tarefa()], [chapa(1, "Ana"), chapa(1, "Bia", "confirmado")]);
    expect(m).toContain("• ACME — 20/11 16:00 — 1/2 confirmados\n");
    expect(m).not.toContain("Remessa");
  });

  it("BID — captações em aberto: marca a tarefa em oferta com o nome do chapa dirigido", () => {
    const m = gerar([tarefa({ em_oferta: 1, chapa_em_oferta: "João Silva", tipo_trabalho: "Carga" })], []);
    expect(m).toContain("2 linhas vazias [Em oferta: João Silva] — Carga");
  });

  it("remessa longa é encurtada na mensagem", () => {
    const m = gerar([tarefa({ remessa: "CTE 35260 / container MSKU1234567-8 / lacre 99887766" })], [chapa(1, "Ana")]);
    expect(m).toContain("Remessa CTE 35260 / container M…");
    expect(m).not.toContain("lacre");
  });

  it("validações pendentes também levam o complemento", () => {
    const m = gerar([tarefa({ data_tarefa: "2026-11-20T09:00:00-03:00", validacao_status: "pendente", remessa: "CTE 1" })], [chapa(1, "Ana", "confirmado")]);
    expect(m).toContain("(aguardando cliente) — Remessa CTE 1");
  });
});
