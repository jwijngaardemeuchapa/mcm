# Handoff — Jeremiah / claude

**Data:** 2026-06-19
**Versão atual:** v0.9.99 (build em andamento)
**Branch:** main (limpo, em sincronia com origin)

---

## O que foi feito nesta sessão (v0.9.99)

### Correção crítica — ingestTarefas + pool SQLx

**Problema:** `@tauri-apps/plugin-sql` usa pool de conexões SQLx. `BEGIN/COMMIT` manual (adicionado em v0.9.98) rodava em conexões diferentes do pool → BEGIN ficava órfão com write lock aberto. Causava 3 sintomas: "database is locked" (code 5), "transaction within a transaction" (code 1), lentidão em cliques (writers esperavam o lock por segundos).

**Fix em `src/lib/ingestTarefas.ts`:**
- Removida toda a lógica de transação manual (BEGIN/COMMIT/ROLLBACK)
- Removido DELETE-tudo de chapas por `id_tarefa`
- Upsert tarefas: `INSERT OR REPLACE` multi-row, chunks de 50 (16 cols × 50 = 800 binds)
- Upsert chapas: `INSERT OR REPLACE` multi-row, chunks de 80 (12 cols × 80 = 960 binds)
- Delete cirúrgico: só deleta chapas cujo `id` não aparece mais em `chapasFinais` (usando `chapaPrev` como referência)

**Sem flicker:** ids de chapas são determinísticos (reutilizados se chapa existe), então upsert nunca esvazia a tabela em nenhum instante.

**LESSON salva em LESSONS.md:** nunca usar BEGIN/COMMIT com plugin-sql. Referência: `M_leo.ts:236`.

### Fix mantidos de sessões anteriores
- `skipDiffRef` em Dashboard (diff falso no sino durante syncs explícitos)
- `PRAGMA busy_timeout=5000` em db.ts (rede de segurança)
- Filtro de carteira/grupo em TrocaDeTurno

---

## Pendências próximas
- Distribuir MCM_0.9.99_x64-setup.exe após build
- MCM-27 — Pool de Chapas (planejamento feito, pendente implementação)
- MCM-58 — Firebase Analytics BID (aguarda validação de queries)
- MCM-68 — Tela Foco
