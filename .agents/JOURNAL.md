# JOURNAL.md — MCM Delivery Log
# Append-only. Never edit past entries. Newest entries at top.

---

## 2026-06-19 — MCM v0.9.93 — Importação direta Metabase (MCM-72)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-72 ✅
**Summary:**
- `src/lib/ingestTarefas.ts` (novo): lógica de ingestão extraída de Importar.tsx como biblioteca compartilhada; suporte a datas ISO do Metabase via `parseDateForIngest`; CPF aceita coluna "CPF do Chapa"; callback opcional `confirmDateMismatch` (só fluxo CSV)
- `src/pages/Importar.tsx`: refatorado para chamar `ingestTarefas()` — sem mudança visual
- `src/lib/settings.ts`: campo `metabaseTarefasCardId?: number` adicionado
- `src/pages/Integracoes.tsx`: novo Card "Metabase — Fonte de Tarefas" com campos URL, API key (write-only → backend Rust), ID da pergunta, botão "Sincronizar agora", timestamp última sync
- `src/pages/Dashboard.tsx`: auto-sync silencioso a cada 5 min via `setInterval`; throttle por localStorage; recarga após sync bem-sucedido
- `src/pages/MetabaseSetup.tsx`: página auxiliar mantida para listagem/amostra de Questions (agora secundária)
- Build v0.9.93 gerado: `MCM_0.9.93_x64-setup.exe`
**Files changed:** `src/lib/ingestTarefas.ts`, `src/pages/Importar.tsx`, `src/pages/MetabaseSetup.tsx`, `src/pages/Integracoes.tsx`, `src/pages/Dashboard.tsx`, `src/lib/settings.ts`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`
**Next:** Distribuir MCM_0.9.93_x64-setup.exe. Testar sync Metabase com VPN ativa.

---

## 2026-06-20 — MCM v0.9.92 — build release
**Actor:** Jeremiah | **Agent:** claude
**Tickets:** MCM-61 ✅, MCM-62 ✅, MCM-63 ✅, MCM-64 ✅
**Summary:** Build v0.9.92 com todas as features e fixes desde v0.9.91: Carteira por grupos (G1-G5, fixar empresa, CSV importa coluna automaticamente), badge "Negou FUP" + botão Sinalizar Remoção para chapas cancelados, fix crash UserX não importado, botão Ver em Confirmações Automáticas, BID webhook unificado, phone match com parênteses, BID refresh Firestore, ocupados completos, ApproachingAlert dispara bot. Protocolo de sync codificado em PROJECT_RULES §J8.
**Files changed:** `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`, `.agents/PROJECT_RULES.md`
**Next:** Distribuir MCM_0.9.92_x64-setup.exe. Pendente: validar queries PG (MCM-42), MCM-68 (Tela Foco) em progresso.

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

---

## 2026-06-19 — Bug fix: recusa via Firebase não sinalizava remoção + Jira MV2

**Actor:** Jeremiah | **Agent:** claude
**Tickets:** MCM-73, MV2-1..8
**Summary:** (1) Criado MCM-73 / MV2-8: persistir resposta_log no Firebase para confiabilidade cross-device. (2) jira.cjs expandido para suportar dois projetos (MCM + MV2) via flag --project; session-start agora exibe ambos. IDs de issue type e status mapeados por projeto. Tickets MV2-1..7 criados (épico + marcos M0–M5); MV2-2 fechado (M0 feito), MV2-3 em andamento (M1). (3) fix(detect_response): has_sim exige frase completa "sim, to nessa" para evitar falso positivo com nomes contendo "nessa" (Vanessa, Odessa). (4) fix principal: handleWebhookEvent no WatcherContext não disparava fup:remove-chapa para recusas via Firebase — o caminho do watcher de notificações Windows tinha o comportamento correto mas o Firebase não. Corrigido: recusa via Firebase agora dispara fup:remove-chapa + toast.warning em vez de toast.success.
**Files changed:** `scripts/jira.cjs`, `src-tauri/src/lib.rs`, `src/lib/WatcherContext.tsx`, `src/lib/useFirestoreQueue.ts`
**Next:** Build v0.9.94 com fixes de hoje. Validar se payload Firestore tem campo de direção (bot vs chapa) para evitar que mensagem enviada pelo bot seja processada como resposta.
