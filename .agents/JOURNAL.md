# JOURNAL.md — MCM Delivery Log
# Append-only. Never edit past entries. Newest entries at top.

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
