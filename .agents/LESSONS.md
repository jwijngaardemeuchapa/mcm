# LESSONS.md — MCM Project Lessons
# Append-only. Never edit past entries. Tag liberally for grep.

---

## 2026-06-20 [git, workflow, commits]
**Rule:** Commitar E pushar para o GitHub imediatamente após cada implementação aprovada — sem esperar o usuário pedir. Isso inclui alterações na aplicação E atualizações do Lead Protocol (.agents/).
**Why:** Usuário trabalha em múltiplos computadores; GitHub é a única fonte de verdade. Commit local sem push não protege o trabalho. Regra anterior (push só quando solicitado) foi revogada explicitamente.
**How to apply:** `git add <arquivos> && git commit && git push origin main` logo após qualquer alteração aprovada. Sempre `git fetch origin` e checar divergência antes de começar a implementar.

---

## 2026-06-20 [firestore, phone, sql]
**Rule:** Queries SQLite que fazem LIKE em telefone precisam normalizar `(`, `)`, `+` além de `-` e espaço.
**Why:** Números importados no formato `(11) 99999-9999` falhavam silenciosamente no LIKE — BID funcionava (telefones limpos no CSV), FUP não (telefones com parênteses vindos do dashboard).
**How to apply:** Template: `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(col,'(',''),')',''),'-',''),' ',''),'+','') LIKE ?`

---

## 2026-06-20 [dispatch, umbler, bots]
**Rule:** Todo disparo de FUP para chapas deve usar `startUmblerBot`, nunca `sendUmblerFup`. `sendUmblerFup` (template) é reservado para notificações sem interação (sem-resposta, cancelamento de tarefa).
**Why:** ApproachingAlert usava template silenciosamente — chapa recebia mensagem estática, não iniciava fluxo de bot interativo.
**How to apply:** Ao adicionar qualquer novo ponto de disparo FUP, verificar que chama `startUmblerBot` com `botIdOverride` + `triggerNameOverride` e lógica D0/D1.

---

## 2026-06-17 [postgres, schema, discovery]
**Rule:** Antes de rodar qualquer query no banco de origem (Antigravity/Meu Chapa), sempre confirmar o schema. As tabelas NÃO estão em `public` — estão em `core_api`. Usar prefixo `core_api."NomeTabela"` em todas as queries.
**Why:** A primeira query com `"Profile"` sem schema retornou `ERROR: relation "Profile" does not exist`. O banco tem múltiplos schemas: `core_api`, `chapa_driver_api`, `finance_api`, `mc_ia`. `WorkHeader` existe em 3 deles.
**How to apply:** Sempre prefixar com `core_api.` ao construir queries para sync. Ex: `SELECT * FROM core_api."WorkHeader"`. Validar tabelas com `SELECT table_name FROM information_schema.tables WHERE table_schema = 'core_api'` antes de implementar qualquer comando Rust.

---

## 2026-06-17 [postgres, implementation, sequence]
**Rule:** Não iniciar implementação Rust/React do sync com banco de origem sem antes validar as 3 queries pendentes: (1) lista de tabelas em core_api, (2) valores de WorkStatus, (3) valores de Profile.
**Why:** O usuário interrompeu a implementação porque as queries ainda estavam com erros. Implementar com queries erradas gera retrabalho na camada Rust.
**How to apply:** Sequência obrigatória: validar queries no banco → confirmar mapeamento de status/perfis → só então adicionar dependências Cargo.toml e escrever comandos Rust.

---

## 2026-06-17 [jira, permissions, external-write]
**Rule:** Never close a pre-existing Jira ticket (not created in this session) without explicit user authorization.
**Why:** The auto-mode classifier blocks writes to external systems for tickets it didn't create. Silently retrying fails and wastes time. Asking the user ("posso fechar?") and waiting for "sim" is the correct path.
**How to apply:** Whenever `node scripts/jira.cjs done MCM-X` fails with a permissions/authorization error, show the command verbatim and ask "posso tentar fechar este ticket com autorização explícita?" before retrying.

---

## 2026-06-17 [umbler, api, payload]
**Rule:** Never add extra fields to Umbler Talk API payloads without explicit API error evidence they are required.
**Why:** Adding `model: 0` to a dispatch payload broke working dispatches in a previous session — field caused validation failure server-side.
**How to apply:** Trust existing payload shape in `sendUmblerFup` and `startUmblerBot`. Only add fields when an API error response explicitly names a missing field.

---

## 2026-06-17 [ux, responses, verbosity]
**Rule:** End every turn in 1–2 sentences max. Do not summarize what was just done.
**Why:** User reads diffs and terminal output directly and finds post-action summaries redundant.
**How to apply:** After tool calls, write only what changed and what's next. No bullet-point recap of completed steps.

---

## 2026-06-17 [firebase, security, keys]
**Rule:** Firebase Web SDK apiKey is public by design — safe to hardcode in desktop app. Firebase-admin service account private_key must NEVER be in the desktop app or git.
**Why:** Firebase Web SDK keys are scoped by Firestore rules + Anonymous Auth. The service account private_key was accidentally exposed in this session and had to be rotated in Firebase Console (IAM → Service Accounts).
**How to apply:** Config values in `firebase.ts` (apiKey, projectId, etc.) may be committed. Any file containing `private_key`, `client_secret`, or `JIRA_TOKEN` must be in `.gitignore`.

---

## 2026-06-17 [sqlite, migrations, backwards-compat]
**Rule:** SQLite schema changes must be additive only — ALTER TABLE ADD COLUMN in try/catch, never rename or remove.
**Why:** Installed instances run older DB versions. Any destructive migration breaks them silently on next launch.
**How to apply:** New columns → new `ALTER TABLE ADD COLUMN` in a migration block. Removing a column → mark it deprecated in a comment in `lib.rs` but leave it in the schema.

---

## 2026-06-17 [company-matching, carteira]
**Rule:** Never compare company names with raw string equality against `nome_fantasia`. Always use `companyMatches()`.
**Why:** Umbler dashboard names often differ from how they were imported (LTDA suffix, accent variations, spacing). `companyMatches()` in `src/lib/company.ts` handles all of this.
**How to apply:** Any feature that filters tasks or chapas by company must go through `companyMatches(empresa, carteira)`. When instructing users to add companies manually, tell them to use the exact name from the Meu Chapa dashboard column "Empresa".
