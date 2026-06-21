# JOURNAL.md — MCM Delivery Log
# Append-only. Never edit past entries. Newest entries at top.

---

## 2026-06-21 — MCM — Tela de startup premium (sync + boas-vindas) + planejamento MV2
**Actor:** Jeremiah | **Agent:** claude (Opus 4.8)
**Tickets:** MV2-17 criado, MV2-18 criado, MV2-4 (comentário), MV2-6 (comentário)
**Summary:**
- **Tela de startup redesenhada (`AppStartup.tsx`):** substitui o spinner mínimo + botão "importar" por um fluxo premium em duas fases sobre fundo escuro (`hsl(225 25% 6%)`, mesma referência da IntroScreen).
  - **Fase sync:** só roda se Metabase estiver configurado (`metabase_status` + cardIds). Logo com anel SVG girando + pulso de brilho azul, lista de steps com stagger (`startup-step-in`), spinner na linha ativa, ✓ verde nos concluídos, barra de progresso com gradiente/glow, texto de status dinâmico. Sincroniza tarefas e, se devido, carteira.
  - **Fase boas-vindas:** crossfade após o sync. Ícone Sun/Sunset/Moon por hora do dia, saudação com `operadorNome`, data por extenso (fuso SP), 3 cards de métricas do dia (tarefas hoje / a contatar / confirmados) com count-up animado e `startup-metric-pop` staggerado, botão "Entrar no painel" + auto-advance de 6s.
  - **Sem Metabase configurado:** `onDone()` imediato, nenhuma tela é exibida.
  - Métricas vêm de 3 queries SQLite parametrizadas por `DATE(data_tarefa)` no fuso SP.
- **CSS (`index.css`):** 5 keyframes novos no `@layer utilities` — `startup-glow-pulse`, `startup-step-in`, `startup-metric-pop`, `startup-countdown`, `startup-spin`.
- **Planejamento MV2:** análise de quais correções da v1.0.0 viram capacidade arquitetural na MV2. Bugs pontuais (toast / timeline / BID guard) ficam fechados sem ticket. Criados como pré-requisitos do Autopilot (MV2-7): **MV2-17** (observabilidade & health da esteira Firestore — diagnóstico achou 104/104 docs em `error` silenciosos) e **MV2-18** (fila global de disparo + rate-limit Umbler "2C" — rAF foi patch de sintoma, falta a orquestração global). Comentários em MV2-4 (Foco) e MV2-6 (Desempenho) apontando a agregação diária já pronta em `AppStartup.tsx` como embrião dessas telas.
**Files changed:** `src/components/AppStartup.tsx`, `src/index.css`, `.agents/`
**Next:** Concluir build, distribuir. Avaliar MV2-16 (protótipo navegável das 3 telas-núcleo).

---

## 2026-06-21 — MCM v1.0.0 — Correções críticas Firestore + desempenho de disparos em massa
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-74 (comentário)
**Summary:**
- **Bug 3.1 — canal_contato race condition:** `_executeMassFup` gravava `canal_contato='umbler_talk'` para todas as chapas só no final do lote. Para 57 chapas isso demorava vários minutos. Chapas rápidas respondiam antes da gravação → `processFirestoreMessage` não achava match FUP → `error`. Fix: `_markCanalContato()` chamado por chapa imediatamente após cada `startUmblerBot` bem-sucedido, dentro do loop. UPDATE em massa no final removido.
- **Bug 3.2 — misses transientes viram error permanente imediatamente:** `useFirestoreQueue` chamava `updateDoc(status:'error')` em qualquer miss. Fix: misses `transient: true` agora reprocessam com backoff (10s/30s/60s/120s, até 4 tentativas) mantendo doc `pending`. Só após esgotar as tentativas (ou miss permanente) marca `error`.
- **Bug 3.3 — BID aguardando engolia confirmações FUP:** Guard do BID bloqueava o fluxo FUP inteiro quando havia qualquer `bid_disparos aguardando` do mesmo número nos últimos 7 dias. Fix: guard só bloqueia quando o payload tem campos BID (`resposta_interesse`/`resposta_aceite`); payloads FUP (`resposta_opcao`) continuam para o fluxo FUP.
- **Bug 2 — 57 setIntervals = render storm:** `ActiveDispatchesOverlay` recebia N notificações/seg (uma por tarefa ativa). Fix: `requestAnimationFrame` coalescing — só 1 `setState` por frame de animação (~16ms).
- **Bug 1 — Timeline mostra tarefas de amanhã como hoje:** Timeline plota por hora do dia, sem consciência de data. Ao sincronizar 30h, tarefas do dia seguinte apareciam sobrepostas. Fix: filtro adicional `fmtSP(t.data_tarefa, "yyyy-MM-dd") === selectedDate` no render da TaskTimeline.
- **Ferramenta de diagnóstico/limpeza Firestore:** `scripts/firestore-diag.mjs --clean-errors` apaga docs `error` históricos em lotes de 500.
- **LESSON:** miss FUP no Firestore é quase sempre transiente (race com canal_contato), não erro permanente. Marcar `error` imediatamente descarta confirmações reais.
**Files changed:** `src/lib/dispatchQueue.ts`, `src/lib/firestoreQueue.ts`, `src/lib/useFirestoreQueue.ts`, `src/components/ActiveDispatchesOverlay.tsx`, `src/pages/Dashboard.tsx`, `scripts/firestore-diag.mjs`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`, `.agents/`
**Next:** Distribuir MCM_1.0.0_x64-setup.exe.

---

## 2026-06-19 — MCM v0.9.99 — Correção crítica: regressão de ingestTarefas (pool SQLx + transação manual)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-74 (comentário)
**Summary:**
- **Root cause:** `db.execute("BEGIN")` via `@tauri-apps/plugin-sql` não funciona em pool de conexões (SQLx). BEGIN/COMMIT/ROLLBACK rodavam em conexões diferentes do pool → BEGIN ficava "órfão" com write lock aberto indefinidamente. Causava: "database is locked" (code 5), "transaction within a transaction" (code 1), e lentidão generalizada (cliques esperavam o lock, ~800 IPCs sequenciais).
- **Fix em `src/lib/ingestTarefas.ts`:** removida toda a lógica de transação manual (BEGIN/COMMIT/ROLLBACK e DELETE-tudo de chapas). Substituído por: (1) upsert em lote multi-row `INSERT OR REPLACE INTO tarefas` em chunks de 50 (~800 binds); (2) upsert em lote multi-row `INSERT OR REPLACE INTO chapas` em chunks de 80 (~960 binds); (3) delete cirúrgico só de chapas com ids que não constam mais no novo ingest — usa `chapaPrev` (já carregado) como referência. Ids de chapas são determinísticos (reusados se chapa existe) então upsert nunca esvazia a tabela.
- **LESSON aprendida:** `@tauri-apps/plugin-sql` usa pool SQLx — NUNCA usar BEGIN/COMMIT via `db.execute()`. Cada execute já é atômico. Para batches, usar multi-row VALUES. Ver M_leo.ts:236 para referência.
**Files changed:** `src/lib/ingestTarefas.ts`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`, `.agents/`
**Next:** Distribuir MCM_0.9.99_x64-setup.exe.

---

## 2026-06-19 — MCM v0.9.98 — Fixes de estabilidade pós v0.9.97
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-74 (comentário), MCM-77 (comentário)
**Summary:**
- **ingestTarefas — transação SQLite**: DELETE+INSERT de chapas agora em BEGIN/COMMIT/ROLLBACK. Elimina a janela de inconsistência onde leituras concorrentes (WatcherContext timer 60s) viam chapas zeradas entre o DELETE e o INSERT — causava flicker na UI e diff falso no ActivityBell.
- **skipDiffRef em Dashboard**: `useRef(false)` ativado em `handleSyncMetabase()` e `handleSync30h()` durante o ciclo sync+load. O algoritmo de diff em `load()` ignora quando este flag está ativo — evita "tudo apareceu/sumiu" no sino após atualização manual.
- **Troca de Turno — filtro de grupo corrigido**: `carteiraBd` salvo em state (antes era variável local descartada). `generate()` agora filtra `allTarefas` pelo grupo selecionado antes de passar para `buildMessage()`. `empresasDisponiveis` (useMemo) também respeita o grupo ativo.
**Files changed:** `src/lib/ingestTarefas.ts`, `src/pages/Dashboard.tsx`, `src/components/TrocaDeTurno.tsx`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`
**Next:** Distribuir MCM_0.9.98_x64-setup.exe. Avaliar MCM-27 (Pool de Chapas).

---

## 2026-06-19 — MCM v0.9.96 — MCM-74/75/76/77: Feed atualizações + sync amanhã + carteira + startup loading
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-74 ✅, MCM-75 ✅, MCM-76 ✅, MCM-77 ✅ | MV2-12/13/14/15 criados
**Summary:**
- **MCM-75**: removidos Respostas/Importar/Fonte de Dados do menu; botão Atualizar em BIDDashboard e DisparosUmbler dispara sync Metabase; relógio de sync dinâmico na toolbar ("atualizado há X min · próximo em Y min")
- **MCM-76**: `metabaseTarefas30hCardId` + `metabaseCarteiraCardId` em settings e Integrações (novos campos); botão "Sync amanhã" em Dashboard/BID/Disparos via `sincronizarMetabase30h()`; `metabaseSync.ts` centraliza todas as funções de sync
- **MCM-74**: migration v15 — tabela `activity_log` com índice em timestamp; `activityLog.ts` com TTL 30 dias; WatcherContext e useAutoCancelFup persistem eventos no DB; `pruneActivityLog()` no startup do WatcherProvider; `ActivityBell` na toolbar — popover com feed cronológico, badge de não-lidos, botão Limpar; painel "Confirmações Automáticas" removido
- **MCM-77**: `sincronizarCarteira()` — upsert sem DELETE (preserva entradas manuais); `devesSincronizarCarteira()` detecta se é segunda pós-último sync; `AppStartup` — overlay de loading com progresso (tarefas sempre + carteira às segundas); botão "Sincronizar agora" em Integrações com timestamp da última sync
**Files changed:** `AppSidebar.tsx`, `Dashboard.tsx`, `BIDDashboard.tsx`, `DisparosUmbler.tsx`, `Integracoes.tsx`, `settings.ts`, `metabaseSync.ts` (novo), `activityLog.ts` (novo), `WatcherContext.tsx`, `useAutoCancelFup.ts`, `ActivityBell.tsx` (novo), `AppStartup.tsx` (novo), `App.tsx`, `lib.rs` (migration v15), `tauri.conf.json`, `Ajuda.tsx`
**Next:** Build v0.9.96. Configurar IDs dos cards de 30h e Carteira em Integrações. Testar loading de startup.

---

## 2026-06-19 — MCM v0.9.95 — Auto-cancel FUP + Lista Para Remover + XLSX (MV2-9/10/11)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MV2-9 ✅, MV2-10 ✅, MV2-11 ✅
**Summary:**
- `src/lib/useAutoCancelFup.ts` (novo): hook global que a cada 30s verifica chapas com FUP disparado sem resposta. Avisa (toast.warning) 5 min antes do limiar configurável. Ao atingir o limiar: envia `cancelTemplateId` via `sendUmblerFup`, atualiza `canal_contato='umbler_cancelamento'`, insere `fup_log canal='umbler_cancelamento_auto'`. `useRef<Set>` previne double-fire.
- `src/lib/WatcherContext.tsx`: integra `useAutoCancelFup(handleRefresh)`.
- `src/lib/settings.ts`: `autoCancelFupEnabled: boolean` (default false) + `autoCancelFupMinutes: number` (default 60).
- `src/components/ApproachingAlert.tsx`: seção colapsável "Para remover (N)" em vermelho, acima das seções de tarefas. Query: `canal_contato='umbler_cancelamento'` + `status_contato NOT IN ('confirmado','removido')` + tarefa nas últimas 4h. Botão Remover por linha: `UPDATE chapas SET status_contato='removido', data_remocao=NOW`.
- `src/pages/Configuracoes.tsx`: toggle "Cancelamento automático por falta de resposta" + Select de minutos (30/45/60/90/120), visível só quando toggle ON.
- `src/pages/Dashboard.tsx`: botão "Exportar" na toolbar; Dialog com checkboxes por tarefa (Todos/Nenhum); "Exportar selecionadas (N)" gera `tarefas_YYYY-MM-DD.xlsx` via `xlsx` lib.
- Build v0.9.95 pendente.
**Files changed:** `src/lib/useAutoCancelFup.ts`, `src/lib/WatcherContext.tsx`, `src/lib/settings.ts`, `src/components/ApproachingAlert.tsx`, `src/pages/Configuracoes.tsx`, `src/pages/Dashboard.tsx`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`
**Next:** Build v0.9.95. Ativar e testar auto-cancel com threshold baixo (ex: 1 min) para validar fluxo.

---

## 2026-06-19 — MCM v0.9.94 — Fix FUP/BID Firebase
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** (bug fix — sem ticket Jira)
**Summary:**
- `firestoreQueue.ts` / `classifyResponse`: NÃO verificado ANTES do SIM — elimina falso-positivo com histórico misto; SIM exige frase completa ("sim, to nessa" | "sim, estou nessa") espelhando fix já feito no Rust no commit 0eb8540.
- `firestoreQueue.ts` / BID fallthrough: payload BID sem `resposta_interesse` retorna `handled:false` em vez de cair no fluxo FUP e atualizar chapa errado.
- `WatcherContext.tsx`: default do actionMap corrigido de "confirmado" para "recusou"; recusa via Firebase agora dispara `fup:remove-chapa` (sugestão de remoção), igual ao comportamento da notificação Windows.
- Build v0.9.94 gerado: `MCM_0.9.94_x64-setup.exe`
**Files changed:** `src/lib/firestoreQueue.ts`, `src/lib/WatcherContext.tsx`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`
**Next:** Distribuir MCM_0.9.94_x64-setup.exe. Testar fluxo FUP NÃO → badge "Negou FUP" + sugestão de remoção via Firebase.

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
