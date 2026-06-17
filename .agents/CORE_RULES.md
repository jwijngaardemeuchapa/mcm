# CORE_RULES.md — Lead Protocol v2.0.4
# Framework layer — applies to ALL projects. Do not edit per-project.

## Boot Sequence (mandatory — run every session, in order)

1. Read `.agents/CORE_RULES.md` (this file)
2. Read `.agents/PROJECT_RULES.md`
3. Read the last 10 entries of `.agents/JOURNAL.md`
4. Grep `.agents/LESSONS.md` for keywords relevant to today's work
5. Check `.agents/sessions/active_sessions.md` for concurrent sessions
6. If `.agents/local/<actor>/<agent>/handoff.md` exists, read it before anything else

Only after completing the boot sequence should you respond to the user or begin work.

## Three-Layer State Model

| Layer | Scope | Owned Files |
|---|---|---|
| Framework | All projects | `CORE_RULES.md` |
| Project | This repository | `PROJECT_RULES.md`, `JOURNAL.md`, `LESSONS.md`, `decisions.jsonl`, `AGENTS_MAP.md` |
| Actor × Agent | One operator + one LLM pair | `local/<actor>/<agent>/handoff.md` |

**Framework files** are copied from the Lead Protocol repo and updated only when the protocol itself is versioned up.

**Project files** are shared across all agents working this repo. They are the source of truth for what has been done, what was decided, and what to do next.

**Local files** are volatile per-pair state: what *this* agent in *this* session knows, left or right. They are gitignored.

## Essential Contracts

1. **JOURNAL and LESSONS are append-only.** Never edit or delete past entries.
2. **Update `handoff.md` at session end** with: what was completed, what is still open, any blockers, and the explicit next step.
3. **Log decisions.** Any architectural or irreversible decision → append one JSON object to `decisions.jsonl`.
4. **No silent drops.** If you can't complete a task, write what was tried and why it failed into `handoff.md`.
5. **Active sessions.** Update `sessions/active_sessions.md` on start (add row) and on end (update status).
6. **Handoff before handoff.** If you detect another agent is active (from `active_sessions.md`), do not overwrite shared state without coordination.

## Decision Log Format (`decisions.jsonl`)

One JSON object per line:
```json
{"date":"YYYY-MM-DD","actor":"<name>","agent":"claude","title":"Short decision title","rationale":"Why","alternatives":"What was rejected and why","files_affected":["path/to/file"]}
```

## Journal Entry Format (`JOURNAL.md`)

```markdown
## YYYY-MM-DD — <Delivery title>
**Actor:** <name> | **Agent:** claude
**Tickets:** MCM-XX, MCM-YY
**Summary:** What was delivered and why it matters.
**Files changed:** `path/to/file`, ...
**Next:** What comes immediately after this.
```

## Lesson Entry Format (`LESSONS.md`)

```markdown
## <YYYY-MM-DD> [<tag1>, <tag2>]
**Rule:** One-line imperative rule.
**Why:** The incident or constraint that motivated it.
**How to apply:** When/where this kicks in.
```
