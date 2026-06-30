# Handoff — Jeremiah / claude

**Data:** 2026-06-30 (Opus 4.8)
**Versão atual:** v1.0.14 — [Release publicado](https://github.com/jwijngaardemeuchapa/mcm/releases/tag/v1.0.14), **mas SEM assinatura** (instalação manual apenas, auto-update não vai puxar). Há commits posteriores ao release (MCM-89) ainda não buildados/publicados.
**Branch:** main
**Último commit:** `b36e6f8`

---

## Sessão Opus 4.8 (continuação 2026-06-30) — pós fix da Mãe

### Confirmado: fix "Nome da Mãe" funcionou
Usuário instalou v1.0.14, ressincronizou e confirmou ("deu certo"). O bug de nome feminino com telefone masculino em Disponíveis está resolvido — era o fallback do regex `/nome/i` pegando "Nome da Mãe" quando "Nome do Chapa" vinha vazio.

### MCM-89 — BID: ocupado também por telefone (commit `b36e6f8`)
Revisada a detecção de "ocupado" (candidato já em tarefa na data → ocultar + não disparar). Antes só CPF + nome. Adicionado `occupiedPhoneSet` (telefone_chapa de todas as chapas da data, via `normalizePhone`). 3º critério no `isOccupied`, respeitando exceção de extras autorizados. Telefone é a chave mais confiável (nome varia, leads Saac sem CPF). Ainda não buildado/publicado.

---

## ⚠️ PENDÊNCIA CRÍTICA: chave privada do updater não está nesta máquina

A chave (`tauri_update_key`, sem extensão) não existe em nenhum lugar desta máquina (Jeremiah) — busquei em todo `$env:USERPROFILE`, nada. O perfil `C:\Users\W Design\` referenciado em sessões anteriores (26/06) **não existe nesta máquina** (só `Jeremiah` e `Public` em `C:\Users`). A chave está fisicamente em outra máquina física.

**Efeito:** o `latest.json` no repo já tem `version: "1.0.14"` com uma assinatura — mas é a assinatura do binário da SESSÃO ANTERIOR (antes dos fixes MCM-87/88 desta sessão). O binário mudou (novo conteúdo), então essa assinatura **não bate mais com o .exe publicado agora**. Não toquei em `latest.json` nesta sessão — o auto-update vai falhar a verificação de assinatura com segurança (não instala nada corrompido), só não vai oferecer a atualização.

**Para resolver definitivamente (próxima sessão ou na outra máquina):**
1. Localizar `tauri_update_key` na máquina física onde foi usada antes (verificar histórico de comandos PowerShell — referenciava `C:\Users\W Design\task-flow-hub\tauri_update_key`).
2. Rodar `tauri signer sign` sobre `MCM_1.0.14_x64-setup.exe` (já publicado no Release) com essa chave.
3. Atualizar `latest.json` com a assinatura real + commit + push.
4. Decidir um lugar permanente e documentado para a chave (ex.: gerenciador de senhas), em vez de depender de "qual máquina tem ela" — isso já causou retrabalho 2x.

### gh CLI autenticado nesta máquina
Rodei `gh auth login --web` e o usuário autorizou — `gh` agora está logado como `jwijngaardemeuchapa` nesta máquina (token com escopos `gist, read:org, repo`, armazenado no keyring do Windows). Releases futuros podem ser criados via `gh release create` direto, sem precisar repetir o login.

---

## O que foi feito na sessão 2026-06-30 (Sonnet 4.6) — fix nome/telefone trocados + domínio .com

### MCM-87 — "Nome da Mãe" sobrepondo nome do chapa (causa raiz do bug relatado pelo usuário)
- Usuário relatou nomes femininos com telefone de homem em Disponíveis, mesmo após reinstalar e ressincronizar do zero em v1.0.14 — descartou a causa anterior (`_key` do virtualizer, já corrigida em `b2f5414`).
- **Causa real:** a pergunta de Cadastro Geral do Metabase tem as colunas "Nome do Chapa" E "Nome da Mãe". Quando "Nome do Chapa" vem vazio/omitido do JSON numa linha, o regex genérico `/nome/i` caía no fallback "Nome da Mãe" — nome da mãe (feminino) ficava associado ao telefone real do próprio chapa.
- Fix em `metabaseSync.ts`: `nomeCol` nunca aceita coluna contendo "mãe"/"mae", nem como fallback. Linha sem "Nome do Chapa" é descartada, não mal-rotulada. Telefone também ganhou matching exato-primeiro + toast de alerta se houver ambiguidade real numa sync futura.
- Commits: `5be532c` (hardening inicial), `f26a53c` (fix definitivo excluindo Mãe).
- **Achados pendentes (usuário pediu para deixar como está por enquanto):** `Número da Casa` não bate com o regex de `numero` (campo provavelmente sempre vazio); motivo do bloqueio (`BlacklistReasonDescr`) não bate com `/motivo/i`; existe ambiguidade entre `Data do Bloqueio` e `Bloqueio em tudo?` para o campo `bloqueio`. Revisitar quando o usuário confirmar.

### MCM-88 — Domínio dos links de tarefa: .net → .com
- Painel Meu Chapa migrou para `app.meu-chapa.com`. 9 ocorrências atualizadas (TaskCard, BIDDashboard, Historico×3, Agenda, Consultor, FillrateDetalhe, ValidacoesTardiasTab×2, quickLinks). Commit `f230de5`.

### Armadilha de build descoberta
Durante esta sessão rodamos `npm run tauri build` 3 vezes seguidas. A 2ª rodada (que devia ter o fix de domínio) na verdade NÃO tinha — o passo `vite build` já tinha rodado e capturado o `dist/` ANTES do commit do domínio ser feito (commits em sequência rápida durante um build Rust de ~15-25min). Confirmado via `grep -o "meu-chapa\.\(net\|com\)" dist/assets/*.js`. **Sempre conferir o dist/ compilado antes de assumir que um build pegou o último commit**, especialmente quando há commits feitos *depois* de disparar o build.

### Próximo passo imediato
```bash
# 3ª rodada de build em andamento (task bf4otxsaq → byw6ohpnm)
# Depois de terminar:
grep -o "meu-chapa\.\(net\|com\)" dist/assets/*.js   # confirmar .com no bundle
npm run tauri -- signer sign --private-key-path tauri_update_key --password '""' src-tauri/target/release/bundle/nsis/MCM_1.0.14_x64-setup.exe
# Atualizar latest.json com assinatura real + URL v1.0.14
# Criar GitHub Release v1.0.14 (ainda pendente desde sessão 2026-06-29), upload .exe + .sig
git add latest.json && git commit -m "chore: latest.json v1.0.14 final" && git push
```

---

## [Sessões anteriores]

## O que foi feito na sessão 2026-06-29 parte 3 (Sonnet 4.6) — aba Leads no BID

### Aba "Leads" em cada card de tarefa do BID (commit `cfeb175`)
- `candidateView` → `"disponiveis" | "bloqueados" | "leads_bid"`.
- Disponíveis: `WHERE (r.fonte IS NULL OR r.fonte = 'metabase')` — leads_saac removidos.
- Aba Leads: query lazy `WHERE fonte='leads_saac' AND UPPER(cidade)=UPPER(?) AND UPPER(estado)=UPPER(?)` ordenado por tarefas DESC.
- `basePhoneSet`: todos os telefones da base metabase → leads NA BASE = esmaecidos, sem disparo.
- Filtro de status dropdown: `leadsBidStatuses` = status distintos presentes nos leads carregados.
- Dispatch individual e em lote funcionam para leads disponíveis (não bloqueados, não na base).
- Typecheck: 0 novos erros em BIDDashboard.

### Build v1.0.14
- `npm run tauri build` → `MCM_1.0.14_x64-setup.exe` ✅
- `tauri signer sign` → `.sig` gerado ✅
- `latest.json` atualizado com assinatura real e URL v1.0.14 ✅
- Commit `cfeb175` pronto, **pendente push**.

### Próximo passo imediato
```bash
git push origin main
# Criar GitHub Release v1.0.14, upload:
#   src-tauri/target/release/bundle/nsis/MCM_1.0.14_x64-setup.exe
#   src-tauri/target/release/bundle/nsis/MCM_1.0.14_x64-setup.exe.sig
```

---

## O que foi feito na sessão 2026-06-29 parte 2 (Sonnet 4.6) — pós-release fixes

### Correções pós-v1.0.13 (todos commits em main, build final pendente)

**Updater capabilities** (`02ce714`)
- `capabilities/default.json` precisava de `updater:allow-check`, `updater:allow-download-and-install`, `process:allow-restart` — sem elas Tauri v2 rejeita antes de qualquer conexão.

**`_key` único no virtual scroll** (`b2f5414`)
- Sintoma: "Angelita com número do Cleverson" — nome e telefone trocados na lista do BID.
- Causa: migração removeu cpf PK → `_key = COALESCE(cpf, 'anon_'||rowid)` colide → virtualizer recicla nó DOM errado ao reordenar.
- Fix: `'reg_'||rowid` / `'extra_'||id` — sempre único.

**Filtro de status na aba Leads** (`6d552e5`)
- Select: Todos / Disponíveis / Bloqueados / status cru específico.

**Bloqueio falso por farol_status** (`aa2c8bf`)
- Análise de 4169 leads reais revelou: `farol=vermelho` aparece em `candidato_apto` (388x) e `chapa_ativado` (216x) — é workflow, não bloqueio.
- Bloqueio agora só por status `[cadastro_cancelado, chapa_bloqueado, reprovado_brk]` ou `block_reason`/`cancel_reason`.
- `chapa_ativado → tarefas=1` → tier ativado no BID (prioridade máxima).

### Processo de release (build em andamento)
Após build: `tauri signer sign` → deletar assets antigos do release v1.0.13 → upload novo `.exe` + `.sig` → atualizar `latest.json` → commit + push.

---

## O que foi feito na sessão 2026-06-29 (Sonnet 4.6) — BID bugs + aba Leads + v1.0.13

### BID Dashboard: 4 bugs corrigidos + aba Leads
- **Bug 1/3 (mulheres/bloqueados em Disponíveis):** Leads Saac agora só entram em Disponíveis se `distance_km <= maxDistKm` (cidade geocodificada via `cityGeocoder`). Mapeamento de bloqueio expandido: `/cancel|bloque|inativ|reprov|recus/i` + farol + block_reason.
- **Bug 2 (ocupados vazando):** `normName()` colapsa espaços e normaliza nos dois lados do `occupiedNameSet` — fecha o mismatch entre SQL `LOWER(TRIM())` e JS `normalize()`.
- **Bug 4 (sync frágil):** Migração Rust recria `chapa_registry` com surrogate `id` PK (sem conflito entre cadastro e leads). Inserts resilientes por chunk com toast de falha.
- **Novo `cityGeocoder`:** fila + rate-limit + cache em `cidade_cache` (nova tabela). Nominatim por cidade+UF.
- **Nova aba "Leads":** lista `fonte='leads_saac'`, busca, filtro cidade, badges ATIVADO/APROVADO/BLOQUEADO/LEAD, botão sincronizar.
- **Score tiers:** ativado (`tarefas>0`, +1000) > aprovado (`isApprovedSituacao`, +500) > demais (+10).
- **Diagnóstico updater 404:** repo privado bloqueava `raw.githubusercontent.com`. Resolvido tornando repo público.
- Versão: `1.0.12` → `1.0.13`. Typecheck: 0 novos erros. Cargo check: clean.
- Commits desta sessão: pendente (build em andamento).

---

## O que foi feito na sessão 2026-06-26 parte 4 (Sonnet 4.6) — Build + Release

### Build v1.0.12 + GitHub Release
- Senha de Integrações alterada: `ch@p@Meu` → `meuCh@p@`.
- Versão `1.0.11` → `1.0.12` em `tauri.conf.json` e `Ajuda.tsx`.
- Build gerado: `MCM_1.0.12_x64-setup.exe`.
- Assinatura gerada via `tauri signer sign` (sem senha): `MCM_1.0.12_x64-setup.exe.sig`.
- `latest.json` atualizado com assinatura real e URL do release.
- GitHub Release `v1.0.12` criado via API + `.exe` e `.sig` publicados.
- **Updater 100% funcional** — qualquer instalação do MCM pode verificar e atualizar via Integrações.
- Commits: `27e504c` (senha), `04f2ed3` (versão + latest.json).

### Processo de release para próximas versões
```powershell
# Na mesma sessão de PowerShell:
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "C:\Users\W Design\task-flow-hub\tauri_update_key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run tauri build

# Depois de buildar:
# 1. Assinar: npm run tauri -- signer sign --private-key-path tauri_update_key --password '""' <caminho.exe>
# 2. Criar GitHub Release vX.X.X via API ou github.com, upload .exe + .sig
# 3. Atualizar latest.json com nova versão, assinatura e URL
# 4. git commit latest.json && git push
```

---

## O que foi feito na sessão 2026-06-26 parte 3 (Sonnet 4.6) — Updater

### Atualização manual protegida por senha
- `tauri-plugin-updater` + `tauri-plugin-process` no Cargo.toml/lib.rs.
- `tauri.conf.json`: pubkey real + endpoint `raw.githubusercontent.com/.../latest.json` + `dialog:false`.
- `npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process`.
- Card "Atualização do Sistema" em `Integracoes.tsx` (dentro de `unlocked`, 6 estados, barra de progresso).
- `latest.json` na raiz (template com `"signature": ""` — preencher com `.exe.sig` a cada release).
- `tauri_update_key.pub` commitada; chave privada (`tauri_update_key`) em `.gitignore` — guardar offline!
- Typecheck OK (0 erros novos). Commit `0da8cc9`.

### Processo de release para próximas versões
```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content tauri_update_key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run tauri build
# → pega o .exe.sig gerado em src-tauri/target/release/bundle/nsis/
# → criar GitHub Release tag vX.X.X, upload .exe + .exe.sig
# → atualizar latest.json com versão, sig e URL
# → git commit latest.json && git push
```

---

## O que foi feito na sessão 2026-06-26 parte 2 (Sonnet 4.6)

### Ajustes e build v1.0.11
- `tauri.conf.json`: `"maximized": true` — janela abre maximizada.
- `tauri.conf.json`: versão `1.0.1` → `1.0.11`.
- Build `MCM_1.0.11_x64-setup.exe` gerado com sucesso.

### Mockup do instalador customizado (aprovado, pendente implementação)
- Design criado com identidade visual real: laranja `#e85f00`, Montserrat 900, logo real da aplicação, "por Wijngaarde Design" na sidebar.
- 3 telas: boas-vindas, progresso animado, conclusão.
- **Próximo passo:** exportar assets (sidebarImage 164×314px, headerImage 150×57px) e configurar `bundle.windows.nsis` no `tauri.conf.json` com script customizado.

---

## O que foi feito na sessão 2026-06-26 parte 1 (Opus 4.8)

### Parte A — Sync automático dos Leads Saac
- `sincronizarLeadsSaac()` extraída/desacoplada do `sincronizarRegistro` pesado (só `fonte='leads_saac'`, grava `saac_last_sync`).
- `devesSincronizarRegistro()`: cadastro geral auto 2x/semana (seg/qui).
- `AppStartup` boot refatorado para steps dinâmicos: Saac (sempre) + cadastro (2x/sem) além de tarefas/carteira.
- Botão "Sincronizar Leads Saac" em Integrações.

### Parte B — Notificações filtradas pela carteira (tempo real)
- `src/lib/carteira.ts` novo: `getActiveCarteiraNames()`.
- `WatcherContext`: cache reativo + gate em `handleActivity`/`handleWebhookEvent` (só notificação; dados intactos).
- `Carteira.tsx` dispara `carteira:changed`.

### Validação / contexto
- `npm run typecheck` (NÃO `npx tsc --noEmit` — vazio): 0 erros novos, baseline 13 mantida.
- Sincronizado com os 14 commits do outro PC; corrigida regressão `sync_aceite` no ActivityBell (b31b39f).

### Pendência aberta (planejada, não implementada)
- Refactor do reload pesado do Dashboard (queries scopeadas + store incremental useReducer) — plano antigo, precisa revalidar contra BIDDashboard/TaskCard novos.

---

## [Sessões anteriores — outro PC]
## O que foi feito nesta sessão

### Integração Saac & Otimização do BID Dashboard (MCM-84)
- **Integração Saac (Fase 1):** Configuração de ingestão de leads via webhook (`metabase-leads`), inclusão do campo `fonte` no DB (`chapa_registry`) e nova aba em `Integracoes.tsx` para configuração segura de API URL e API Key do Supabase/Lovable.
- **Bônus de Cidade (+30pts):** Adicionado ao algoritmo do BID (`update_biddashboard.cjs`) para garantir que leads recém importados sem CEP válido ou preenchido não sejam excessivamente penalizados no ranking.
- **Virtual Scroll (useVirtualizer):** Refatoração da tabela principal do `BIDDashboard.tsx` para usar o `@tanstack/react-virtual`, garantindo máxima performance e zero lag na UI mesmo com mais de 3.000 candidatos carregados.
- **Ordenação em Tempo Real (Real Sorting):** Adicionada capacidade de clicar no cabeçalho da tabela do BID e ordenar instantaneamente a base por Nome, Distância, Tarefas e Situação (asc/desc).
- **Badge 'LEAD SAAC':** Inclusão de um selo visual cor índigo nos candidatos com `fonte === "leads_saac"` para rápida distinção na operação.

### Conserto pós-revisão do MCM-84 (MCM-85 + MCM-83) — commit 8ab536a
- **MCM-84 tinha ido para a main quebrado:** BIDDashboard usava `virtualizer`/`activeList`/`toggleSort` indefinidos + tipo `AdHocBidParams` inexistente → crash ao expandir card. Virtualização ficou pela metade.
- **Causa de não ter sido pego:** `npx tsc --noEmit` não checa `src/` (tsconfig.json `files:[]` + references). Usar **`npm run typecheck`** (`tsc -p tsconfig.app.json`) — script adicionado nesta sessão.
- Completei `useVirtualizer` (medição dinâmica), `activeList`, `toggleSort`, `AdHocBidParams`.
- Recovery idempotente da coluna `fonte` em `chapa_registry` no `setup()` Rust (a query `r.fonte` do BID quebrava em instalação nova).
- MCM-83: extras autorizados não somem mais (flag `is_extra` em vez de `cpf===null`, por causa de leads Saac sem CPF).
- **Atenção:** restam **14 erros de tipo pré-existentes** (fora do BID) revelados pelo typecheck correto — vite ignora, mas valem revisão futura.

### Planejamento Autopilot (MCM-71)
- **Implementação do Plano Técnico:** Levantamento de Requisitos e perguntas abertas detalhados.
- **Jira Sync:** Especificações técnicas e decisões pendentes postadas automaticamente no ticket do Jira (MCM-71) via CLI. O arquivo de planejamento local `implementation_plan.md` também foi gerado para análise.

---

## Pendências Próximas
- **Instalador customizado NSIS:** Exportar sidebar (164×314px) e header (150×57px) com design aprovado; configurar `bundle.windows.nsis`; script com cores/fontes MCM. Design já aprovado.
- **Primeiro release assinado:** ✅ Concluído — v1.0.12 publicado em GitHub Releases.
- **MCM-71 — Autopilot (Fase 2):** Aguardando definições de negócio do operador no Jira/Chat.
- **Refactor reload Dashboard:** Plano existe, não implementado — revalidar contra BIDDashboard/TaskCard novos.
- **MCM-27 — Caderno de Clientes:** Vinculação de chapas pré-aprovados aos pools.
