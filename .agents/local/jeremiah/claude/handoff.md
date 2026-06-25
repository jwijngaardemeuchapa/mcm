# Handoff — Jeremiah / claude

**Data:** 2026-06-24
**Versão atual:** v1.0.1 (build pendente — nova abordagem a definir)
**Branch:** main (limpo, em sincronia com origin)
**Último commit:** c544bd3

---

## O que foi feito nesta sessão

### umblerReady — templateId removido do pré-requisito (commit c544bd3 / MCM-82)
- `umblerReady` agora requer só `bearerToken + fromPhone + organizationId`
- Instalações novas com `templateId` vazio agora veem os botões Umbler normalmente

### BIDDashboard — extras truncados e Usuários Excluídos (commit 54edc64 / MCM-81)
- Split UNION ALL → duas queries paralelas: extras sem LIMIT, registry com LIMIT 600
- Extras sempre no topo do array combinado (`[...extras, ...registry]`)
- Filtro `NOT LIKE '%EXCLU%'` sobre situação+nome em disponíveis e bloqueados
- Parser defensivo no XLSX: pula "usuario excluido" e avisa via toast

### Sininho — disparo automático FUP (commits 862ede9)
- Tipo `fup_auto` no activity_log com ícone Zap
- `useScheduledFup` loga após disparar + toca o sininho
- Itens com `id_tarefa` clicáveis → navega para Dashboard + flash no card da tarefa
- CPF formatado `000.000.000-00` nas funções `copyCpfConfirmados` e `copyList` do TaskCard

### Sync cadastro geral de chapas via Metabase (commit d01dea8)
- `settings.ts`: `metabaseRegistroCardId: 1296` em `SETTING_DEFAULTS` — pré-preenchido em qualquer máquina nova
- `metabaseSync.ts`: `sincronizarRegistro()` — DELETE + INSERT em chunks, mapeamento por regex
- `Integracoes.tsx`: campo "Cadastro Geral de Chapas" com botão + timestamp da última sync

---

## Pendências próximas
- Distribuir `MCM_1.0.1_x64-setup.exe` (build desta sessão)
- Limpar Firestore: `node scripts/firestore-diag.mjs --clean-errors`
- MCM-73 / MV2-8 — Firebase: persistir resposta_log para confiabilidade cross-device
- MCM-27 — Caderno de Clientes / pool de chapas pré-aprovados
- MCM-11 — Estudo agendamento de mensagens Umbler
- MV2 — M1 data layer em andamento (MV2-3)
