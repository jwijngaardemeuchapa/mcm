# JOURNAL.md — MCM Delivery Log
# Append-only. Never edit past entries. Newest entries at top.

---

## 2026-06-20 — MCM-64: Carteira multi-seleção de grupos + build
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-64 ✅
**Summary:**
- **Migration v14:** `ALTER TABLE empresa_config ADD COLUMN fixar_visivel INTEGER DEFAULT 0`
- **settings.ts:** novo campo `carteiraGruposAtivos: string[]` ([] = todos ativos, backwards compat)
- **Carteira.tsx:** seção de chips G1-G5 no topo (toggleáveis, salvos em settings); ícone contextual por empresa: Eye/EyeOff (grupo ativo), PinOff/Pin (grupo inativo = fixar empresa avulsa)
- **Dashboard.tsx + BIDDashboard.tsx:** query carteira atualizada com LEFT JOIN empresa_config; filtro grupo + fixar_visivel em TS; BIDDashboard agora também respeita oculta_dashboard
- **Lógica:** gruposAtivos=[] → sem filtro (todos visíveis); gruposAtivos=[G1,G2] → só G1+G2 aparecem; fixar_visivel=1 → empresa sempre aparece mesmo com grupo inativo
- **Build:** v0.9.91 buildado (MCM-64 incluso)
**Files changed:** `src-tauri/src/lib.rs`, `src/lib/settings.ts`, `src/pages/Carteira.tsx`, `src/pages/Dashboard.tsx`, `src/pages/BIDDashboard.tsx`
**Next:** Distribuir instalador. MCM-58 aguarda validação de queries PG.

---

## 2026-06-20 — Bug fixes Firebase + ApproachingAlert bot + Jira + planejamento Carteira
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-61 ✅, MCM-62 ✅, MCM-63 ✅, MCM-64 (backlog)
**Summary:**
- **MCM-61 (fix):** Queries SQL em `firestoreQueue.ts` não normalizavam `(` e `)` no telefone — números `(11) 99999-9999` falhavam no LIKE. REPLACE chain estendido para remover `(`, `)`, `+` nas 3 queries (BID etapa 3, BID etapas 1/2, FUP). Também adicionado `precisa_ajuda → "recusou"` no actionMap do WatcherContext.
- **MCM-62 (fix):** BIDDashboard não escutava `fup:refresh` após resposta Firestore — adicionado `useEffect` com listener → `loadAll()`.
- **MCM-63 (fix):** `byName` query em BIDDashboard tinha `AND c.cpf IS NULL` causando blind spot; removido. Adicionado estado `allOccupiedChapas` + query completa + UI no "Ver ocupados" com nome + empresa.
- **ApproachingAlert (fix):** `fireUmblerFup()` usava `sendUmblerFup` (template) em vez de `startUmblerBot` (bot). Corrigido com lógica D0/D1 igual ao dispatchQueue.
- **MCM-64 (planejamento):** Carteira — múltipla seleção de grupos + empresas avulsas + ocultar/mostrar. Arquitetura: campo `selecionada` na tabela + `grupos_ativos` em settings. Ainda não implementado.
- **Git:** confirmado que o outro computador tinha mudanças locais não commitadas. Regra criada: sempre commitar ao término de cada implementação aprovada.
- **Build:** v0.9.91 compilado e testado. Pushs feitos para `jwijngaardemeuchapa/mcm.git`.
**Files changed:** `src/lib/firestoreQueue.ts`, `src/lib/WatcherContext.tsx`, `src/pages/BIDDashboard.tsx`, `src/components/ApproachingAlert.tsx`
**Next:** Novo build v0.9.91 com todos os fixes (push feito). Implementar MCM-64 (Carteira multi-seleção). Validar queries PG antes de iniciar sync (MCM-58 em andamento).

---

## 2026-06-17 — Planejamento migração banco + arquitetura sync direto PG
**Actor:** Jeremiah | **Agent:** claude
**Tickets:** (planejamento — sem ticket Jira)
**Summary:** Levantamento completo do banco de dados de origem (PostgreSQL — plataforma Antigravity/Meu Chapa). Criado `docs/planejamento_migracao_banco.md` com: schema completo das 25 tabelas SQLite locais, prioridades de migração P0-P3, arquitetura de sync direto (Rust command + Windows Credential Manager + throttle 3min/2x semana), mapeamento campo a campo WorkHeader→tarefas / WorkItem→chapas / User→chapa_registry / User→bid_chapas, confirmação de status e perfis de usuário. Descoberto que as tabelas do banco de origem estão no schema `core_api` (não `public`). Queries da seção 7 precisam ser validadas com o schema correto antes de implementar — **implementação NÃO iniciada**, aguardando validação das queries no banco.
**Files changed:** `docs/planejamento_migracao_banco.md`
**Next:** Usuário precisa rodar as 3 queries de validação (WorkStatus, Profile, tabelas em core_api) e colar resultados. Após confirmação, implementar: `keyring` + `tokio-postgres` no Cargo.toml, comandos Rust de sync, seção de DB credentials em Integrações, throttle no botão Atualizar.

---

## 2026-06-17 — Lead Protocol v2.0.4 scaffold installed
**Actor:** Jeremiah | **Agent:** claude
**Tickets:** (infra — no Jira ticket)
**Summary:** Installed Lead Protocol framework in MCM project. Created `.agents/` directory with CORE_RULES.md, PROJECT_RULES.md, AGENTS_MAP.md, JOURNAL.md, LESSONS.md, decisions.jsonl, sessions/active_sessions.md, and local/jeremiah/claude/handoff.md. Migrated all existing CLAUDE.md content and memory files (user_profile.md, project_mcm.md, feedback_session.md) into the protocol structure. Updated CLAUDE.md to be the Lead Protocol boot pointer while preserving the Jira session-start ritual.
**Files changed:** `.agents/*`, `CLAUDE.md`, `AGENTS.md`, `.gitignore`
**Next:** Commit framework files to git. Continue with any pending Jira tickets.

---

## 2026-06-17 — MCM v0.9.91 — FUP Dashboard, Carteira manual, version bump
**Actor:** Jeremiah | **Agent:** claude
**Tickets:** MCM-53, MCM-54, MCM-55, MCM-56
**Summary:** Four FUP Dashboard improvements: timeline auto-scrolls to "now" on open (MCM-53); task cards minimum 80px wide so confirmados count never clips (MCM-54); "Prioridades de Ação" panel starts collapsed (MCM-55); "Confirmações Automáticas" panel starts collapsed (MCM-56). Added Carteira manual company entry with instruction to match exact name from Meu Chapa dashboard. Bumped version to v0.9.91 in tauri.conf.json and Ajuda.tsx. Tauri build started.
**Files changed:** `src/components/TaskTimeline.tsx`, `src/components/PriorityPanel.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Carteira.tsx`, `src/pages/Ajuda.tsx`, `src-tauri/tauri.conf.json`
**Next:** Distribute v0.9.91 installer.

---

## 2026-06-17 — Firebase Firestore queue replaces axum webhook server
**Actor:** Jeremiah | **Agent:** claude
**Tickets:** MCM-5 (closed)
**Summary:** Replaced non-functional axum HTTP webhook server (port 9988) with Firebase Firestore real-time queue. Vercel receives Umbler webhooks and writes to `messages` collection; desktop app listens via onSnapshot. Phone-based correlation (last 11 digits) replaces bot_id filter. Implemented: firebase.ts (Web SDK singleton + anon auth), firestoreQueue.ts (classifyResponse, processFirestoreMessage with FUP and BID 2-step flow), useFirestoreQueue.ts (onSnapshot hook). Also updated Integracoes.tsx: dispatch+listen test dialog using startUmblerBot with Firestore listener. `.env` added to `.gitignore` (contains JIRA_TOKEN and Supabase keys).
**Files changed:** `src/lib/firebase.ts` (new), `src/lib/firestoreQueue.ts` (new), `src/lib/useFirestoreQueue.ts` (new), `src/pages/Integracoes.tsx`, `src/lib/settings.ts`, `src/lib/WatcherContext.tsx`, `.gitignore`
**Next:** Enable Firebase Anonymous Auth in Firebase Console. Set Firestore rules to `request.auth != null`. Toggle "Recebimento de Respostas (Firebase)" in Integracoes. Test end-to-end with real Umbler dispatch.
