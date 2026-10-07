import { normalize } from "./normalize";

function normalizarEmpresa(s: string): string {
  return normalize(s)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(ltda|s\.?a\.?|me|epp|eireli)\b\.?/gi, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Nomes de empresa se repetem muito (a mesma tarefa/carteira é comparada a cada
// ciclo dos watchers e a cada render), e normalizar custa NFD + 5 regex. Cache
// com teto só pra nunca crescer sem limite numa sessão de dias.
const CACHE_NORMALIZADAS_MAX = 5000;
const normalizadas = new Map<string, string>();

export function normalizeCompany(s: string | null | undefined): string {
  if (!s) return "";
  const guardada = normalizadas.get(s);
  if (guardada !== undefined) return guardada;
  const r = normalizarEmpresa(s);
  if (normalizadas.size >= CACHE_NORMALIZADAS_MAX) normalizadas.clear();
  normalizadas.set(s, r);
  return r;
}

// Listas de carteira são comparadas com milhares de tarefas por ciclo (filtro
// de carteira, notificações). Sem isso, cada comparação re-normalizava a
// carteira inteira: tarefas × empresas normalizações por ciclo. Aqui a lista é
// normalizada uma vez por array e o resultado vale por empresa. O array
// recebido NÃO pode ser alterado depois de passado pra cá (todos os chamadores
// montam um array novo com map/filter a cada ciclo).
type Casador = { tamanho: number; primeiro: string | undefined; ultimo: string | undefined; ns: string[]; porEmpresa: Map<string, boolean> };
const casadores = new WeakMap<string[], Casador>();

function casaCom(e: string, ns: string[]): boolean {
  for (const n of ns) {
    if (e === n || e.includes(n) || n.includes(e)) return true;
  }
  return false;
}

export function companyMatches(empresa: string, carteira: string[]): boolean {
  const e = normalizeCompany(empresa);
  if (!e) return false;
  // Listas minúsculas (ex.: [l.empresa]) não compensam o cache.
  if (carteira.length <= 3) return casaCom(e, carteira.map(normalizeCompany).filter(Boolean));
  let c = casadores.get(carteira);
  if (!c || c.tamanho !== carteira.length || c.primeiro !== carteira[0] || c.ultimo !== carteira[carteira.length - 1]) {
    c = {
      tamanho: carteira.length,
      primeiro: carteira[0],
      ultimo: carteira[carteira.length - 1],
      ns: carteira.map(normalizeCompany).filter(Boolean),
      porEmpresa: new Map(),
    };
    casadores.set(carteira, c);
  }
  const guardado = c.porEmpresa.get(e);
  if (guardado !== undefined) return guardado;
  const r = casaCom(e, c.ns);
  c.porEmpresa.set(e, r);
  return r;
}
