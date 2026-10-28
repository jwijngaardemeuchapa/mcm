import { describe, it, expect, vi, beforeEach } from "vitest";

/* Mock do banco antes de importar o módulo sob teste. */
const execMock = vi.fn();
const selectMock = vi.fn();

vi.mock("./db", () => ({
  getDb: async () => ({ execute: execMock, select: selectMock }),
  uuid: () => "test-uuid",
}));
// nada de rede nos testes: os espelhos pra Central são best-effort e aqui só atrapalham
vi.mock("./central", () => ({ pushChapaStatusToCentral: vi.fn(), pushRespostaToCentral: vi.fn() }));

import {
  classifyResponse,
  extractPhone,
  extractBody,
  extractName,
  processFirestoreMessage,
} from "./firestoreQueue";

describe("classifyResponse", () => {
  it("classifica frases do template FUP", () => {
    expect(classifyResponse("SIM, estou nessa!")).toBe("confirmado");
    expect(classifyResponse("NÃO, quero cancelar!")).toBe("cancelado");
  });

  it("classifica respostas curtas de interesse (BID etapa 1)", () => {
    expect(classifyResponse("SIM")).toBe("interesse_sim");
    expect(classifyResponse("NÃO")).toBe("interesse_nao");
    expect(classifyResponse("Sim")).toBe("interesse_sim");
    expect(classifyResponse("Não")).toBe("interesse_nao");
    expect(classifyResponse("1")).toBe("interesse_sim");
    expect(classifyResponse("2")).toBe("interesse_nao");
  });

  it("classifica respostas de app e ajuda", () => {
    expect(classifyResponse("Preciso de ajuda")).toBe("precisa_ajuda");
    expect(classifyResponse("3")).toBe("precisa_ajuda");
    expect(classifyResponse("aceito o app")).toBe("aceita_app");
    expect(classifyResponse("não aceito")).toBe("nao_aceita_app");
  });

  it("retorna null para texto não reconhecido", () => {
    expect(classifyResponse("oi tudo bem?")).toBeNull();
    expect(classifyResponse("")).toBeNull();
  });
});

describe("extractores de payload", () => {
  it("extrai telefone de formatos variados", () => {
    expect(extractPhone({ from: "+55 19 99726-0135" })).toBe("5519997260135");
    expect(extractPhone({ contact: { phone: "5519997260135" } })).toBe("5519997260135");
    expect(extractPhone({ Chat: { PhoneNumber: "+55 (19) 99726-0135" } })).toBe("5519997260135");
    expect(extractPhone({ chat: { phone: "5519997260135" } })).toBe("5519997260135"); // formato do poll do chat
    expect(extractPhone({ from: "123" })).toBeNull();
    expect(extractPhone({})).toBeNull();
  });

  it("extrai corpo e nome", () => {
    expect(extractBody({ body: "SIM" })).toBe("SIM");
    expect(extractBody({ data: { Data: "Preciso de ajuda" } })).toBe("Preciso de ajuda");
    expect(extractBody({ resposta_opcao: "SIM, estou nessa!" })).toBe("SIM, estou nessa!");
    expect(extractName({ contact: { name: "João" } })).toBe("João");
  });
});

describe("processFirestoreMessage", () => {
  beforeEach(() => {
    execMock.mockReset();
    selectMock.mockReset();
    selectMock.mockResolvedValue([]); // sem matches por padrão
  });

  const bidRow = (id: string, status = "aguardando") => ({
    id, chapa_nome: "Gabriel", chapa_telefone: "5519997260135", id_tarefa: 7, empresa: "ACME", data_tarefa: "2026-06-17", status,
  });
  const SQL_BID = "UPDATE bid_disparos SET status=?, data_resposta1=?, data_resposta2=?, motivo_nao=? WHERE id=?";

  it("retorna handled:false quando não há telefone", async () => {
    const r = await processFirestoreMessage({ body: "SIM" });
    expect(r.handled).toBe(false);
  });

  it("retorna handled:false quando a resposta não classifica", async () => {
    const r = await processFirestoreMessage({ from: "5519997260135", body: "bom dia" });
    expect(r.handled).toBe(false);
  });

  it("BID: interesse SIM sem etapa 2 (fluxo curto) → aceita_app", async () => {
    selectMock.mockResolvedValueOnce([bidRow("d1")]);
    const r = await processFirestoreMessage({ from: "5519997260135", resposta_interesse: "SIM" });
    expect(r.handled).toBe(true);
    if (r.handled) expect(r.event.resposta).toBe("aceita_app");
    expect(execMock).toHaveBeenCalledWith(SQL_BID, expect.arrayContaining(["aceita_app", "d1"]));
  });

  it("BID: interesse SIM + aceite Sim → aceita_app", async () => {
    selectMock.mockResolvedValueOnce([bidRow("d2")]);
    const r = await processFirestoreMessage({ from: "5519997260135", resposta_interesse: "SIM", resposta_aceite: "Sim" });
    expect(r.handled).toBe(true);
    if (r.handled) expect(r.event.resposta).toBe("aceita_app");
  });

  it("BID: interesse SIM + aceite 'Preciso de ajuda' → precisa_ajuda", async () => {
    selectMock.mockResolvedValueOnce([bidRow("d3")]);
    const r = await processFirestoreMessage({ from: "5519997260135", resposta_interesse: "SIM", resposta_aceite: "Preciso de ajuda" });
    expect(r.handled).toBe(true);
    if (r.handled) expect(r.event.resposta).toBe("precisa_ajuda");
  });

  it("BID: interesse NÃO → interesse_nao", async () => {
    selectMock.mockResolvedValueOnce([bidRow("d4")]);
    const r = await processFirestoreMessage({ from: "5519997260135", resposta_interesse: "NÃO" });
    expect(r.handled).toBe(true);
    if (r.handled) expect(r.event.resposta).toBe("interesse_nao");
  });

  it("BID: não aceita o app, com motivo válido → nao_aceita_app + motivo gravado", async () => {
    selectMock.mockResolvedValueOnce([bidRow("d5")]);
    const r = await processFirestoreMessage({
      from: "5519997260135", resposta_interesse: "SIM", resposta_aceite: "Não aceito", motivo_nao: "Valor da Tarefa",
    });
    expect(r.handled).toBe(true);
    if (r.handled) expect(r.event.resposta).toBe("nao_aceita_app");
    expect(execMock).toHaveBeenCalledWith(SQL_BID, expect.arrayContaining(["nao_aceita_app", "Valor da Tarefa", "d5"]));
  });

  it("FUP: positivo → confirmado (grava confirmado_via)", async () => {
    // 1ª chamada (BID) sem match; 2ª chamada (FUP) com match; as seguintes (canalConfirmacao) vazias
    selectMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "c1", nome_chapa: "Maria", telefone_chapa: "5519997260135", id_tarefa: 9, empresa: "ACME" },
      ]);
    const r = await processFirestoreMessage({ from: "5519997260135", body: "SIM, estou nessa!" });
    expect(r.handled).toBe(true);
    if (r.handled) {
      expect(r.event.tipo).toBe("fup");
      expect(r.event.resposta).toBe("confirmado");
    }
    // sem origem conhecida a confirmação conta como FUP: grava a flag do FUP (não a do PréFUP)
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("confirmado_via=?, prefup_confirmado_em=COALESCE(?, prefup_confirmado_em), fup_confirmado_em=COALESCE(?, fup_confirmado_em)"),
      ["confirmado", expect.any(String), null, null, expect.any(String), "c1"],
    );
  });

  it("FUP: negativo → cancelado", async () => {
    selectMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "c2", nome_chapa: "Maria", telefone_chapa: "5519997260135", id_tarefa: 9, empresa: "ACME" },
      ]);
    const r = await processFirestoreMessage({ from: "5519997260135", body: "NÃO, quero cancelar!" });
    expect(r.handled).toBe(true);
    if (r.handled) expect(r.event.resposta).toBe("cancelado");
  });

  it("retorna handled:false quando não há disparo pendente", async () => {
    const r = await processFirestoreMessage({ from: "5519997260135", body: "SIM" });
    expect(r.handled).toBe(false);
  });
});

describe("processFirestoreMessage — resposta lida do chat de UM chapa (PréFUP)", () => {
  beforeEach(() => {
    execMock.mockReset();
    selectMock.mockReset();
    selectMock.mockResolvedValue([]);
  });

  const fupRow = { id: "c1", nome_chapa: "Maria", telefone_chapa: "5519997260135", id_tarefa: 9, empresa: "ACME" };

  it("só olha o chapa pedido (consulta com c.id) e não passa por BID nem por Captação", async () => {
    selectMock.mockResolvedValueOnce([fupRow]); // a 1ª consulta já é a do FUP: BID foi pulado
    const r = await processFirestoreMessage(
      { chat: { phone: "5519997260135" }, resposta_opcao: "SIM" }, "chat_umbler", { chapaId: "c1", origem: "prefup" },
    );
    expect(r.handled).toBe(true);
    const [sql, params] = selectMock.mock.calls[0];
    expect(sql).toContain("FROM chapas c");
    expect(sql).toContain("AND c.id = ?");
    expect(params).toEqual([expect.stringContaining("997260135"), "c1"]);
    expect(selectMock.mock.calls.some(([s]) => String(s).includes("bid_disparos"))).toBe(false);
  });

  it("origem informada vale: grava confirmado_via=prefup + a flag do PréFUP, sem consultar o fup_log", async () => {
    selectMock.mockResolvedValueOnce([fupRow]);
    await processFirestoreMessage(
      { chat: { phone: "5519997260135" }, resposta_opcao: "SIM" }, "chat_umbler", { chapaId: "c1", origem: "prefup" },
    );
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("confirmado_via=?, prefup_confirmado_em=COALESCE(?, prefup_confirmado_em), fup_confirmado_em=COALESCE(?, fup_confirmado_em)"),
      ["confirmado", expect.any(String), "prefup", expect.any(String), null, "c1"],
    );
    expect(selectMock.mock.calls.some(([s]) => String(s).includes("fup_log"))).toBe(false);
  });

  it("sem as colunas das fases no banco, grava a confirmação como antes (sem as flags)", async () => {
    selectMock.mockResolvedValueOnce([fupRow]);
    execMock.mockRejectedValueOnce(new Error("no such column: prefup_confirmado_em"));
    await processFirestoreMessage(
      { chat: { phone: "5519997260135" }, resposta_opcao: "SIM" }, "chat_umbler", { chapaId: "c1", origem: "prefup" },
    );
    expect(execMock).toHaveBeenCalledWith(
      "UPDATE chapas SET status_contato=?, data_contato=?, confirmado_via=? WHERE id=?",
      ["confirmado", expect.any(String), "prefup", "c1"],
    );
  });

  it("chapa que já não está pendente: handled:false e NÃO cai na Captação nem em outro chapa", async () => {
    const r = await processFirestoreMessage(
      { chat: { phone: "5519997260135" }, resposta_opcao: "SIM" }, "chat_umbler", { chapaId: "c1", origem: "prefup" },
    );
    expect(r.handled).toBe(false);
    expect(selectMock.mock.calls.some(([s]) => String(s).includes("captacao_log"))).toBe(false);
    expect(execMock).not.toHaveBeenCalled();
  });

  it("sem opções (webhook do bot, notificação) o comportamento de sempre: BID primeiro, busca por telefone", async () => {
    await processFirestoreMessage({ from: "5519997260135", body: "SIM" });
    expect(String(selectMock.mock.calls[0][0])).toContain("bid_disparos");
  });
});
