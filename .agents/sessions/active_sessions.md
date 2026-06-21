# active_sessions.md — Concurrent Session Awareness
# Update on session start (add row) and session end (set status → completed).

| Session ID | Actor | Agent | Started | Status | Focus |
|---|---|---|---|---|---|
| 09c351a9 | jeremiah | claude | 2026-06-17 | completed | Firebase migration + MCM-53/54/55/56 + Carteira + v0.9.91 + Lead Protocol install |
| 6203ccf2 | jeremiah | claude | 2026-06-14 | completed | Planejamento migração banco PG→SQLite. Próximo: validar queries core_api e implementar sync |
| 2026-06-20-a | jeremiah | claude | 2026-06-20 | completed | MCM-61/62/63 bug fixes Firebase + ApproachingAlert bot + planejamento MCM-64 Carteira |
| 2026-06-20-b | jeremiah | claude | 2026-06-20 | completed | MCM-64 Carteira multi-seleção grupos + build |
| 2026-06-20-c | jeremiah | claude | 2026-06-20 | completed | Sync entre máquinas, levantamento estado atual, handoff atualizado |
| 2026-06-21-a | jeremiah | claude | 2026-06-21 | completed | Fixes críticos Firestore (canal_contato race, retry transiente, BID guard) + rAF coalescing + Timeline date filter + v1.0.0 |
| 2026-06-21-b | jeremiah | claude | 2026-06-21 | completed | Tela startup premium (sync + boas-vindas + métricas) + scroll mouse Select (Radix fix) + planejamento MV2 (MV2-17/18 criados) |

## Notes

- Only one actor (Jeremiah) currently operates MCM — concurrency conflicts are unlikely.
- If a second agent is ever onboarded, both agents must read this table at boot and check for active overlapping sessions before writing to shared project files.
