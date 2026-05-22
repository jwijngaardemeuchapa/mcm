import { normalize } from "./normalize";

export function normalizeCompany(s: string | null | undefined): string {
  if (!s) return "";
  return normalize(s)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(ltda|s\.?a\.?|me|epp|eireli)\b\.?/gi, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function companyMatches(empresa: string, carteira: string[]): boolean {
  const e = normalizeCompany(empresa);
  if (!e) return false;
  return carteira.some((c) => {
    const n = normalizeCompany(c);
    if (!n) return false;
    return e === n || e.includes(n) || n.includes(e);
  });
}
