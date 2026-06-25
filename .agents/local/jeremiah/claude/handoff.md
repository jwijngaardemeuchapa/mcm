# Handoff — Jeremiah / claude

**Data:** 2026-06-25
**Versão atual:** v1.0.1 (build pendente)
**Branch:** main
**Último commit:** 8ab536a

---

## O que foi feito nesta sessão

### Integração Saac & Otimização do BID Dashboard (MCM-84)
- **Integração Saac (Fase 1):** Configuração de ingestão de leads via webhook (`metabase-leads`), inclusão do campo `fonte` no DB (`chapa_registry`) e nova aba em `Integracoes.tsx` para configuração segura de API URL e API Key do Supabase/Lovable.
- **Bônus de Cidade (+30pts):** Adicionado ao algoritmo do BID (`update_biddashboard.cjs`) para garantir que leads recém importados sem CEP válido ou preenchido não sejam excessivamente penalizados no ranking.
- **Virtual Scroll (useVirtualizer):** Refatoração da tabela principal do `BIDDashboard.tsx` para usar o `@tanstack/react-virtual`, garantindo máxima performance e zero lag na UI mesmo com mais de 3.000 candidatos carregados.
- **Ordenação em Tempo Real (Real Sorting):** Adicionada capacidade de clicar no cabeçalho da tabela do BID e ordenar instantaneamente a base por Nome, Distância, Tarefas e Situação (asc/desc).
- **Badge 'LEAD SAAC':** Inclusão de um selo visual cor índigo nos candidatos com `fonte === "leads_saac"` para rápida distinção na operação.

### Conserto pós-revisão do MCM-84 (MCM-85 + MCM-83) — commit 8ab536a
- **MCM-84 tinha ido para a main quebrado:** BIDDashboard usava `virtualizer`/`activeList`/`toggleSort` indefinidos + tipo `AdHocBidParams` inexistente → crash ao expandir card. Virtualização ficou pela metade.
- **Causa de não ter sido pego:** `npx tsc --noEmit` não checa `src/` (tsconfig.json `files:[]` + references). Usar **`npm run typecheck`** (`tsc -p tsconfig.app.json`) — script adicionado nesta sessão.
- Completei `useVirtualizer` (medição dinâmica), `activeList`, `toggleSort`, `AdHocBidParams`.
- Recovery idempotente da coluna `fonte` em `chapa_registry` no `setup()` Rust (a query `r.fonte` do BID quebrava em instalação nova).
- MCM-83: extras autorizados não somem mais (flag `is_extra` em vez de `cpf===null`, por causa de leads Saac sem CPF).
- **Atenção:** restam **14 erros de tipo pré-existentes** (fora do BID) revelados pelo typecheck correto — vite ignora, mas valem revisão futura.

### Planejamento Autopilot (MCM-71)
- **Implementação do Plano Técnico:** Levantamento de Requisitos e perguntas abertas detalhados.
- **Jira Sync:** Especificações técnicas e decisões pendentes postadas automaticamente no ticket do Jira (MCM-71) via CLI. O arquivo de planejamento local `implementation_plan.md` também foi gerado para análise.

---

## Pendências Próximas
- **MCM-71 — Autopilot (Fase 2):** Aguardando definições de negócio do operador no Jira/Chat (se o manager será Frontend-only ou CRON, regra de notificação de vagas, e tempo de cooldown do batch) para iniciarmos o desenvolvimento.
- **Distribuição v1.0.1:** Gerar o executável atualizado assim que testarmos tudo em produção.
- **MCM-27 — Caderno de Clientes:** Vinculação de chapas pré-aprovados aos pools (complementar à gestão do novo volume Saac).
