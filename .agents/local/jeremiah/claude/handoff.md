# Handoff — Jeremiah / claude

**Data:** 2026-06-21
**Versão atual:** v1.0.0 (build pendente de distribuição)
**Branch:** main (limpo, em sincronia com origin)

---

## O que foi feito nesta sessão (v1.0.0)

### Fixes críticos de Firestore — confirmações automáticas perdidas

**Problema raiz:** ~100% das mensagens Firestore viravam `error`. Diagnóstico com `scripts/firestore-diag.mjs` revelou 104/104 docs em `error`. Três bugs independentes causavam isso.

**Bug 3.1 — `dispatchQueue.ts` — race condition canal_contato:**
- `_executeMassFup` gravava `canal_contato='umbler_talk'` para todas as chapas só no final do lote.
- Com 57 chapas, chapas rápidas respondiam antes da gravação → sem match FUP → `error`.
- Fix: `_markCanalContato(chapa.id)` chamado por chapa dentro do loop, imediatamente após `startUmblerBot`.

**Bug 3.2 — `useFirestoreQueue.ts` — miss transiente vira error permanente:**
- Qualquer miss → `updateDoc(status:'error')` imediato.
- Fix: misses `transient: true` reprocessam com backoff (10s/30s/60s/120s, até 4×). Doc segue `pending`. Só marca `error` após esgotar tentativas.

**Bug 3.3 — `firestoreQueue.ts` — guard BID engolia FUP:**
- Qualquer `bid_disparos aguardando` do mesmo número nos últimos 7 dias bloqueava o fluxo FUP inteiro.
- Fix: guard só bloqueia quando payload tem `resposta_interesse`/`resposta_aceite`. Payload FUP (`resposta_opcao`) cai no fluxo FUP normalmente.

### Fix de performance — render storm com 57 disparos

**Bug 2 — `ActiveDispatchesOverlay.tsx`:**
- 57 intervalos × 1 notificação/seg = 57 re-renders/seg → lentidão visível em toda a UI.
- Fix: `requestAnimationFrame` coalescing — só 1 `refresh()` por frame (~16ms).

### Fix de UI — Timeline mostra tarefas de amanhã como hoje

**Bug 1 — `Dashboard.tsx`:**
- Timeline plota por hora sem consciência de data. Sync 30h trazia tarefas do dia seguinte sobrepostas.
- Fix: filtro `fmtSP(t.data_tarefa, "yyyy-MM-dd") === selectedDate` no render da TaskTimeline.

### Ferramenta de manutenção
- `scripts/firestore-diag.mjs --clean-errors`: apaga docs `error` históricos em lotes de 500.
- Os 104 docs `error` existentes NÃO foram resetados (histórico). Rodar manualmente quando conveniente.

---

## Pendências próximas
- Distribuir `MCM_1.0.0_x64-setup.exe` após build
- Limpar Firestore: `node scripts/firestore-diag.mjs --clean-errors`
- MCM-27 — Caderno de Clientes / pool de chapas pré-aprovados
- MCM-11 — Estudo agendamento de mensagens Umbler
- 2C (global dispatch queue) — rate limit Umbler entre tarefas (adiado; rAF resolveu sintoma)
