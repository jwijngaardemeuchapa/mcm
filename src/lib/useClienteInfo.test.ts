import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.fn();
vi.mock("@/lib/db", () => ({ getDb: async () => ({ select }) }));

import { acharCliente, carregarClientes, invalidarClienteBook } from "./useClienteInfo";

const cliente = (id: string, nome: string) => ({
  id, nome, status_cliente: "ativo", particularidades: null, exigencias: null, pedidos: null,
  observacoes: null, contato_nome: null, segmento: null, telefone: null, umbler_group_chat_id: null,
});

describe("cliente_book compartilhado entre os cards", () => {
  beforeEach(() => {
    select.mockReset();
    select.mockResolvedValue([cliente("1", "Alfa Ltda"), cliente("2", "Beta Logística")]);
    invalidarClienteBook();
  });

  it("300 cards montando juntos fazem UMA consulta", async () => {
    const listas = await Promise.all(Array.from({ length: 300 }, () => carregarClientes()));
    expect(select).toHaveBeenCalledTimes(1);
    expect(listas[0]).toBe(listas[299]);
  });

  it("chamadas seguintes (dentro do TTL) reaproveitam; invalidar força nova consulta", async () => {
    await carregarClientes();
    await carregarClientes();
    expect(select).toHaveBeenCalledTimes(1);
    invalidarClienteBook();
    await carregarClientes();
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("depois do TTL volta a consultar (edição feita por outro caminho aparece)", async () => {
    vi.useFakeTimers();
    try {
      await carregarClientes();
      vi.setSystemTime(Date.now() + 31_000);
      await carregarClientes();
      expect(select).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falha na consulta não deixa o cache preso: a próxima tentativa consulta de novo", async () => {
    select.mockRejectedValueOnce(new Error("db ocupado"));
    await expect(carregarClientes()).rejects.toThrow("db ocupado");
    await expect(carregarClientes()).resolves.toHaveLength(2);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("acharCliente: mesma regra de antes (igual ou contido, ignorando Ltda/acentos)", async () => {
    const lista = await carregarClientes();
    expect(acharCliente(lista, "ALFA")?.id).toBe("1");
    expect(acharCliente(lista, "Alfa Ltda Filial 3")?.id).toBe("1");
    expect(acharCliente(lista, "Beta Logistica S.A.")?.id).toBe("2");
    expect(acharCliente(lista, "Gama")).toBeNull();
    expect(acharCliente(lista, "")).toBeNull();
  });
});
