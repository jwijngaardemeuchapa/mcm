import { beforeEach, describe, expect, it } from "vitest";
import {
  acharColuna, CAMPOS_DO_CARD, chaveDeColuna, CHAVE_DIAGNOSTICO, diagnosticarColunas, gravarDiagnostico, lerDiagnostico, nomesDoCampo,
  rotulosFaltando, valorDaColuna,
} from "./colunasMetabase";

beforeEach(() => localStorage.clear());

describe("chaveDeColuna / acharColuna — o nome da coluna casa sem caixa, acento, espaço nem '_'", () => {
  it("normaliza", () => {
    expect(chaveDeColuna("Chapa em Oferta")).toBe("chapaemoferta");
    expect(chaveDeColuna("  em_oferta ")).toBe("emoferta");
    expect(chaveDeColuna("Remessa (CTE)")).toBe("remessacte");
    expect(chaveDeColuna("Situação")).toBe("situacao");
  });

  it("acha a coluna por qualquer grafia usual, devolvendo o nome real", () => {
    expect(acharColuna({ "EM OFERTA": true }, nomesDoCampo("em_oferta"))).toBe("EM OFERTA");
    expect(acharColuna({ em_oferta: true }, nomesDoCampo("em_oferta"))).toBe("em_oferta");
    expect(acharColuna({ "Chapa Em Oferta": "x" }, nomesDoCampo("chapa_em_oferta"))).toBe("Chapa Em Oferta");
    expect(acharColuna({ "tipo de trabalho": "x" }, nomesDoCampo("tipo_trabalho"))).toBe("tipo de trabalho");
    expect(acharColuna({ "Tipo Trabalho": "x" }, nomesDoCampo("tipo_trabalho"))).toBe("Tipo Trabalho");
    expect(acharColuna({ Shipping: "x" }, nomesDoCampo("remessa"))).toBe("Shipping");
  });

  it("nome prefixado pela origem: vale o último trecho ('Tabela → Remessa', 'WorkHeader.Shipping'), mas a coluna exata ganha", () => {
    expect(acharColuna({ "Consulta Fup → Remessa": "x" }, nomesDoCampo("remessa"))).toBe("Consulta Fup → Remessa");
    expect(acharColuna({ "WorkHeader.Shipping": "x" }, nomesDoCampo("remessa"))).toBe("WorkHeader.Shipping");
    expect(acharColuna({ "Consulta Fup → Remessa": "velha", Remessa: "certa" }, nomesDoCampo("remessa"))).toBe("Remessa");
    expect(acharColuna({ "Consulta Fup → Em Oferta": true }, nomesDoCampo("em_oferta"))).toBe("Consulta Fup → Em Oferta");
  });

  it("não confunde colunas parecidas", () => {
    expect(acharColuna({ "Empresa em Oferta": "x", Oferta: 1 }, nomesDoCampo("em_oferta"))).toBeNull();
    expect(acharColuna({ "Nome do Chapa": "x" }, nomesDoCampo("chapa_em_oferta"))).toBeNull();
  });

  it("valorDaColuna: o valor, ou undefined se a coluna não existe (diferente de coluna vazia)", () => {
    expect(valorDaColuna({ remessa: "CTE 1" }, nomesDoCampo("remessa"))).toBe("CTE 1");
    expect(valorDaColuna({ remessa: "" }, nomesDoCampo("remessa"))).toBe("");
    expect(valorDaColuna({ outra: 1 }, nomesDoCampo("remessa"))).toBeUndefined();
  });
});

describe("diagnosticarColunas", () => {
  it("lista as colunas recebidas e diz quais das esperadas vieram (com o nome real)", () => {
    const d = diagnosticarColunas([{ "ID Tarefa": 1, Remessa: "R1", "Em Oferta": false }], "metabase", "2026-11-16T12:00:00Z");
    expect(d).toMatchObject({ origem: "metabase", linhas: 1, colunas: ["ID Tarefa", "Remessa", "Em Oferta"] });
    expect(d.achadas).toEqual({ remessa: "Remessa", tipo_trabalho: null, em_oferta: "Em Oferta", chapa_em_oferta: null, criada_em: null });
    expect(rotulosFaltando(d)).toEqual(["Tipo de Trabalho", "Chapa em Oferta", "Data de Criação"]);
  });

  it("a coluna só precisa vir em UMA linha (linhas sem o campo não a escondem)", () => {
    const d = diagnosticarColunas([{ a: 1 }, { a: 2, Remessa: "R" }]);
    expect(d.achadas.remessa).toBe("Remessa");
  });

  it("sem linhas: tudo faltando, sem quebrar", () => {
    const d = diagnosticarColunas([]);
    expect(d.colunas).toEqual([]);
    expect(rotulosFaltando(d)).toEqual(CAMPOS_DO_CARD.map((c) => c.rotulo));
  });
});

describe("guardar e ler o diagnóstico", () => {
  it("guarda o último e devolve igual", () => {
    const d = diagnosticarColunas([{ Remessa: "R" }]);
    gravarDiagnostico(d);
    expect(lerDiagnostico()).toEqual(d);
  });

  it("sync de planilha não apaga o retrato do Metabase (mas grava se não havia nenhum)", () => {
    gravarDiagnostico(diagnosticarColunas([{ Remessa: "R" }], "planilha"));
    expect(lerDiagnostico()?.origem).toBe("planilha");
    gravarDiagnostico(diagnosticarColunas([{ Remessa: "R", "Em Oferta": 1 }], "metabase"));
    expect(lerDiagnostico()?.origem).toBe("metabase");
    gravarDiagnostico(diagnosticarColunas([{ x: 1 }], "planilha"));
    expect(lerDiagnostico()?.origem).toBe("metabase");
  });

  it("conteúdo corrompido não quebra", () => {
    localStorage.setItem(CHAVE_DIAGNOSTICO, "{nao-json");
    expect(lerDiagnostico()).toBeNull();
  });
});
