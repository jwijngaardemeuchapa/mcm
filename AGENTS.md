# AGENTS.md — Universal Agent Pointer

This repository uses **Lead Protocol v2.0.4** for multi-agent coordination.

If you are an AI agent of any type (Claude Code, ChatGPT, Gemini, Cursor, etc.), start here:

1. Read `.agents/CORE_RULES.md` — framework rules and boot sequence
2. Read `.agents/PROJECT_RULES.md` — project-specific rules, stack, and session protocol
3. See `.agents/AGENTS_MAP.md` — which agents operate this repo

All significant deliveries are logged in `.agents/JOURNAL.md`.
Lessons from past mistakes are in `.agents/LESSONS.md`.
Key decisions are in `.agents/decisions.jsonl`.

Your per-session state belongs in `.agents/local/<your-actor>/<your-agent>/handoff.md` (gitignored).
