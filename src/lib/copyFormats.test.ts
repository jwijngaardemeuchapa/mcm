import { describe, expect, it } from "vitest";
import { linhaIdNomeTelefone } from "./copyFormats";

describe("linhaIdNomeTelefone", () => {
  it("monta '#id | nome | telefone' com o telefone só em dígitos", () => {
    expect(linhaIdNomeTelefone(475543, "João Silva", "(11) 99999-0000")).toBe("#475543 | João Silva | 11999990000");
  });

  it("sem telefone avisa em vez de deixar o campo vazio", () => {
    expect(linhaIdNomeTelefone(10, "Maria", null)).toBe("#10 | Maria | sem telefone");
    expect(linhaIdNomeTelefone(10, "Maria", "")).toBe("#10 | Maria | sem telefone");
    expect(linhaIdNomeTelefone(10, "Maria", " - ")).toBe("#10 | Maria | sem telefone");
  });

  it("é o mesmo texto que o botão por chapa do TaskCard já gerava", () => {
    const antigo = (taskId: number, nome: string, tel: string) =>
      `#${taskId} | ${nome} | ${tel.replace(/\D/g, "") || "sem telefone"}`;
    expect(linhaIdNomeTelefone(7, "Pedro", "11 98888-7777")).toBe(antigo(7, "Pedro", "11 98888-7777"));
    expect(linhaIdNomeTelefone(7, "Pedro", "")).toBe(antigo(7, "Pedro", ""));
  });
});
