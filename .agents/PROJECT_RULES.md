# PROJECT_RULES.md — MCM (FUP Manager)
# Project layer — specific to this repository.

---

## §J1 — Project Identity

**MCM** (Meu Chapa Manager) is a Windows desktop app for daily operational management of *chapa* (day-worker) allocation tasks. It replaces isolated spreadsheets with an integrated local-database dashboard covering FUP (follow-up confirmations), BID (job invites), scheduling, and Carteira (client portfolio).

- **Product owner / sole operator:** Jeremiah (wijngaardedesign@gmail.com)
- **Stack:** Tauri 2 + React 18 + TypeScript + SQLite (WAL mode)
- **Backend:** Rust in `src-tauri/src/lib.rs` — SQLite init, migrations, Tauri commands
- **Repository:** https://github.com/jwijngaardemeuchapa/mcm.git
- **Current version:** v0.9.95 (as of 2026-06-19)
- **Jira project:** MCM — wijngaardedesign.atlassian.net

---

## §J2 — Agents Operating

See `.agents/AGENTS_MAP.md`. Currently: `claude-code → claude` (Jeremiah only).

---

## §J3 — Tone and Vocabulary

- Respond in **Portuguese (PT-BR)** — user communicates exclusively in PT-BR
- Technical terms stay in English (React, SQLite, TypeScript, Firestore, etc.)
- Keep responses concise — user reads diffs and output directly; no trailing summaries
- UI text, DB columns, function names: all PT-BR

---

## §J4 — Language Rules

| Scope | Language |
|---|---|
| All UI text | PT-BR |
| Variable / function names | PT-BR |
| DB column names | PT-BR |
| `.agents/` files (this layer) | English |
| Code comments | PT-BR (only when WHY is non-obvious) |
| Git commit messages | PT-BR |

---

## §J5 — Quality Checklist (before marking any task done)

- [ ] `npm run lint` passes clean
- [ ] No new TypeScript errors introduced
- [ ] SP timezone: all business-logic dates use `nowSP()` / `todayDateISO_SP()` / `fmtSP()` — never raw `new Date()`
- [ ] New SQLite columns are **additive** (ALTER TABLE in try/catch, never rename/remove)
- [ ] New `AppSettings` fields have defaults via spread in `readSettings()`
- [ ] Company matching uses `companyMatches()` — never raw string equality against `nome_fantasia`
- [ ] Backwards compatibility: data written by older versions must load without error
- [ ] Build: `npx tauri build` before closing a version ticket

---

## §J6 — File Reference Map

| Purpose | Path |
|---|---|
| DB singleton | `src/lib/db.ts` |
| Settings persistence | `src/lib/settings.ts` |
| SP timezone helpers | `src/lib/datetime.ts` |
| Accent normalization | `src/lib/normalize.ts` |
| Company fuzzy match | `src/lib/company.ts` |
| Undo stack | `src/lib/undo.tsx` |
| Generic SELECT | `src/lib/fetchAll.ts` |
| Firebase init | `src/lib/firebase.ts` |
| Firestore queue logic | `src/lib/firestoreQueue.ts` |
| Firestore queue hook | `src/lib/useFirestoreQueue.ts` |
| Watcher context | `src/lib/WatcherContext.tsx` |
| Rust backend | `src-tauri/src/lib.rs` |
| Tauri config + version | `src-tauri/tauri.conf.json` |
| Jira script | `scripts/jira.cjs` |
| App version display | `src/pages/Ajuda.tsx` |

---

## §J7 — Authority Hierarchy

1. User instructions in this session (highest — always follow)
2. This `PROJECT_RULES.md`
3. `CORE_RULES.md`
4. Claude Code defaults

If there is a conflict, escalate to the user rather than silently picking one.

---

## §J8 — Session Protocol (MANDATORY — run at session start and end)

**Step 0 — Sync check (BEFORE any work):**
```bash
git fetch origin
git log --oneline origin/main -3
git log --oneline -3
```
If origin is ahead of local: `git pull` before touching any file. GitHub is always the source of truth — never assume local is current.

**Step 1 — Jira status:**
```bash
node scripts/jira.cjs session-start
```
This shows "In Progress" and "To Do" backlog. Present to user, ask what to work on today. Never assume. Wait for explicit confirmation before executing.

**Step 2 — During session:**
```bash
node scripts/jira.cjs start MCM-X        # when starting a ticket
node scripts/jira.cjs done MCM-X "desc"  # when closing a ticket
node scripts/jira.cjs create tarefa "T"  # new backlog item found
node scripts/jira.cjs create bug "T"     # bug found
```

**Step 3 — Closing pre-existing tickets:**
The auto-mode classifier blocks closing tickets not created in the current session. When blocked: show the command and ask the user "posso fechar este ticket?" — do NOT retry without explicit "sim".

**Step 4 — One change at a time rule:**
Never make more than one change without consulting the user. Pattern: present plan → wait for approval → execute → report → ask about next step.

**Step 5 — Git/GitHub after each change:**
```bash
git add <specific files>
git commit -m "feat: ..."
git push origin main
```
Push happens after **every commit** — not just builds. Remote is always the source of truth.

**Step 6 — Lead Protocol after each push:**
Update `.agents/JOURNAL.md` and `.agents/local/jeremiah/claude/handoff.md` immediately after every push. Never leave a session without updating these files and pushing them.

---

## §J9 — Architecture Reference

### Data Flow
```
Importar.tsx (CSV/JSON) → SQLite (tarefas, chapas, fup_log, carteira)
                        → fetchAllRows() in lib/fetchAll.ts
                        → Dashboard.tsx / pages (TanStack Query + React state)
                        → TaskCard.tsx (inline editing, status transitions)

Umbler Talk API → Vercel (webhook) → Firestore messages (status:'pending')
                                   → useFirestoreQueue (onSnapshot)
                                   → processFirestoreMessage() [match by phone suffix]
                                   → UPDATE chapas / bid_disparos in SQLite
                                   → deleteDoc + CustomEvent('fup:refresh')
```

### Async DB Pattern
```typescript
const db = await getDb();
await db.execute("INSERT INTO ...", [uuid(), ...values]);
const rows = await db.select<MyType[]>("SELECT ...", [param]);
```

### Status Lifecycles
- `status_tarefa`: Em Aberto → Aprovado → Em Análise → Aguardando Início → Em Andamento → Concluído
- `validacao_status`: aguardando → pendente → validacao_recebida
- `bid_disparos.status`: aguardando → interesse_sim/nao (etapa 1) → aceita_app/nao_aceita_app/precisa_ajuda (etapa 2)
- `chapas.status_contato`: (umbler_talk) → confirmado / cancelado

### localStorage Key Prefixes
- `fup_` — settings (readSettings/writeSettings)
- `dash_` — dashboard preferences
- `quick_links` — sidebar quick links

---

## §J10 — External Services

### Umbler Talk API
- **FUP dispatch:** `sendUmblerFup()` — POST to template-messages endpoint
- **BID dispatch:** `startUmblerBot()` — POST to chats/start-bot endpoint
- **Rule:** Never add extra fields to payload without confirming with API docs — adding `model:0` broke dispatches in a previous session

### Firebase Firestore (Web SDK — NOT firebase-admin)
- Config in `src/lib/firebase.ts` — public by design, safe to embed in installer
- `apiKey` hardcoded as fallback (security via Firestore rules, not key secrecy)
- Anonymous Auth required: `ensureAnonAuth()` before any Firestore access
- Firestore rules must require `request.auth != null` for `messages` collection
- **NEVER** use firebase-admin or service account in the desktop app

### Jira
- Project: MCM at wijngaardedesign.atlassian.net
- Script: `node scripts/jira.cjs <command>`
- JIRA_TOKEN in `.env` — never commit

### Security constraints
- `.env` is gitignored — contains JIRA_TOKEN and Supabase keys
- `ch@p@Meu` (Integrações password) acceptable hardcoded in Integracoes.tsx — not in committed config files
- Firebase private_key MUST only live in Vercel env — was accidentally exposed and rotated on 2026-06-17

---

## §J11 — DB Schema (key tables)

| Table | Key columns |
|---|---|
| `tarefas` | `id_tarefa`, `data_tarefa` (ISO -03:00), `empresa`, `status_tarefa`, `quantidade_chapas`, `is_overnight`, `validacao_status` |
| `chapas` | FK `id_tarefa`, `status_contato`, `validacao_presenca`, `canal_contato` |
| `carteira` | `nome_fantasia` UNIQUE, `cnpj` |
| `fup_log` | follow-up history per task |
| `bid_disparos` | `status`, `telefone`, `data_resposta1`, `data_resposta2` |
| `resposta_log` | `fonte` ('firestore'\|'notificacao'\|'webhook'), `raw_payload` |
| `agenda` | Kanban: `titulo`, `prazo`, `importancia`, `status` |
| `chapa_book` | Persistent worker registry |

Migrations live as inline SQL strings in `src-tauri/src/lib.rs`. New migrations = a third `migrate` call — **never rename or remove existing columns**.
