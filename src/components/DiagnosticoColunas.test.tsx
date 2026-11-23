import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DiagnosticoColunas } from "./DiagnosticoColunas";
import { diagnosticarColunas, gravarDiagnostico } from "@/lib/colunasMetabase";

beforeEach(() => localStorage.clear());

describe("DiagnosticoColunas", () => {
  it("sem nenhum sync registrado não desenha nada", () => {
    const { container } = render(<DiagnosticoColunas />);
    expect(container.textContent).toBe("");
  });

  it("tudo veio: marca as cinco colunas e não avisa nada de errado", () => {
    gravarDiagnostico(diagnosticarColunas([{ Remessa: "R", "Tipo de Trabalho": "Descarga", "Em Oferta": false, "Chapa em Oferta": "", "Data de Criação": "2026-11-20T10:00:00" }]));
    render(<DiagnosticoColunas />);
    expect(screen.getByText(/Último sync do Metabase: 1 linhas · 5 colunas/)).toBeTruthy();
    expect(screen.queryByText(/O card não trouxe/)).toBeNull();
    expect(screen.queryByText(/não veio/)).toBeNull();
  });

  it("faltou coluna: diz quais e explica a causa provável (coluna não exportada pelo card)", () => {
    gravarDiagnostico(diagnosticarColunas([{ "ID Tarefa": 1, Remessa: "R" }]));
    render(<DiagnosticoColunas />);
    expect(screen.getByText(/O card não trouxe: Tipo de Trabalho, Em Oferta, Chapa em Oferta, Data de Criação\./)).toBeTruthy();
    expect(screen.getAllByText(/— não veio/)).toHaveLength(4);
    expect(screen.getByText(/só recebe as colunas que o Metabase exporta/)).toBeTruthy();
  });

  it("lista os nomes das colunas recebidas (pra comparar com o card)", () => {
    gravarDiagnostico(diagnosticarColunas([{ "ID Tarefa": 1, Empresa: "ACME" }]));
    render(<DiagnosticoColunas />);
    expect(screen.getByText("ID Tarefa · Empresa")).toBeTruthy();
  });

  it("planilha importada: não acusa o card do Metabase", () => {
    gravarDiagnostico(diagnosticarColunas([{ "ID Tarefa": 1 }], "planilha"));
    render(<DiagnosticoColunas />);
    expect(screen.getByText(/\(planilha\)/)).toBeTruthy();
    expect(screen.queryByText(/O card não trouxe/)).toBeNull();
  });
});
