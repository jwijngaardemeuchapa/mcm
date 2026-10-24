import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { readSettings } from "./settings";
import { getDb } from "./db";
import { normalize } from "./normalize";
import { fmtSP, todayDateISO_SP } from "./datetime";

// Resolução de CPF de chapa — fonte única (antes eram 4 cópias do mesmo
// SELECT por telefone em TaskCard/TaskDetailPanel).
//
// A Question de tarefas do Metabase nem sempre traz CPF por linha. Ordem:
//  1. CPF que já veio na tarefa (11 dígitos válidos)
//  2. `chapa_cpf` (Question dedicada, card 1725): telefone normalizado
//     (últimos 11 dígitos), ignorando telefones compartilhados por >1 chapa
//  3. `chapa_registry` (cadastro geral) por telefone, com variantes de DDI
//  4. `chapas_novos` por telefone
//  5. nome normalizado EXATO em `chapa_cpf`, só se o resultado for único
// O que for achado é gravado em `chapas.cpf` (pra XLSX/CSV/Central usarem o
// mesmo valor) — nunca sobrescreve um CPF que já exista.

// Usuário-placeholder do Metabase ("DESCARGA PRÓPRIA"): telefone 00000000011
// e dezenas de linhas sem chapa real — nunca é chave de match válida.
const PLACEHOLDER_PHONES = new Set(["00000000011", "0000000000", "00000000000"]);

export type CpfInput = {
  id?: string | null;
  cpf?: string | null;
  telefone_chapa?: string | null;
  nome_chapa?: string | null;
};

export function onlyDigits(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}

export function isValidCpf(s: string | null | undefined): boolean {
  return onlyDigits(s).length === 11;
}

/** Últimos 11 dígitos (tira DDI 55 / zero de operadora). null se inútil. */
export function phone11(s: string | null | undefined): string | null {
  const d = onlyDigits(s);
  if (d.length < 10) return null;
  const p = d.slice(-11);
  return PLACEHOLDER_PHONES.has(p) ? null : p;
}

function phoneVariants(p11: string): string[] {
  // telefone salvo pode estar cru, sem DDI, com DDI, ou sem o 9º dígito.
  const out = new Set<string>([p11, `55${p11}`]);
  if (p11.length === 11) {
    const sem9 = p11.slice(0, 2) + p11.slice(3);
    out.add(sem9);
    out.add(`55${sem9}`);
  } else if (p11.length === 10) {
    const com9 = `${p11.slice(0, 2)}9${p11.slice(2)}`;
    out.add(com9);
    out.add(`55${com9}`);
  }
  return Array.from(out);
}

export function nomeNorm(s: string | null | undefined): string {
  return normalize(String(s ?? "")).replace(/\s+/g, " ").trim();
}

const CLEAN = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone,' ',''),'-',''),'(',''),')',''),'+','')";

async function ensureCpfTable() {
  const db = await getDb();
  await db.execute(
    `CREATE TABLE IF NOT EXISTS chapa_cpf (
       id_chapa TEXT PRIMARY KEY,
       nome TEXT,
       nome_norm TEXT,
       cpf TEXT,
       telefone_norm TEXT,
       ambiguo INTEGER DEFAULT 0,
       ultima_tarefa TEXT,
       importado_em TEXT
     )`,
  );
  await db.execute("CREATE INDEX IF NOT EXISTS idx_chapa_cpf_tel ON chapa_cpf(telefone_norm)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_chapa_cpf_nome ON chapa_cpf(nome_norm)");
}

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export type CpfResolution = {
  /** CPF só com dígitos (ou null), na mesma ordem da entrada. */
  cpfs: (string | null)[];
  /** Quantos ficaram sem CPF mesmo após todos os fallbacks. */
  semCpf: number;
};

export async function resolveCpfs(
  chapas: CpfInput[],
  opts: { persist?: boolean } = {},
): Promise<CpfResolution> {
  const persist = opts.persist ?? true;
  const cpfs: (string | null)[] = chapas.map((c) => (isValidCpf(c.cpf) ? onlyDigits(c.cpf) : null));
  const pending = () => chapas.map((_, i) => i).filter((i) => !cpfs[i]);

  if (pending().length > 0) {
    const db = await getDb();
    try { await ensureCpfTable(); } catch (e) { console.warn("[cpf] ensureCpfTable falhou", e); }

    // 2) chapa_cpf por telefone (ignora ambíguo)
    try {
      const idx = pending().filter((i) => phone11(chapas[i].telefone_chapa));
      const phones = Array.from(new Set(idx.map((i) => phone11(chapas[i].telefone_chapa)!)));
      const map = new Map<string, string>();
      for (const ch of chunks(phones, 400)) {
        const rows = await db.select<{ telefone_norm: string; cpf: string }[]>(
          `SELECT telefone_norm, cpf FROM chapa_cpf
           WHERE ambiguo = 0 AND cpf IS NOT NULL AND telefone_norm IN (${ch.map(() => "?").join(",")})`,
          ch,
        );
        for (const r of rows) map.set(r.telefone_norm, r.cpf);
      }
      for (const i of idx) {
        const hit = map.get(phone11(chapas[i].telefone_chapa)!);
        if (hit && isValidCpf(hit)) cpfs[i] = onlyDigits(hit);
      }
    } catch (e) { console.warn("[cpf] fallback chapa_cpf/telefone falhou", e); }

    // 3) chapa_registry e 4) chapas_novos por telefone (com variantes)
    for (const [tabela, where] of [
      ["chapa_registry", `${CLEAN}`],
      ["chapas_novos", `${CLEAN}`],
    ] as const) {
      try {
        const idx = pending().filter((i) => phone11(chapas[i].telefone_chapa));
        if (idx.length === 0) break;
        const variantToIdx = new Map<string, number[]>();
        for (const i of idx) {
          for (const v of phoneVariants(phone11(chapas[i].telefone_chapa)!)) {
            const l = variantToIdx.get(v) ?? [];
            l.push(i);
            variantToIdx.set(v, l);
          }
        }
        const variants = Array.from(variantToIdx.keys());
        // telefone compartilhado por CPFs distintos → ambíguo, não resolve
        const found = new Map<number, Set<string>>();
        for (const ch of chunks(variants, 400)) {
          const rows = await db.select<{ cpf: string; tel: string }[]>(
            `SELECT cpf, ${where} AS tel FROM ${tabela}
             WHERE cpf IS NOT NULL AND cpf <> '' AND ${where} IN (${ch.map(() => "?").join(",")})`,
            ch,
          );
          for (const r of rows) {
            if (!isValidCpf(r.cpf)) continue;
            for (const i of variantToIdx.get(r.tel) ?? []) {
              const s = found.get(i) ?? new Set<string>();
              s.add(onlyDigits(r.cpf));
              found.set(i, s);
            }
          }
        }
        for (const [i, s] of found) if (s.size === 1 && !cpfs[i]) cpfs[i] = Array.from(s)[0];
      } catch (e) { console.warn(`[cpf] fallback ${tabela} falhou`, e); }
    }

    // 5) nome normalizado exato, só se único em chapa_cpf
    try {
      const idx = pending().filter((i) => nomeNorm(chapas[i].nome_chapa).split(" ").length >= 2);
      const nomes = Array.from(new Set(idx.map((i) => nomeNorm(chapas[i].nome_chapa))));
      const map = new Map<string, Set<string>>();
      for (const ch of chunks(nomes, 400)) {
        const rows = await db.select<{ nome_norm: string; cpf: string }[]>(
          `SELECT nome_norm, cpf FROM chapa_cpf
           WHERE cpf IS NOT NULL AND nome_norm IN (${ch.map(() => "?").join(",")})`,
          ch,
        );
        for (const r of rows) {
          const s = map.get(r.nome_norm) ?? new Set<string>();
          s.add(onlyDigits(r.cpf));
          map.set(r.nome_norm, s);
        }
      }
      for (const i of idx) {
        const s = map.get(nomeNorm(chapas[i].nome_chapa));
        if (s && s.size === 1) cpfs[i] = Array.from(s)[0];
      }
    } catch (e) { console.warn("[cpf] fallback por nome falhou", e); }

    // Persiste só o que foi RESOLVIDO agora (nunca sobrescreve CPF existente)
    if (persist) {
      try {
        for (let i = 0; i < chapas.length; i++) {
          const id = chapas[i].id;
          if (id && cpfs[i] && !isValidCpf(chapas[i].cpf)) {
            await db.execute("UPDATE chapas SET cpf = ? WHERE id = ? AND (cpf IS NULL OR cpf = '')", [cpfs[i], id]);
          }
        }
      } catch (e) { console.warn("[cpf] persistência em chapas.cpf falhou", e); }
    }
  }

  return { cpfs, semCpf: cpfs.filter((c) => !c).length };
}

/**
 * Sync da Question dedicada de CPF (card 1725: id_chapa, nome, cpf,
 * telefone, telefone_norm, telefone_ambiguo, ultima_tarefa). UPSERT por
 * id_chapa, nunca apaga e nunca troca um CPF existente por vazio.
 */
export async function sincronizarCpfChapas(silent = false): Promise<boolean> {
  const cardId = readSettings().metabaseCpfCardId;
  if (!cardId) {
    if (!silent) toast.error("Configure o ID da pergunta de CPF dos chapas em Integrações");
    return false;
  }
  try {
    const status = await invoke<{ configured: boolean }>("metabase_status");
    if (!status.configured) {
      if (!silent) toast.error("Metabase não configurado em Integrações");
      return false;
    }
    const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
    await ensureCpfTable();
    const db = await getDb();
    const now = new Date().toISOString();

    // O export JSON do Metabase vem tudo como texto ("false", "4014" etc.)
    const truthy = (v: unknown) => String(v ?? "").trim().toLowerCase() === "true";
    const parsed: unknown[][] = [];
    for (const row of rows) {
      const k = Object.keys(row);
      const g = (pat: RegExp) => k.find((c) => pat.test(c));
      const val = (pat: RegExp) => { const key = g(pat); return key ? String(row[key] ?? "").trim() : ""; };
      const idChapa = onlyDigits(val(/^id_chapa$/i));
      const cpf = onlyDigits(val(/^cpf$/i));
      if (!idChapa || cpf.length !== 11) continue;
      const nome = val(/^nome$/i);
      const telNorm = phone11(val(/^telefone_norm$/i) || val(/^telefone$/i));
      parsed.push([
        idChapa, nome || null, nome ? nomeNorm(nome) : null, cpf, telNorm,
        truthy(val(/ambiguo/i)) ? 1 : 0, val(/ultima_tarefa/i) || null, now,
      ]);
    }
    if (parsed.length === 0) {
      if (!silent) toast.error("Question de CPF veio vazia — confira o card em Integrações");
      return false;
    }

    for (const ch of chunks(parsed, 100)) {
      await db.execute(
        `INSERT INTO chapa_cpf (id_chapa,nome,nome_norm,cpf,telefone_norm,ambiguo,ultima_tarefa,importado_em)
         VALUES ${ch.map(() => "(?,?,?,?,?,?,?,?)").join(",")}
         ON CONFLICT(id_chapa) DO UPDATE SET
           nome = COALESCE(excluded.nome, chapa_cpf.nome),
           nome_norm = COALESCE(excluded.nome_norm, chapa_cpf.nome_norm),
           cpf = COALESCE(excluded.cpf, chapa_cpf.cpf),
           telefone_norm = COALESCE(excluded.telefone_norm, chapa_cpf.telefone_norm),
           ambiguo = excluded.ambiguo,
           ultima_tarefa = COALESCE(excluded.ultima_tarefa, chapa_cpf.ultima_tarefa),
           importado_em = excluded.importado_em`,
        ch.flat(),
      );
    }

    localStorage.setItem("cpf_chapas_last_sync", now);
    if (!silent) toast.success(`CPF dos chapas sincronizado — ${parsed.length} chapas`);
    return true;
  } catch (e) {
    console.warn("[cpf] sincronizarCpfChapas falhou", e);
    if (!silent) toast.error("Erro ao sincronizar CPF dos chapas");
    return false;
  }
}

/** Gate diário (o cadastro de CPF muda devagar). */
export function devesSincronizarCpfChapas(): boolean {
  const last = localStorage.getItem("cpf_chapas_last_sync");
  if (!last) return true;
  return fmtSP(last, "yyyy-MM-dd") !== todayDateISO_SP();
}
