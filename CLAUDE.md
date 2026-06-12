# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 🔄 PROTOCOLO DE SESSÃO (OBRIGATÓRIO — leia sempre ao iniciar)

**A cada nova sessão, ANTES de qualquer outra coisa:**

```bash
node scripts/jira.cjs session-start
```

Isso mostra o que está "Fazendo" e o backlog "A fazer". Com base nisso:
1. Apresente ao usuário o que está em andamento e o que está pendente
2. Pergunte o que ele quer trabalhar hoje (nunca assuma)
3. Só comece a executar após confirmação explícita
4. A cada tarefa concluída, pergunte se pode avançar para a próxima

**Durante a sessão:**
- Ao iniciar uma tarefa: `node scripts/jira.cjs start MCM-X`
- Ao concluir uma tarefa: `node scripts/jira.cjs done MCM-X "descrição do que foi feito"`
- Ao encontrar algo para fazer no futuro: `node scripts/jira.cjs create tarefa "Título"`
- Ao encontrar um bug: `node scripts/jira.cjs create bug "Título"`

**Regra de ouro:** Nunca faça mais de uma alteração de cada vez sem consultar o usuário. Apresente o plano → aguarde aprovação → execute → reporte → pergunte sobre o próximo passo.

**Git/GitHub:** Após cada build de versão (`npx tauri build`), faça o commit da versão E `git push origin main` — o repositório remoto (https://github.com/jwijngaardemeuchapa/mcm.git) deve sempre refletir a última versão compilada.

---

## Project Overview

**FUP Manager** — a desktop application for operational task management and FUP (Follow-Up) tracking. Built as a Tauri 2 + React 18 + SQLite desktop app targeting Windows.

## Commands

```bash
npm run dev          # Vite dev server on port 8080 (web only, no Tauri shell)
npm run build        # Production build
npm run build:dev    # Development build
npm run lint         # ESLint
npx vitest run       # Single test run
npx vitest           # Test watch mode
npx tauri dev        # Full Tauri desktop app (requires Rust toolchain)
npx tauri build      # Build installer (NSIS for Windows)
```

## Architecture

### Desktop Runtime

The app runs as a Tauri 2 desktop app. The Rust side (`src-tauri/src/lib.rs`) initializes SQLite (WAL mode, 10s busy timeout), runs two migrations, and registers plugins: `tauri-plugin-sql`, `tauri-plugin-opener`, `tauri-plugin-log`.

All database access goes through `src/lib/db.ts`, a lazy-loaded singleton that returns a `tauri-plugin-sql` connection to `fupmanager.db`. Never use `fetch` or REST for data — everything is local SQLite. Supabase keys exist in `.env` but are not actively used; the CSP in `tauri.conf.json` whitelists Supabase in case it's wired up.

### Data Flow

```
Importar.tsx (CSV/JSON parse + upsert)
    ↓
SQLite (tarefas, chapas, fup_log, carteira, ...)
    ↓
fetchAllRows() in lib/fetchAll.ts  (generic SELECT wrapper)
    ↓
Dashboard.tsx / other pages  (TanStack Query + React state)
    ↓
TaskCard.tsx  (inline editing, status transitions, validation workflow)
```

### Key Abstractions

- **`src/lib/db.ts`** — `getDb()` singleton, `uuid()`, `placeholders(n)`, `errMsg(e)`
- **`src/lib/fetchAll.ts`** — `fetchAllRows<T>(table, selector)` generic SELECT; tables: `tarefas`, `chapas`, `fup_log`, `carteira`
- **`src/lib/settings.ts`** — `readSettings()` / `writeSettings(patch)` persisted to `localStorage` key `fup_settings`; type `AppSettings` is the source of truth for all user preferences
- **`src/lib/datetime.ts`** — All times must go through SP timezone helpers (`nowSP()`, `toSP()`, `fmtSP()`, `todayDateISO_SP()`). Never use raw `new Date()` or `Date.now()` for business logic.
- **`src/lib/normalize.ts`** — `normalize(s)` for accent-insensitive search (NFD + diacritic strip + lowercase)
- **`src/lib/company.ts`** — `companyMatches(empresa, carteira)` fuzzy matching: strips LTDA/SA/ME/EI, checks substring both directions
- **`src/lib/undo.tsx`** — Context-based undo stack (max 20), `UndoProvider` wraps the app in `App.tsx`, `useUndo()` in components

### Routing & Layout

- `App.tsx` — React Router v6 + TanStack Query client + `UndoProvider` + `TooltipProvider`; external `http/https` links open via `tauri-plugin-opener`
- `AppLayout.tsx` — Sticky header (last-import staleness indicator pulses red > 4 hours) + `AppSidebar`
- `AppSidebar.tsx` — Three nav sections (Operacional, Análise, Gestão) + quick links from localStorage

### Database Schema (key tables)

**tarefas** — core task record: `id_tarefa`, `data_tarefa` (ISO with `-03:00`), `empresa`, `status_tarefa`, `quantidade_chapas`, `is_overnight`, `validacao_status` (`aguardando` → `pendente` → `validacao_recebida`)

**chapas** — workers attached to a task: FK `id_tarefa`, `status_contato`, `validacao_presenca`, contact/removal timestamps

**carteira** — company portfolio: `nome_fantasia` UNIQUE, `cnpj`

**fup_log** — follow-up history entries per task

**agenda** — Kanban tasks: `titulo`, `prazo`, `importancia`, `status` (`a_fazer` / `em_andamento` / `concluido`)

**chapa_book** — persistent worker registry separate from per-task chapas

Migrations live in `src-tauri/src/lib.rs` as inline SQL strings. Add new migrations as a third `migrate` call.

### UI Stack

- Tailwind CSS 3.4 with CSS variable theming — color tokens defined in `src/index.css`
- All shadcn/Radix UI components live under `src/components/ui/`
- Icons: Lucide React exclusively
- Charts: Recharts
- Toasts: Sonner (`import { toast } from "sonner"`)
- Forms: React Hook Form + Zod

## Conventions

**Compatibilidade de dados (obrigatório)**: toda atualização deve ler dados gravados por versões anteriores sem quebrar nada já executado ou salvo. Na prática: novos campos de settings entram com default via spread em `readSettings()`; mudanças de schema SQLite são **aditivas** (`ALTER TABLE` em try/catch ou nova migração — nunca renomear/remover coluna); chaves novas de localStorage/sessionStorage têm fallback; chaves antigas órfãs são toleradas (nunca exigidas). Antes de cada build, revisar se algum dado da versão anterior deixaria de funcionar.

**Language**: All UI text, variable names, DB columns, and function names are in Portuguese (PT-BR).

**localStorage key prefixes**: `fup_` for settings, `dash_` for dashboard prefs, `quick_links` for sidebar.

**Status lifecycle**: `status_tarefa` goes `Em Aberto` → `Aprovado` → `Em Análise` → `Aguardando Início` → `Em Andamento` → `Concluído`. `validacao_status` goes `aguardando` → `pendente` → `validacao_recebida`. The Dashboard auto-transitions `aguardando` → `pendente` when task time is reached.

**Async DB pattern**:
```ts
const db = await getDb();
await db.execute("INSERT INTO ...", [uuid(), ...values]);
const rows = await db.select<MyType[]>("SELECT ...", [param]);
```

**Error handling**: wrap DB calls in try/catch and surface via `toast.error(errMsg(e))`.

**Notifications**: `src/lib/useNotifications.ts` auto-requests browser permission and polls every 60s; fires Tauri window alerts + `playAlertBeep()` from `src/lib/sound.ts`. Deduplication tracked in `notificacoes_enviadas` table.

## TypeScript

Strict mode is off (`strict: false` in `tsconfig.json`). Path alias `@/*` maps to `src/*`.
