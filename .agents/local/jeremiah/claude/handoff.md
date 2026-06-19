# Handoff — Jeremiah / claude

**Data:** 2026-06-19
**Versão atual:** v0.9.97 (build pendente)
**Branch:** main (limpo, em sincronia com origin)

---

## O que foi feito nesta sessão (v0.9.97)

### Fixes v0.9.96 (pós-build)
- Inputs 30h/carteira em Integracoes agora usam useState controlado — corrige campos bloqueados
- AppStartup verifica metabase_status antes de mostrar loading — não roda se Metabase não configurado
- Dialog XLSX overflow-hidden + min-w-0 — itens não escapam horizontalmente
- RefreshDiff (slide da direita) não abre automaticamente — chapas descobertos vão pro sino
- Toast de confirmacao FUP removido — substituido pelo sino
- Botao Atualizar no FUP Dashboard agora sincroniza Metabase antes de recarregar
- Botao Atualizar no Disparos Umbler despacha fup:refresh

### Novas features v0.9.97
- ActivityBell com animacao de ring (0.7s, 4 oscilacoes + escala 1.18x) ao detectar novidades
- BID Dashboard: ActivityBell na toolbar + snapshot comparison de bid_disparos
  - prevDisparosRef rastreia status anterior de cada disparo
  - Detecta aguardando→interesse_sim (bid_interesse) e qualquer→aceita_app (bid_aceite)
  - Primeiro load inicializa ref sem logar (sem flood no startup)
- Novos tipos em activityLog.ts: bid_interesse, bid_aceite
- Botao "Sincronizar" na pagina Carteira (chama sincronizarCarteira + reload + timestamp)
- Fix critico de timing: await Promise.all(logActivity...) antes de dispatchEvent activity:new-diff

### Bugs identificados e corrigidos na revisao
- Dynamic import().then() dentro de forEach nao era await — event disparava antes das escritas SQLite
- Import morto de WatcherActivity em Dashboard.tsx removido

---

## Pendencias proximas
- MCM-27 — Pool de Chapas (planejamento feito, pendente confirmacao sobre chapas sem historico)
- MCM-58 — Firebase Analytics BID (aguarda validacao de queries)
- MCM-68 — Tela Foco
- Distribuir MCM_0.9.97_x64-setup.exe apos build
