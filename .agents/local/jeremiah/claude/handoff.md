# Handoff — Jeremiah / claude

**Data:** 2026-06-19
**Versão atual:** v0.9.98 (build em andamento)
**Branch:** main (limpo, em sincronia com origin)

---

## O que foi feito nesta sessão (v0.9.98)

### Fix 1 — ingestTarefas: transação SQLite
- `src/lib/ingestTarefas.ts`: bloco DELETE+INSERT envolvido em BEGIN/COMMIT/ROLLBACK
- Eliminava flicker de chapas vazio na UI durante sync (WatcherContext lia o banco entre DELETE e INSERT)
- Também eliminava diff falso no ActivityBell ("tudo apareceu") após sync

### Fix 2 — Dashboard: skipDiffRef
- `src/pages/Dashboard.tsx`: `skipDiffRef = useRef(false)`
- Ativado em `handleSyncMetabase()` e `handleSync30h()` durante sync+load
- O bloco de diff em `load()` verifica `!skipDiffRef.current` antes de processar

### Fix 3 — Troca de Turno: filtro de carteira/grupo
- `src/components/TrocaDeTurno.tsx`: `carteiraBd` salvo em state (antes era variável local descartada)
- `generate()` filtra `allTarefas` pelo grupo selecionado antes de `buildMessage()`
- `empresasDisponiveis` (useMemo) também respeita o grupo ativo
- Popover "Empresas" mostra apenas empresas do grupo atual

---

## Sessão anterior (v0.9.97) — mantido para contexto
- ActivityBell com animação ring no BID Dashboard
- bid_interesse / bid_aceite como novos tipos de atividade
- Botão Sincronizar na Carteira
- Fix timing async logActivity + dispatchEvent

---

## Pendências próximas
- Distribuir MCM_0.9.98_x64-setup.exe após build
- MCM-27 — Pool de Chapas (planejamento feito, pendente confirmação sobre chapas sem histórico BID)
- MCM-58 — Firebase Analytics BID (aguarda validação de queries)
- MCM-68 — Tela Foco
