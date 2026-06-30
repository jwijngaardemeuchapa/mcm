import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { readSettings } from "./settings";
import { ingestTarefas } from "./ingestTarefas";
import { getDb, uuid } from "./db";

export async function sincronizarMetabase(silent = false): Promise<boolean> {
  const s = readSettings();
  const cardId = s.metabaseTarefasCardId;
  if (!cardId) {
    if (!silent) toast.error("Configure o ID da pergunta do Metabase em Integrações");
    return false;
  }
  try {
    const status = await invoke<{ configured: boolean }>("metabase_status");
    if (!status.configured) {
      if (!silent) toast.error("Metabase não configurado em Integrações");
      return false;
    }
    const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
    const result = await ingestTarefas(rows);
    localStorage.setItem("metabase_last_sync", new Date().toISOString());
    if (!silent) toast.success(`Sync concluído — ${result.tarefas} tarefas, ${result.chapas} chapas`);
    return true;
  } catch {
    if (!silent) toast.error("Erro ao sincronizar com Metabase");
    return false;
  }
}

export async function sincronizarMetabase30h(silent = false): Promise<boolean> {
  const s = readSettings();
  const cardId = s.metabaseTarefas30hCardId;
  if (!cardId) {
    if (!silent) toast.error("Configure o ID da pergunta '30h' do Metabase em Integrações");
    return false;
  }
  try {
    const status = await invoke<{ configured: boolean }>("metabase_status");
    if (!status.configured) {
      if (!silent) toast.error("Metabase não configurado em Integrações");
      return false;
    }
    const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
    const result = await ingestTarefas(rows);
    localStorage.setItem("metabase_last_sync_30h", new Date().toISOString());
    if (!silent) toast.success(`Sync amanhã — ${result.tarefas} tarefas, ${result.chapas} chapas`);
    return true;
  } catch {
    if (!silent) toast.error("Erro ao sincronizar tarefas das próximas 30h");
    return false;
  }
}

const GRUPOS = ["G1", "G2", "G3", "G4", "G5"];

export async function sincronizarCarteira(silent = false): Promise<boolean> {
  const s = readSettings();
  const cardId = s.metabaseCarteiraCardId;
  if (!cardId) {
    if (!silent) toast.error("Configure o ID da pergunta de Carteira em Integrações");
    return false;
  }
  try {
    const status = await invoke<{ configured: boolean }>("metabase_status");
    if (!status.configured) {
      if (!silent) toast.error("Metabase não configurado em Integrações");
      return false;
    }
    const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
    const db = await getDb();
    const now = new Date().toISOString();
    let count = 0;
    for (const row of rows) {
      const keys = Object.keys(row);
      const nameKey = keys.find((k) => /nome\s*fantasia|empresa|raz.o\s*social|company|nome/i.test(k));
      const cnpjKey = keys.find((k) => /cnpj/i.test(k));
      const grupoKey = keys.find((k) => /^carteira$/i.test(k));
      const name = nameKey ? String(row[nameKey] ?? "").trim().replace(/\s+/g, " ") : "";
      if (!name) continue;
      const grupoRaw = grupoKey ? String(row[grupoKey] ?? "").trim() : "";
      const grupo = GRUPOS.includes(grupoRaw) ? grupoRaw : null;
      const cnpj = cnpjKey ? String(row[cnpjKey] ?? "").trim() || null : null;
      await db.execute(
        `INSERT INTO carteira (id, nome_fantasia, cnpj, grupo, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(nome_fantasia) DO UPDATE SET cnpj = excluded.cnpj, grupo = COALESCE(excluded.grupo, carteira.grupo)`,
        [uuid(), name, cnpj, grupo, now],
      );
      count++;
    }
    localStorage.setItem("carteira_last_sync", new Date().toISOString());
    if (!silent) toast.success(`Carteira sincronizada — ${count} empresas`);
    return true;
  } catch {
    if (!silent) toast.error("Erro ao sincronizar carteira");
    return false;
  }
}

export async function sincronizarRegistro(silent = false): Promise<boolean> {
  const s = readSettings();
  const cardId = s.metabaseRegistroCardId;
  if (!cardId) {
    if (!silent) toast.error("Configure o ID da pergunta de Cadastro em Integrações");
    return false;
  }
  try {
    const status = await invoke<{ configured: boolean }>("metabase_status");
    if (!status.configured) {
      if (!silent) toast.error("Metabase não configurado em Integrações");
      return false;
    }
    const rows = await invoke<Record<string, unknown>[]>("metabase_query_card", { cardId });
    const db = await getDb();
    const now = new Date().toISOString();

    // Ensure 'fonte' column exists (safe alter)
    try { await db.execute("ALTER TABLE chapa_registry ADD COLUMN fonte TEXT DEFAULT 'metabase'"); } catch { /* already exists */ }
    // Ensure index exists
    try { await db.execute("CREATE INDEX IF NOT EXISTS idx_registry_fonte ON chapa_registry(fonte)"); } catch { /* exists */ }

    await db.execute("DELETE FROM chapa_registry WHERE fonte IS NULL OR fonte = 'metabase'");

    // 1) Parse + dedup. cpf deixou de ser PRIMARY KEY (migração v16), mas duplicatas
    // ainda poluem o BID e inflam a base — dedup por cpf (ou nome quando sem cpf).
    //
    // Detecção de coluna: se a pergunta do Metabase tiver MAIS DE UMA coluna que
    // "pareça" telefone (ex.: "Telefone" + "Telefone Indicador"/"Telefone Recrutador"),
    // um regex único (`telefone|celular|fone`) pode pegar a coluna errada para a base
    // inteira — sintoma: nome de uma pessoa com telefone de outra. `pick()` tenta
    // padrões exatos primeiro e detecta ambiguidade para alertar o operador.
    let ambiguousPhoneCols: string[] | null = null;
    let ambiguousNameCols: string[] | null = null;
    const pick = (...patterns: RegExp[]) => {
      for (const pat of patterns) {
        const match = k0.find((c) => pat.test(c));
        if (match) return match;
      }
      return undefined;
    };
    let k0: string[] = [];
    const parsed: unknown[][] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const k = Object.keys(row);
      k0 = k;
      const g = (pat: RegExp) => k.find((c) => pat.test(c));
      const str = (key: string | undefined) => key ? String(row[key] ?? "").trim() || null : null;
      const dig = (key: string | undefined) => key ? String(row[key] ?? "").replace(/\D/g, "") || null : null;
      const num = (key: string | undefined) => key ? parseInt(String(row[key] ?? "0")) || 0 : 0;
      // "Nome do Chapa" nunca pode cair para "Nome da Mãe" — mesmo como fallback.
      // A pergunta de Cadastro Geral tem as duas colunas; se "Nome do Chapa" vier
      // vazio/omitido nessa linha (APIs costumam omitir campos nulos do JSON), o
      // regex genérico /nome/i pegaria "Nome da Mãe" para aquela linha específica,
      // mantendo o telefone real do chapa — produz nome feminino (da mãe) com
      // telefone do próprio chapa (geralmente homem). Exclusão explícita evita isso.
      const nomeCol = k.find((c) => /^nome do chapa$/i.test(c))
        ?? k.find((c) => /^nome$/i.test(c))
        ?? k.find((c) => /nome/i.test(c) && !/m[ãa]e/i.test(c));
      const nome = str(nomeCol) ?? "";
      if (!nome) continue;
      const telCol = pick(/^telefone$/i, /^celular$/i, /^fone$/i, /telefone|celular|fone/i);
      if (ambiguousPhoneCols === null) {
        const allPhoneLike = Array.from(new Set(k.filter((c) => /telefone|celular|fone/i.test(c))));
        ambiguousPhoneCols = allPhoneLike.length > 1 ? allPhoneLike : [];
      }
      if (ambiguousNameCols === null) {
        // "Nome da Mãe" é um caso conhecido e tratado (excluído acima) — não conta
        // como ambiguidade a alertar. Só preocupa se houver OUTRA coluna "nome"
        // além de "Nome do Chapa"/"Nome" que não seja a mãe.
        const allNameLike = Array.from(new Set(k.filter((c) => /nome/i.test(c) && !/m[ãa]e/i.test(c))));
        ambiguousNameCols = allNameLike.length > 1 ? allNameLike : [];
      }
      const cpf = dig(pick(/^cpf$/i));
      const dedupKey = cpf || `nome:${nome.toLowerCase().replace(/\s+/g, " ")}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      parsed.push([
        cpf,
        nome,
        dig(telCol),
        str(g(/^cidade$/i)),
        str(g(/bairro/i)),
        str(g(/^estado$|^uf$/i)),
        str(g(/^rua$|^endere/i)),
        dig(g(/^cep$/i)),
        str(g(/^n[uú]mero$|^num$/i)),
        num(g(/tarefas|qtd/i)),
        str(g(/primeira/i)),
        str(g(/[uú]ltima/i)),
        str(g(/situa/i)),
        str(g(/bloqueio/i)),
        str(g(/motivo/i)),
        str(g(/^aso$/i)),
        now,
        "metabase",
      ]);
    }

    // Alerta visível (sem precisar de DevTools): se a pergunta do Metabase tem mais
    // de uma coluna candidata a telefone ou nome, o regex pode estar pegando a
    // coluna errada para a base inteira — sintoma relatado: nome de mulher com
    // telefone de homem. Mostra qual coluna foi de fato usada para conferência.
    if (ambiguousPhoneCols && ambiguousPhoneCols.length > 1) {
      toast.warning(
        `Cadastro: ${ambiguousPhoneCols.length} colunas parecem telefone (${ambiguousPhoneCols.join(", ")}). Usando "${ambiguousPhoneCols[0]}". Confira se está certo em Integrações.`,
        { duration: 15000 },
      );
    }
    if (ambiguousNameCols && ambiguousNameCols.length > 1) {
      toast.warning(
        `Cadastro: ${ambiguousNameCols.length} colunas parecem nome (${ambiguousNameCols.join(", ")}). Usando "${ambiguousNameCols[0]}". Confira se está certo em Integrações.`,
        { duration: 15000 },
      );
    }

    // 2) Insert resiliente por chunk: um chunk que falhe não derruba o sync inteiro
    // (antes o catch externo engolia tudo em silêncio).
    const CHUNK = 30;
    let count = 0;
    let failed = 0;
    const ROW_PH = "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK);
      const ph = Array(chunk.length).fill(ROW_PH).join(",");
      const vals = chunk.flat();
      try {
        await db.execute(
          `INSERT INTO chapa_registry (cpf,nome,telefone,cidade,bairro,estado,rua,cep,numero,tarefas,data_primeira_tarefa,data_ultima_tarefa,situacao,bloqueio,motivo_bloqueio,aso,importado_em,fonte) VALUES ${ph}`,
          vals,
        );
        count += chunk.length;
      } catch (e) {
        failed += chunk.length;
        console.error("Falha ao inserir chunk de cadastro", e);
      }
    }

    localStorage.setItem("chapa_registry_imported_at", now);
    if (!silent) {
      if (failed > 0) toast.warning(`Cadastro: ${count} importados, ${failed} falharam`);
      else toast.success(`Cadastro sincronizado — ${count} chapas`);
    }
    return true;
  } catch {
    if (!silent) toast.error("Erro ao sincronizar cadastro de chapas");
    return false;
  }
}

/**
 * Sincroniza apenas os Leads Saac (Captação via Lovable API) — leve e
 * independente do cadastro geral. Faz DELETE+INSERT só de fonte='leads_saac'.
 */
export async function sincronizarLeadsSaac(silent = false): Promise<boolean> {
  const s = readSettings();
  if (!s.saacApiUrl || !s.saacApiKey) {
    if (!silent) toast.error("Configure a URL e a chave da API Saac em Integrações");
    return false;
  }
  try {
    const db = await getDb();
    const now = new Date().toISOString();

    // Garante coluna/índice 'fonte' (mesmo padrão idempotente do cadastro)
    try { await db.execute("ALTER TABLE chapa_registry ADD COLUMN fonte TEXT DEFAULT 'metabase'"); } catch { /* já existe */ }
    try { await db.execute("CREATE INDEX IF NOT EXISTS idx_registry_fonte ON chapa_registry(fonte)"); } catch { /* já existe */ }

    const res = await fetch(s.saacApiUrl, { headers: { "x-api-key": s.saacApiKey } });
    if (!res.ok) {
      console.error("Saac API HTTP Error", res.status);
      if (!silent) toast.error(`Erro na API Saac (HTTP ${res.status})`);
      return false;
    }
    const leads = await res.json();
    if (!Array.isArray(leads)) {
      if (!silent) toast.error("Resposta inesperada da API Saac");
      return false;
    }

    // 1) Parse + dedup (por cpf, senão telefone, senão nome).
    // DELETE só depois do parse: se o loop lançar exceção os dados antigos ficam intactos.
    // Dedup usa "melhor status ganha" (não "primeiro ganha"): quando dois registros
    // compartilham o mesmo telefone, mantemos o de status mais avançado.
    // Isso evita que um lead feminino de status baixo sobreponha um chapa_ativado
    // masculino que aparece depois no payload com o mesmo número.
    const STATUS_PRIO: Record<string, number> = {
      chapa_ativado: 100, candidato_apto: 80, acolhimento: 40,
      novos: 30, triagem: 20, prazo_vencido: 5,
      cadastro_cancelado: 0, chapa_bloqueado: 0, reprovado_brk: 0,
    };
    const parsedL: unknown[][] = [];
    const seenL = new Map<string, { prio: number; idx: number }>();
    for (const row of leads) {
      const nomeLead = String(row.client_name || row.name || "").trim();
      if (!nomeLead) continue;

      const cpf = row.cpf ? String(row.cpf).replace(/\D/g, "") : null;
      const fone = row.phone ? String(row.phone).replace(/\D/g, "") : null;
      const dedupKey = cpf || (fone ? `tel:${fone}` : `nome:${nomeLead.toLowerCase().replace(/\s+/g, " ")}`);

      // Bloqueio baseado em dados concretos do payload — farol_status NÃO é
      // sinal de bloqueio: aparece "vermelho" em candidato_apto e chapa_ativado
      // (leads bons). Bloquear apenas por: status explicitamente negativo,
      // block_reason ou cancel_reason preenchidos.
      const statusRaw = row.status ? String(row.status).trim() : "triagem";
      const BLOCKED_STATUSES = ["cadastro_cancelado", "chapa_bloqueado", "reprovado_brk"];
      const blocked =
        BLOCKED_STATUSES.includes(statusRaw) ||
        !!row.block_reason ||
        !!row.cancel_reason
          ? "BLOQUEADO" : null;
      const motivo = row.cancel_reason || row.block_reason || (statusRaw === "reprovado_brk" ? "reprovado" : null);

      // chapa_ativado = já fez tarefas no sistema, mas o payload não traz contagem.
      // Marca tarefas=1 para que o scoring do BID coloque no tier "ativado" (prioridade máxima).
      const tarefas = statusRaw === "chapa_ativado" ? 1
        : parseInt(String(row.tasks_done ?? row.completed_tasks ?? row.tarefas ?? row.total_tarefas ?? 0)) || 0;

      const prio = STATUS_PRIO[statusRaw] ?? 10;
      const rowData: unknown[] = [
        cpf, nomeLead, fone,
        row.city ? String(row.city).trim() : null,
        null, // bairro
        row.state ? String(row.state).trim() : null,
        null, null, null, // rua, cep, numero
        tarefas, null, null,
        statusRaw, blocked, motivo, null, // aso
        now, "leads_saac",
      ];

      const existing = seenL.get(dedupKey);
      if (existing) {
        if (prio > existing.prio) {
          // Substituir pelo registro de status mais avançado
          parsedL[existing.idx] = rowData;
          seenL.set(dedupKey, { prio, idx: existing.idx });
        }
        // senão: manter o existente (prio igual ou superior)
      } else {
        seenL.set(dedupKey, { prio, idx: parsedL.length });
        parsedL.push(rowData);
      }
    }

    // 2) Delete → Insert resiliente por chunk (DELETE só agora: parsedL já está pronto,
    //    então uma exceção no loop acima não apaga dados existentes).
    await db.execute("DELETE FROM chapa_registry WHERE fonte = 'leads_saac'");
    let leadsCount = 0;
    let failedL = 0;
    const CHUNK_L = 30;
    const ROW_PH = "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    for (let i = 0; i < parsedL.length; i += CHUNK_L) {
      const chunk = parsedL.slice(i, i + CHUNK_L);
      const phL = Array(chunk.length).fill(ROW_PH).join(",");
      try {
        await db.execute(
          `INSERT INTO chapa_registry (cpf,nome,telefone,cidade,bairro,estado,rua,cep,numero,tarefas,data_primeira_tarefa,data_ultima_tarefa,situacao,bloqueio,motivo_bloqueio,aso,importado_em,fonte) VALUES ${phL}`,
          chunk.flat(),
        );
        leadsCount += chunk.length;
      } catch (e) {
        failedL += chunk.length;
        console.error("Falha ao inserir chunk de leads", e);
      }
    }

    localStorage.setItem("saac_last_sync", now);
    if (!silent) {
      if (failedL > 0) toast.warning(`Leads Saac: ${leadsCount} importados, ${failedL} falharam`);
      else toast.success(`Leads Saac importados: ${leadsCount}`);
    }
    return true;
  } catch (e) {
    console.error("Erro ao puxar Saac API", e);
    if (!silent) toast.error("Erro ao sincronizar Leads Saac");
    return false;
  }
}

export function devesSincronizarCarteira(): boolean {
  const last = localStorage.getItem("carteira_last_sync");
  if (!last) return true;
  const lastDate = new Date(last);
  const now = new Date();
  // Encontra a última segunda-feira
  const dayOfWeek = now.getDay(); // 0=dom, 1=seg...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - daysSinceMonday);
  lastMonday.setHours(0, 0, 0, 0);
  return lastDate < lastMonday;
}

/**
 * Cadastro geral: devido 2x por semana — âncoras segunda (1) e quinta (4) à 00h.
 * Devido se a última sync foi antes da âncora mais recente <= agora.
 */
export function devesSincronizarRegistro(): boolean {
  const last = localStorage.getItem("chapa_registry_imported_at");
  if (!last) return true;
  const lastDate = new Date(last);
  const now = new Date();
  const dow = now.getDay(); // 0=dom..6=sáb
  // dias desde a âncora mais recente (seg=1 ou qui=4)
  const anchorDays = [1, 4];
  let minDiff = Infinity;
  for (const a of anchorDays) {
    let diff = dow - a;
    if (diff < 0) diff += 7;
    minDiff = Math.min(minDiff, diff);
  }
  const lastAnchor = new Date(now);
  lastAnchor.setDate(now.getDate() - minDiff);
  lastAnchor.setHours(0, 0, 0, 0);
  return lastDate < lastAnchor;
}
