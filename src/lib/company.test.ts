import { describe, expect, it } from "vitest";
import { companyMatches, normalizeCompany } from "./company";
import { normalize } from "./normalize";

// Implementação ORIGINAL (sem cache) — a nova tem que dar exatamente o mesmo resultado.
function normalizeRef(s: string | null | undefined): string {
  if (!s) return "";
  return normalize(s)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(ltda|s\.?a\.?|me|epp|eireli)\b\.?/gi, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function matchesRef(empresa: string, carteira: string[]): boolean {
  const e = normalizeRef(empresa);
  if (!e) return false;
  return carteira.some((c) => {
    const n = normalizeRef(c);
    if (!n) return false;
    return e === n || e.includes(n) || n.includes(e);
  });
}

function aleatorio(semente: number) {
  let s = semente >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const bases = ["Alfa", "Beta Logística", "Gama Alimentos", "Delta", "Épsilon Transportes", "Zeta Ação", "Eta Ltda", "Teta S.A.", "Iota ME", "Kappa EIRELI", "Lambda", "Mu EPP", "São João", "Sao Joao", ""];
const sufixos = ["", " Ltda", " LTDA.", " S.A.", " s.a", " ME", " eireli", ",", ".", " Filial 2", "  Extra  "];

describe("companyMatches / normalizeCompany — cache não muda o resultado", () => {
  it("normalizeCompany igual à original (e estável nas chamadas repetidas)", () => {
    const r = aleatorio(11);
    for (let i = 0; i < 400; i++) {
      const s = bases[Math.floor(r() * bases.length)] + sufixos[Math.floor(r() * sufixos.length)];
      expect(normalizeCompany(s)).toBe(normalizeRef(s));
      expect(normalizeCompany(s)).toBe(normalizeRef(s));
    }
    expect(normalizeCompany(null)).toBe("");
    expect(normalizeCompany(undefined)).toBe("");
    expect(normalizeCompany("")).toBe("");
  });

  it("companyMatches igual à original, com carteiras pequenas e grandes", () => {
    const r = aleatorio(23);
    const nome = () => bases[Math.floor(r() * bases.length)] + sufixos[Math.floor(r() * sufixos.length)];
    for (let rodada = 0; rodada < 60; rodada++) {
      const tamanho = [0, 1, 2, 3, 4, 5, 20, 80][rodada % 8];
      const carteira = Array.from({ length: tamanho }, nome);
      // o mesmo array é reaproveitado com muitas empresas (como no app)
      for (let k = 0; k < 40; k++) {
        const empresa = nome();
        expect(companyMatches(empresa, carteira)).toBe(matchesRef(empresa, carteira));
      }
    }
  });

  it("carteira alterada (outro tamanho ou outras pontas) não usa resultado velho", () => {
    const carteira = ["Alfa", "Beta", "Gama", "Delta"];
    expect(companyMatches("Alfa Ltda", carteira)).toBe(true);
    expect(companyMatches("Omega", carteira)).toBe(false);
    carteira.push("Omega");
    expect(companyMatches("Omega", carteira)).toBe(true);
    carteira[0] = "Sigma";
    expect(companyMatches("Alfa Ltda", carteira)).toBe(false);
    expect(companyMatches("Sigma", carteira)).toBe(true);
  });

  it("empresa vazia nunca casa; entrada vazia na carteira é ignorada", () => {
    expect(companyMatches("", ["Alfa", "Beta", "Gama", "Delta"])).toBe(false);
    expect(companyMatches("Alfa", ["", "  ", "Ltda", "Beta"])).toBe(false);
    expect(companyMatches("Beta", ["", "  ", "Ltda", "Beta"])).toBe(true);
  });
});
