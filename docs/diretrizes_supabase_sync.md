# Diretrizes — Sincronização multi-analista via Supabase
*Documento de planejamento (item 9 do panorama) — para implementação futura. Nada aqui altera o app hoje.*

## Princípio inegociável

**Offline-first.** O SQLite local continua sendo a fonte de operação — o app nunca pode parar porque a internet caiu. Supabase entra como **camada de sincronização**, não como substituição do banco (anti-roadmap do panorama).

## Arquitetura alvo

```
SQLite local (operação)
   │  outbox: fila de eventos locais (INSERT/UPDATE com updated_at + operador)
   ▼
Sync worker (no app, a cada ~30s e ao reconectar)
   │  push: eventos pendentes → Supabase (upsert)
   │  pull: mudanças remotas desde last_sync → aplica no SQLite
   ▼
Supabase (Postgres + RLS + Realtime)
   └─ visão única da operação · dashboard web read-only do dono
```

## Decisões de design

1. **Outbox pattern**: toda escrita local grava também em `sync_outbox (id, tabela, row_id, op, payload_json, updated_at, operador, synced)`. O worker drena a fila; sem rede, acumula — zero impacto na UX.
2. **Carimbo de autoria**: todas as linhas sincronizadas levam `operador` (já existe `operadorNome` nas settings) e `updated_at` ISO. Pré-requisito: preencher `operadorNome` em todas as máquinas.
3. **Resolução de conflito**: LWW (last-write-wins) por `updated_at`, com duas exceções de domínio:
   - `chapas.status_contato`: estado mais "avançado" vence (`confirmado` > `nao_respondeu` > `pendente`; `removido` só perde para `confirmado` mais recente);
   - `tarefas.validacao_status`: nunca regride no fluxo `aguardando → pendente → validacao_recebida`.
4. **Ordem de adoção das tabelas** (menor risco → maior): `carteira` → `cliente_book` → `chapa_book` → `tarefas` + `chapas` → `fup_log` → `bid_disparos`. Tabelas derivadas/cache (`cep_cache`, `leo_cache`, `chapa_registry`) **não sincronizam** — cada máquina importa a sua.
5. **Lock leve de tarefa** (fase 2): tabela `task_presence (id_tarefa, operador, heartbeat)` via Realtime — exibe "Maria está nesta tarefa" no card (aviso, não bloqueio).
6. **Identidade/segurança**: Supabase Auth com 1 usuário por analista; RLS por organização (single-tenant hoje, mas escrever as policies desde o início). Chaves anon no `.env` já existem; CSP do Tauri já libera `*.supabase.co`.
7. **Schema versionado**: tabela `schema_meta (version)` no Postgres espelhando as migrações do SQLite — sync só roda se as versões forem compatíveis (proteção contra app desatualizado corromper dados).
8. **Migração inicial**: snapshot `.mcmbak` da máquina "fonte da verdade" → seed do Postgres; demais máquinas fazem pull completo na primeira sync.

## Fases de entrega

| Fase | Entrega | Valor |
|---|---|---|
| 1 | Outbox + push unidirecional (espelho na nuvem, ninguém lê) | Backup contínuo + dados para dashboard do dono |
| 2 | Pull + merge com regras de conflito + presença de tarefa | Visão única real entre analistas |
| 3 | Web read-only do dono (Supabase + Vite estático) | Dono enxerga a operação sem instalar nada |

## Riscos mapeados

- **Telefone/CPF como quase-chave**: dedupe entre máquinas antes da fase 2 (relatório de duplicados do panorama, item 7, vira pré-requisito).
- **Relógio das máquinas**: LWW depende de hora correta — validar NTP/hora do Windows no health-check do app.
- **Volume**: `fup_log` cresce rápido; sync com janela (últimos 90 dias) + arquivamento.
