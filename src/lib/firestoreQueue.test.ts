import { describe, it, expect, vi, beforeEach } from "vitest";

/* Mock do banco antes de importar o módulo sob teste. */
const execMock = vi.fn();
const selectMock = vi.fn();

vi.mock("./db", () => ({
  getDb: async () => ({ execute: execMock, select: selectMock }),
  uuid: () => "test-uuid",
}));

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
    expect(extractPhone({ data: { contact: { phone: "5519997260135" } } })).toBe("5519997260135");
    expect(extractPhone({ from: "123" })).toBeNull();
    expect(extractPhone({})).toBeNull();
  });

  it("extrai corpo e nome", () => {
    expect(extractBody({ body: "SIM" })).toBe("SIM");
    expect(extractBody({ data: { Data: "Preciso de ajuda" } })).toBe("Preciso de ajuda");
    expect(extractName({ contact: { name: "João" } })).toBe("João");
  });
});

describe("processFirestoreMessage", () => {
  beforeEach(() => {
    execMock.mockReset();
    selectMock.mockReset();
    selectMock.mockResolvedValue([]); // sem matches por padrão
  });

  it("retorna handled:false quando não há telefone", async () => {
    const r = await processFirestoreMessage({ body: "SIM" });
    expect(r.handled).toBe(false);
  });

  it("retorna handled:false quando a resposta não classifica", async () => {
    const r = await processFirestoreMessage({ from: "5519997260135", body: "bom dia" });
    expect(r.handled).toBe(false);
  });

  it("BID etapa 1: aguardando + SIM → interesse_sim (data_resposta1)", async () => {
    selectMock.mockResolvedValueOnce([
      { id: "d1", chapa_nome: "Gabriel", chapa_telefone: "5519997260135", id_tarefa: 7, empresa: "ACME", data_tarefa: "2026-06-17", status: "aguardando" },
    ]);
    const r = await processFirestoreMessage({ from: "5519997260135", body: "SIM" });
    expect(r.handled).toBe(true);
    if (r.handled) expect(r.event.resposta).toBe("interesse_sim");
    expect(execMock).toHaveBeenCalledWith(
      "UPDATE bid_disparos SET status=?, data_resposta1=? WHERE id=?",
      expect.arrayContaining(["interesse_sim", expect.any(String), "d1"]),
    );
  });

  it("BID etapa 2: interesse_sim + Sim → aceita_app (data_resposta2)", async () => {
    selectMock.mockResolvedValueOnce([
      { id: "d2", chapa_nome: "Gabriel", chapa_telefone: "5519997260135", id_tarefa: 7, empresa: "ACME", data_tarefa: "2026-06-17", status: "interesse_sim" },
    ]);
    const r = await processFirestoreMessage({ from: "5519997260135", body: "Sim" });
    expect(r.handled).toBe(true);
    if (r.handled) expect(r.event.resposta).toBe("aceita_app");
    expect(execMock).toHaveBeenCalledWith(
      "UPDATE bid_disparos SET status=?, data_resposta2=? WHERE id=?",
      expect.arrayContaining(["aceita_app", expect.any(String), "d2"]),
    );
  });

  it("BID etapa 2: interesse_sim + Preciso de ajuda → precisa_ajuda", async () => {
    selectMock.mockResolvedValueOnce([
      { id: "d3", chapa_nome: "Gabriel", chapa_telefone: "5519997260135", id_tarefa: 7, empresa: "ACME", data_tarefa: "2026-06-17", status: "interesse_sim" },
    ]);
    const r = await processFirestoreMessage({ from: "5519997260135", body: "Preciso de ajuda" });
    expect(r.handled).toBe(true);
    if (r.handled) expect(r.event.resposta).toBe("precisa_ajuda");
  });

  it("FUP: positivo → confirmado", async () => {
    // 1ª chamada (BID) sem match; 2ª chamada (FUP) com match
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
    expect(execMock).toHaveBeenCalledWith(
      "UPDATE chapas SET status_contato=?, data_contato=? WHERE id=?",
      expect.arrayContaining(["confirmado", expect.any(String), "c1"]),
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
