# Handoff — Jeremiah / claude

**Data:** 2026-06-23
**Versão atual:** v1.0.1 (build necessário após mudanças desta sessão)
**Branch:** main (limpo, em sincronia com origin)
**Último commit:** 862ede9

---

## O que foi feito nesta sessão (v1.0.1)

### Bump v1.0.0 → v1.0.1 + build
- `tauri.conf.json` versão 1.0.1; `Ajuda.tsx` badge/changelog atualizados
- Installer: `MCM_1.0.1_x64-setup.exe` (216 MB) em `src-tauri/target/release/bundle/nsis/`

### Fix BID — chapas alocados aparecendo como disponíveis (fuso noturno)
- `BIDDashboard.tsx`: `DATE(t.data_tarefa)` → `substr(t.data_tarefa, 1, 10)` para evitar conversão UTC que virava dia seguinte

### Fix BID — extras importados não aparecem com card já aberto
- `candReloadKey` state + `bid:extras-imported` CustomEvent forçam re-fetch quando card já está expandido

### Fix WatcherContext — recusa Firebase não sinalizava remoção do chapa
- `handleWebhookEvent` agora despacha `fup:remove-chapa` para recusas FUP (era só confirmação)

### Fix detect_response — falso-positivo com nomes contendo "nessa"
- Rust: matching de frase completa `"sim, to nessa"` / `"sim, estou nessa"` em vez de substring genérico

### ActivityBell — disparo automático visível no sininho
- Tipo `fup_auto` no log com ícone Zap
- `useScheduledFup` loga após disparar + toca o sininho
- Itens clicáveis no sininho → navega para Dashboard + flash no card da tarefa

### CPF formatado na cópia (TaskCard)
- `formatCpf()`: 11 dígitos → `000.000.000-00`
- Aplicada em `copyCpfConfirmados` e `copyList`

---

## Pendências próximas
- Buildar v1.0.1 e distribuir `MCM_1.0.1_x64-setup.exe`
- Limpar Firestore: `node scripts/firestore-diag.mjs --clean-errors`
- MCM-73 / MV2-8 — Firebase: persistir resposta_log para confiabilidade cross-device (ticket aberto, não implementado)
- MCM-27 — Caderno de Clientes / pool de chapas pré-aprovados
- MCM-11 — Estudo agendamento de mensagens Umbler
- MV2 — M1 data layer em andamento (MV2-3)
