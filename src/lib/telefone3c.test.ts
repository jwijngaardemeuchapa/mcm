import { describe, expect, it } from "vitest";
import { montarLista3c, telefoneParaLista3c } from "./telefone3c";

describe("telefoneParaLista3c", () => {
  it("todo formato vira DDD + número, só dígitos", () => {
    for (const bruto of ["27992263119", "+5527992263119", "5527992263119", "(27) 99226-3119", "027992263119", " 27 9 9226 3119 "]) {
      expect(telefoneParaLista3c(bruto)).toEqual({ ok: true, numero: "27992263119" });
    }
  });

  it("fixo (10 dígitos) é aceito", () => {
    expect(telefoneParaLista3c("(41) 3322-1100")).toEqual({ ok: true, numero: "4133221100" });
    expect(telefoneParaLista3c("+554133221100")).toEqual({ ok: true, numero: "4133221100" });
  });

  it("DDD de outro estado NUNCA vira 11", () => {
    const r = telefoneParaLista3c("+5573998171702");
    expect(r).toEqual({ ok: true, numero: "73998171702" });
  });

  it("sem DDD (8 ou 9 dígitos) fica de fora — o 3C completaria com 11", () => {
    expect(telefoneParaLista3c("998171702")).toEqual({ ok: false, motivo: "sem_ddd" });
    expect(telefoneParaLista3c("3322-1100")).toEqual({ ok: false, motivo: "sem_ddd" });
  });

  it("lixo é inválido", () => {
    expect(telefoneParaLista3c("")).toEqual({ ok: false, motivo: "invalido" });
    expect(telefoneParaLista3c(null)).toEqual({ ok: false, motivo: "invalido" });
    expect(telefoneParaLista3c("12345")).toEqual({ ok: false, motivo: "invalido" });
    expect(telefoneParaLista3c("00998171702")).toEqual({ ok: false, motivo: "invalido" }); // DDD 00
    expect(telefoneParaLista3c("27892263119")).toEqual({ ok: false, motivo: "invalido" }); // 11 dígitos sem o 9
  });
});

describe("montarLista3c", () => {
  it("separa quem vai, quem não tem DDD, os inválidos e os repetidos", () => {
    const r = montarLista3c([
      { nome: "Ana", telefone: "(27) 99226-3119" },
      { nome: "Ana de novo", telefone: "+5527992263119" }, // mesmo número
      { nome: "Bia", telefone: "998171702" },
      { nome: "Caio", telefone: "123" },
      { nome: "Davi", telefone: null },
      { nome: "Eva", telefone: "73998171702" },
    ]);
    expect(r.linhas).toEqual([
      { nome: "Ana", telefone: "27992263119" },
      { nome: "Eva", telefone: "73998171702" },
    ]);
    expect(r.semDdd).toEqual(["Bia"]);
    expect(r.invalidos).toEqual(["Caio"]);
    expect(r.repetidos).toBe(1);
  });
});
