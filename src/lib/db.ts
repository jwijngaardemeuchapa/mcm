import Database from "@tauri-apps/plugin-sql";
import { garantirFasesConfirmacao } from "./fasesConfirmacao";

// Uma abertura só, compartilhada: quem chama getDb() enquanto o banco ainda está sendo
// preparado (PRAGMAs, colunas das fases de confirmação) espera a MESMA promessa — antes um
// segundo chamador recebia o banco pela metade.
let _dbPronto: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!_dbPronto) {
    _dbPronto = abrirBanco().catch((e) => {
      _dbPronto = null; // falhou: a próxima chamada tenta de novo
      throw e;
    });
  }
  return _dbPronto;
}

async function abrirBanco(): Promise<Database> {
  const db = await Database.load("sqlite:fupmanager.db");
  // Aguarda até 5s por locks em vez de falhar imediatamente (SQLITE_BUSY code 5)
  await db.execute("PRAGMA busy_timeout = 5000");
  // WAL: leitores não ficam bloqueados por um escritor em andamento. Sem
  // isso, a transação de ingestTarefas() (BEGIN IMMEDIATE.../COMMIT,
  // adicionada pra corrigir o MCM-151) segura o lock de escrita durante
  // TODO o sync — em journal mode padrão (rollback journal), isso bloqueia
  // qualquer leitura concorrente (polling do WatcherContext a cada 60s,
  // queries do Dashboard) até o COMMIT terminar; se o sync demorar mais
  // que os 5s de busy_timeout (esperado num dia com muitas tarefas), o
  // leitor recebe SQLITE_BUSY (code 5) — exatamente o bug reportado
  // "database is locked ao sincronizar depois de atualizar". WAL resolve
  // isso sem abrir mão da atomicidade do fix anterior.
  await db.execute("PRAGMA journal_mode = WAL");
  // Colunas das fases de confirmação (PréFUP/FUP) e gatilho que as limpa. Nunca deve
  // impedir o app de abrir: se falhar, o resto funciona (só as flags ficam sem gravar).
  try { await garantirFasesConfirmacao(db); } catch (e) { console.warn("fases de confirmação:", e); }
  return db;
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function placeholders(count: number): string {
  return Array(count).fill("?").join(",");
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
