import { getDb, uuid, placeholders } from "@/lib/db";
import { todayDateISO_SP, fmtSP } from "@/lib/datetime";
import { cleanupTaskLocalStorage } from "@/lib/storageCleanup";

export function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find((x) => x.toLowerCase().trim() === k.toLowerCase());
    if (found && row[found] != null && row[found] !== "") return String(row[found]);
  }
  return "";
}

export function parseDateBR(s: string): string | null {
  if (!s) return null;
  const t = s.trim();
  const m = t.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, d, mo, y, h, mi, se] = m;
    return `${y}-${mo}-${d}T${h}:${mi}:${se ?? "00"}-03:00`;
  }
  const m2 = t.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (m2) {
    const [, monStr, d, y, hStr, mi, ampm] = m2;
    const months: Record<string, number> = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    };
    const mo = months[monStr.toLowerCase()];
    if (!mo) return null;
    let h = parseInt(hStr, 10);
    if (ampm) {
      const upper = ampm.toUpperCase();
      if (upper === "PM" && h < 12) h += 12;
      if (upper === "AM" && h === 12) h = 0;
    }
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${y}-${pad(mo)}-${pad(parseInt(d, 10))}T${pad(h)}:${mi}:00-03:00`;
  }
  const dt = new Date(t);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

// Lida com datas ISO do Metabase ("2025-01-15T10:30:00") além do formato BR
function parseDateForIngest(val: string): string | null {
  if (!val) return null;
  if (val.endsWith("-03:00")) return val;
  const isoMatch = val.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-03:00`;
  return parseDateBR(val);
}

export async function ingestTarefas(
  rows: Record<string, unknown>[],
  opts?: { confirmDateMismatch?: (summary: string) => Promise<boolean> },
): Promise<{ tarefas: number; chapas: number }> {
  const tarefasMap = new Map<number, Record<string, unknown>>();
  const rowCounts = new Map<number, number>();
  const chapas: Record<string, unknown>[] = [];

  for (const row of rows) {
    const id_tarefa = parseInt(pick(row, "ID Tarefa", "id_tarefa"), 10);
    if (!id_tarefa) continue;
    const data_tarefa = parseDateForIngest(pick(row, "Data da Tarefa", "data_tarefa"));
    if (!data_tarefa) continue;

    rowCounts.set(id_tarefa, (rowCounts.get(id_tarefa) ?? 0) + 1);

    if (!tarefasMap.has(id_tarefa)) {
      const spHourStr = new Date(data_tarefa).toLocaleString("en-US", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        hour12: false,
      });
      const spHour = parseInt(spHourStr, 10);
      const is_overnight = Number.isFinite(spHour) && spHour >= 20;
      const qtdCsv = parseInt(pick(row, "Quantidade de Chapas", "quantidade_chapas", "Qtd Chapas", "Qtd. Chapas"), 10) || 0;
      tarefasMap.set(id_tarefa, {
        id_tarefa,
        data_tarefa,
        cidade_uf: pick(row, "Cidade/UF", "cidade_uf") || null,
        empresa: pick(row, "Empresa", "empresa"),
        cnpj: pick(row, "CNPJ", "cnpj") || null,
        status_tarefa: pick(row, "Status da Tarefa", "status_tarefa") || "Em Aberto",
        quantidade_chapas: 0,
        quantidade_chapas_csv: qtdCsv,
        ativo: 1,
        is_overnight: is_overnight ? 1 : 0,
        importado_em: new Date().toISOString(),
      });
    }

    const nome = pick(row, "Nome do Chapa", "nome_chapa");
    if (nome) {
      const cpf = pick(row, "CPF", "cpf", "CPF do Chapa") || null;
      const tel = pick(row, "Telefone Chapa", "telefone_chapa") || null;
      chapas.push({ id_tarefa, nome_chapa: nome, telefone_chapa: tel, cpf });
    }
  }

  // Dedupe chapas por id_tarefa | cpf || nome
  const seen = new Set<string>();
  const dedupedChapas: Record<string, unknown>[] = [];
  for (const c of chapas) {
    const cpfNorm = ((c.cpf as string | null) ?? "").replace(/\D/g, "");
    const nomeNorm = ((c.nome_chapa as string | null) ?? "").toLowerCase().trim().replace(/\s+/g, " ");
    const key = `${c.id_tarefa}|${cpfNorm || nomeNorm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedChapas.push(c);
  }

  const ids = Array.from(tarefasMap.keys());
  if (ids.length === 0) throw new Error("Nenhuma tarefa válida encontrada");

  // Verificação de data (só quando callback fornecido — fluxo CSV manual)
  if (opts?.confirmDateMismatch) {
    const todayISO = todayDateISO_SP();
    const dateBuckets = new Map<string, number>();
    tarefasMap.forEach((t) => {
      const d = fmtSP(t.data_tarefa as string, "yyyy-MM-dd");
      dateBuckets.set(d, (dateBuckets.get(d) ?? 0) + 1);
    });
    const otherDates = Array.from(dateBuckets.entries()).filter(([d]) => d !== todayISO);
    if (otherDates.length > 0) {
      const summary = Array.from(dateBuckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, n]) => `• ${fmtSP(`${d}T12:00:00-03:00`, "dd/MM/yyyy")}: ${n} tarefa(s)${d === todayISO ? " (hoje)" : ""}`)
        .join("\n");
      const ok = await opts.confirmDateMismatch(summary);
      if (!ok) return { tarefas: 0, chapas: 0 };
    }
  }

  const db = await getDb();

  const norm = (s: string | null | undefined) =>
    (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  const chapaKey = (id_t: number, cpf: string | null | undefined, nome: string | null | undefined) => {
    const c = (cpf ?? "").replace(/\D/g, "");
    return c ? `${id_t}|cpf:${c}` : `${id_t}|nome:${norm(nome)}`;
  };

  const tarefaPrev = new Map<number, Record<string, unknown>>();
  const chapaPrev = new Map<string, Record<string, unknown>>();

  for (let i = 0; i < ids.length; i += 900) {
    const chunk = ids.slice(i, i + 900);
    const ph = placeholders(chunk.length);
    const existingT = await db.select<Record<string, unknown>[]>(
      `SELECT id_tarefa, importado_em, observacoes, observacoes_updated_at, validacao_status, data_validacao_recebida, data_upload_meu_chapa, obs_validacao FROM tarefas WHERE id_tarefa IN (${ph})`,
      chunk,
    );
    existingT.forEach((e) => tarefaPrev.set(e.id_tarefa as number, e));

    const existingC = await db.select<Record<string, unknown>[]>(
      `SELECT id, id_tarefa, nome_chapa, cpf, telefone_chapa, status_contato, validacao_presenca, data_validacao, data_contato, canal_contato, data_remocao, motivo_remocao FROM chapas WHERE id_tarefa IN (${ph})`,
      chunk,
    );
    existingC.forEach((c) =>
      chapaPrev.set(chapaKey(c.id_tarefa as number, c.cpf as string | null, c.nome_chapa as string | null), c),
    );
  }

  tarefasMap.forEach((t, id) => {
    const prev = tarefaPrev.get(id);
    const csvQty = t.quantidade_chapas_csv as number;
    t.quantidade_chapas = csvQty > 0 ? csvQty : (rowCounts.get(id) ?? 0);
    if (prev?.importado_em) t.importado_em = prev.importado_em as string;
    t.observacoes = prev?.observacoes ?? null;
    t.observacoes_updated_at = prev?.observacoes_updated_at ?? null;
    const status = String(t.status_tarefa ?? "");
    const inProgressOrDone = /em\s*andamento|finalizado|conclu/i.test(status);
    const prevValStatus = prev?.validacao_status as string | undefined;
    if (inProgressOrDone) {
      t.validacao_status = "subido_meu_chapa";
      t.data_validacao_recebida = prev?.data_validacao_recebida ?? new Date(t.data_tarefa as string).toISOString();
      t.data_upload_meu_chapa = prev?.data_upload_meu_chapa ?? new Date().toISOString();
      t.obs_validacao = prev?.obs_validacao ?? "Importada já validada";
    } else {
      t.validacao_status = prevValStatus ?? "aguardando";
      t.data_validacao_recebida = prev?.data_validacao_recebida ?? null;
      t.data_upload_meu_chapa = prev?.data_upload_meu_chapa ?? null;
      t.obs_validacao = prev?.obs_validacao ?? null;
    }
  });

  const chapasToInsert = dedupedChapas.map((c) => {
    const prev = chapaPrev.get(
      chapaKey(c.id_tarefa as number, c.cpf as string | null, c.nome_chapa as string | null),
    );
    const taskStatus = String((tarefasMap.get(c.id_tarefa as number)?.status_tarefa) ?? "");
    const taskInProgressOrDone = /em\s*andamento|finalizado/i.test(taskStatus);
    const chapaId = (prev?.id as string | undefined) ?? uuid();
    if (prev) {
      const wasRemoved = prev.status_contato === "removido";
      return {
        ...c,
        id: chapaId,
        status_contato: wasRemoved ? "removido" : (taskInProgressOrDone ? "confirmado" : (prev.status_contato ?? "pendente")),
        validacao_presenca: wasRemoved ? null : (taskInProgressOrDone ? "presente" : (prev.validacao_presenca ?? "pendente")),
        data_validacao: wasRemoved ? null : (taskInProgressOrDone ? (prev.data_validacao ?? new Date().toISOString()) : (prev.data_validacao ?? null)),
        data_contato: prev.data_contato ?? null,
        canal_contato: prev.canal_contato ?? null,
        data_remocao: prev.data_remocao ?? null,
        motivo_remocao: prev.motivo_remocao ?? null,
        telefone_chapa: c.telefone_chapa ?? prev.telefone_chapa ?? null,
      };
    }
    return {
      ...c,
      id: chapaId,
      status_contato: taskInProgressOrDone ? "confirmado" : "pendente",
      validacao_presenca: taskInProgressOrDone ? "presente" : "pendente",
      data_validacao: taskInProgressOrDone ? new Date().toISOString() : null,
      data_contato: null,
      canal_contato: null,
      data_remocao: null,
      motivo_remocao: null,
    };
  });

  const seenIds = new Set<string>();
  const chapasFinais = chapasToInsert.filter((c) => {
    if (seenIds.has(c.id as string)) return false;
    seenIds.add(c.id as string);
    return true;
  });

  // Helper: monta "(...),(...)..." com N colunas por linha
  function rowGroup(cols: number, rows: number): string {
    return Array(rows).fill(`(${placeholders(cols)})`).join(",");
  }

  // Upsert tarefas em lote (50 linhas × 16 colunas = 800 binds por statement)
  const tarefasArr = Array.from(tarefasMap.values());
  for (let i = 0; i < tarefasArr.length; i += 50) {
    const chunk = tarefasArr.slice(i, i + 50);
    const params = chunk.flatMap((t) => [
      t.id_tarefa, t.data_tarefa, t.cidade_uf ?? null, t.empresa, t.cnpj ?? null,
      t.status_tarefa, t.quantidade_chapas, t.ativo, t.is_overnight, t.importado_em,
      t.observacoes ?? null, t.observacoes_updated_at ?? null,
      t.validacao_status, t.data_validacao_recebida ?? null,
      t.data_upload_meu_chapa ?? null, t.obs_validacao ?? null,
    ]);
    await db.execute(
      `INSERT OR REPLACE INTO tarefas (id_tarefa, data_tarefa, cidade_uf, empresa, cnpj, status_tarefa, quantidade_chapas, ativo, is_overnight, importado_em, observacoes, observacoes_updated_at, validacao_status, data_validacao_recebida, data_upload_meu_chapa, obs_validacao) VALUES ${rowGroup(16, chunk.length)}`,
      params,
    );
  }

  // Chapas: UPSERT em vez de DELETE+INSERT — a v1.0.52 (MCM-151) tentou
  // corrigir o gap do DELETE+INSERT envolvendo tudo numa transação
  // BEGIN/COMMIT, mas o plugin (`tauri-plugin-sql`) usa um pool de
  // conexões por baixo dos panos, sem garantia documentada de que
  // chamadas `execute()` sequenciais caem na MESMA conexão — ou seja, a
  // transação podia nem ser atômica de verdade, e pior: BEGIN IMMEDIATE
  // segurando uma conexão do pool por um sync inteiro (dezenas/centenas de
  // INSERTs em lote) bloqueava qualquer OUTRA conexão do pool tentando ler
  // ou escrever ao mesmo tempo — causou "database is locked" (code 5) em
  // produção, inclusive travando o próprio sync do Metabase (v1.0.54/55).
  //
  // UPSERT resolve o problema ORIGINAL (chapa sumir momentaneamente) sem
  // precisar de transação nenhuma: cada chapa existente é atualizada
  // in-place (nunca deixa de existir na tabela, nem por um instante) — o
  // `id` já é preservado via `chapaPrev` (mesmo padrão de antes). Só
  // remove, no final, quem realmente saiu da tarefa (não está mais no
  // pull do Metabase) — um DELETE bem menor e escopado, não "apaga tudo
  // primeiro". Mesmo padrão que a Central já usa (upsert, nunca delete
  // em massa) pro próprio sync dela.
  for (let i = 0; i < chapasFinais.length; i += 80) {
    const chunk = chapasFinais.slice(i, i + 80);
    const params = chunk.flatMap((c) => [
      c.id, c.id_tarefa, c.nome_chapa ?? null, c.telefone_chapa ?? null, c.cpf ?? null,
      c.status_contato, c.validacao_presenca ?? null, c.data_validacao ?? null,
      c.data_contato ?? null, c.canal_contato ?? null, c.data_remocao ?? null, c.motivo_remocao ?? null,
    ]);
    await db.execute(
      `INSERT INTO chapas (id, id_tarefa, nome_chapa, telefone_chapa, cpf, status_contato, validacao_presenca, data_validacao, data_contato, canal_contato, data_remocao, motivo_remocao) VALUES ${rowGroup(12, chunk.length)}
       ON CONFLICT(id) DO UPDATE SET
         id_tarefa = excluded.id_tarefa,
         nome_chapa = excluded.nome_chapa,
         telefone_chapa = excluded.telefone_chapa,
         cpf = excluded.cpf,
         status_contato = excluded.status_contato,
         validacao_presenca = excluded.validacao_presenca,
         data_validacao = excluded.data_validacao,
         data_contato = excluded.data_contato,
         canal_contato = excluded.canal_contato,
         data_remocao = excluded.data_remocao,
         motivo_remocao = excluded.motivo_remocao`,
      params,
    );
  }

  // Remove só quem realmente saiu das tarefas afetadas (não veio nesta
  // rodada do Metabase) — escopado por tarefa E pelos ids que sobreviveram,
  // nunca um DELETE amplo.
  const survivingIdsByTarefa = new Map<number, string[]>();
  for (const c of chapasFinais) {
    const key = c.id_tarefa as number;
    const arr = survivingIdsByTarefa.get(key) ?? [];
    arr.push(c.id as string);
    survivingIdsByTarefa.set(key, arr);
  }
  for (let i = 0; i < ids.length; i += 900) {
    const chunk = ids.slice(i, i + 900);
    const survivors = chunk.flatMap((id) => survivingIdsByTarefa.get(id) ?? []);
    if (survivors.length === 0) {
      await db.execute(`DELETE FROM chapas WHERE id_tarefa IN (${placeholders(chunk.length)})`, chunk);
    } else {
      await db.execute(
        `DELETE FROM chapas WHERE id_tarefa IN (${placeholders(chunk.length)}) AND id NOT IN (${placeholders(survivors.length)})`,
        [...chunk, ...survivors],
      );
    }
  }

  try {
    const allIds = await db.select<{ id_tarefa: number }[]>("SELECT id_tarefa FROM tarefas");
    cleanupTaskLocalStorage(new Set(allIds.map((r) => r.id_tarefa)));
  } catch { /* limpeza é melhor-esforço */ }

  return { tarefas: tarefasMap.size, chapas: chapasFinais.length };
}
