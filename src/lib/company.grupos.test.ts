import { describe, expect, it } from "vitest";
import { companyMatches, nomesDaCarteiraComUniverso } from "./company";

// Bug: empresa do G4 aparecia no Dashboard do G3 (e vice-versa) porque o filtro
// casava por substring só contra os nomes do grupo ativo.
const carteira = [
  { nome: "Havan", grupo: "G3" },
  { nome: "Havan Atacado Ltda", grupo: "G4" },
  { nome: "Seara", grupo: "G4" },
  { nome: "Seara Alimentos S.A.", grupo: "G3" },
  { nome: "Mercado Beta", grupo: "G3" },
];
const todas = carteira.map((c) => c.nome);
const visiveisDe = (g: string) => nomesDaCarteiraComUniverso(carteira.filter((c) => c.grupo === g).map((c) => c.nome), todas);

describe("filtro de carteira por grupo", () => {
  it("sem universo (regra antiga) o vazamento acontece — documenta o bug", () => {
    const g3 = carteira.filter((c) => c.grupo === "G3").map((c) => c.nome);
    expect(companyMatches("Havan Atacado", g3)).toBe(true); // G4 aparecendo no G3
  });

  it("empresa do G4 não aparece no G3", () => {
    const g3 = visiveisDe("G3");
    expect(companyMatches("Havan Atacado", g3)).toBe(false);
    expect(companyMatches("Seara", g3)).toBe(false);
  });

  it("empresa do G3 não aparece no G4", () => {
    const g4 = visiveisDe("G4");
    expect(companyMatches("Havan", g4)).toBe(false);
    expect(companyMatches("Seara Alimentos", g4)).toBe(false);
  });

  it("cada empresa aparece no SEU grupo (nome exato ou com variação de Ltda/S.A.)", () => {
    expect(companyMatches("Havan", visiveisDe("G3"))).toBe(true);
    expect(companyMatches("HAVAN ATACADO", visiveisDe("G4"))).toBe(true);
    expect(companyMatches("Seara Alimentos SA", visiveisDe("G3"))).toBe(true);
    expect(companyMatches("Seara", visiveisDe("G4"))).toBe(true);
  });

  it("empresa que não está na carteira não passa", () => {
    expect(companyMatches("Outra Empresa", visiveisDe("G3"))).toBe(false);
  });

  it("empresa fixada (visível em qualquer grupo) continua passando", () => {
    const g3ComFixada = nomesDaCarteiraComUniverso(["Havan", "Seara"], todas); // Seara (G4) fixada
    expect(companyMatches("Seara", g3ComFixada)).toBe(true);
  });
});
