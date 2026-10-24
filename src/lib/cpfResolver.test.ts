import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("./db", () => ({ getDb: vi.fn() }));

import { phone11, isValidCpf, nomeNorm, onlyDigits } from "./cpfResolver";

describe("cpfResolver helpers", () => {
  it("phone11 normaliza DDI/máscara pros últimos 11 dígitos", () => {
    expect(phone11("+55 (19) 99743-5351")).toBe("19997435351");
    expect(phone11("19997435351")).toBe("19997435351");
    expect(phone11("5519997435351")).toBe("19997435351");
  });

  it("phone11 rejeita vazio, curto e o telefone do placeholder DESCARGA PRÓPRIA", () => {
    expect(phone11("")).toBeNull();
    expect(phone11(null)).toBeNull();
    expect(phone11("12345")).toBeNull();
    expect(phone11("00000000011")).toBeNull();
  });

  it("isValidCpf exige 11 dígitos (com ou sem máscara)", () => {
    expect(isValidCpf("123.456.789-09")).toBe(true);
    expect(isValidCpf("12345678909")).toBe(true);
    expect(isValidCpf("1234567890")).toBe(false);
    expect(isValidCpf("")).toBe(false);
    expect(isValidCpf(null)).toBe(false);
  });

  it("nomeNorm ignora acento, caixa e espaço duplicado", () => {
    expect(nomeNorm("  JOÃO   da Silva ")).toBe("joao da silva");
  });

  it("onlyDigits", () => {
    expect(onlyDigits("123.456.789-09")).toBe("12345678909");
  });
});
