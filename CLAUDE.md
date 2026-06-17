# CLAUDE.md — Lead Protocol Boot Pointer

This project uses **Lead Protocol v2.0.4**. Before responding to any user message or starting any task, complete the boot sequence below.

---

## Boot Sequence (mandatory)

```
1. Read .agents/CORE_RULES.md
2. Read .agents/PROJECT_RULES.md
3. Read last 10 entries of .agents/JOURNAL.md
4. Grep .agents/LESSONS.md for keywords relevant to today's work
5. Check .agents/sessions/active_sessions.md
6. Read .agents/local/jeremiah/claude/handoff.md (if it exists)
```

Only after the boot sequence: run the Jira session ritual:

```bash
node scripts/jira.cjs session-start
```

Present what's "In Progress" and "To Do" to the user. Ask what to work on today. **Never assume. Wait for explicit confirmation before executing anything.**

---

## One-rule summary

Read the `.agents/` files. Follow `PROJECT_RULES.md §J8`. Append to `JOURNAL.md` and `LESSONS.md` at session end. Update `handoff.md` before closing.
