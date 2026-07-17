# Handoff — Jeremiah / claude

**Data:** 2026-07-17 (tarde, Sonnet 5 / Opus 4.8)
**Versão:** `1.0.20` — [Release publicado](https://github.com/jwijngaardemeuchapa/mcm/releases/tag/v1.0.20), assinado e verificado (latest.json + asset HTTP 200).
**Branch:** main
**Último commit:** `2e60c31` (latest.json v1.0.20).

---

## Sessão 2026-07-17 tarde — aba Novos, fix Leads Região, Leo automático + fix crítico

### O que foi entregue
1. **Fix Leads Região não excluía chapas recém-cadastrados** (`c199849`) — `novoPhoneSet` (chapas_novos, sync diário) faltava no filtro de exclusão, que só olhava `basePhoneSet` (cadastro geral, sync 2x/semana). Alguém que virou chapa ontem podia continuar aparecendo como lead "nunca cadastrado" por até ~3 dias.
2. **Nova aba "Novos" no BID** (`bfff73d`, MCM-110) — 1º passo de um pedido em 3 partes do usuário (Novos → Recomendados → disparo cruzado entre listas). ORGÂNICO/NOVO deixa de ser só um badge dentro de Disponíveis e vira categoria própria: lista `chapas_novos` por cidade, geocodificado por cidade (sem CEP nessa tabela), seleção em lote, disparo pelo mesmo bot BID de Disponíveis.
3. **Sync automática diária do Leo** (`2f2b170`, MCM-111) — `leo_cache` (respostas de BID por telefone, base dos tiers alta/média/baixa) só atualizava por clique manual. Agora sincroniza 1x/dia no boot, mesmo padrão das outras syncs.
4. **Fix crítico do parser do Leo** (`a2cf94e`) — usuário tentou configurar com a planilha real e recebeu "Coluna de número/telefone não encontrada" sempre. Causa: comparação de cabeçalho sem tirar acento (`"número".includes("numero")` é `false` em JS). Corrigido nos dois caminhos (Sheets e CSV) usando `normalize()`.
5. **Release v1.0.20** publicado e verificado.

### Análise "Recomendados" (ranking unificado) — mapeada, NÃO implementada
Usuário pediu recomendação de especialista em operações pra cruzar resposta de BID+FUP com distância, ranqueando candidatos de 4 origens diferentes (cadastro geral, Novos, Leads Saac, Leads Região) numa lista só.

**Achado importante:** BID (`leo_cache`) e FUP são assimétricos.
- **BID**: `leo_cache` já é indexado por telefone, com limiares operacionais estabelecidos (`passa_75pct`=75%, tier média=pct_sim≥0.4, tier baixa=pct_sim<0.3 com amostra≥3). Reaproveitável direto.
- **FUP**: não existe agregado persistido/indexado por telefone. O que existe (`ConfiabilidadeStats`, `src/lib/confiabilidade.ts`) mede presença/confirmação em tarefas JÁ ALOCADAS — pergunta diferente de "aceita oferta de BID". Calculado em memória (zero cache), identidade fuzzy (CPF→telefone→nome, não só telefone), janela de 15 dias.

**Recomendação registrada (não implementada):**
- **Fase 1** (mais barata, dado já pronto): ranking com tiers estendidos por origem — Ativado > Aprovado/Novos > Leads Saac > Leads Região — usando os MESMOS limiares de tier que já existem no BID hoje (`computeScore`, `leoTierFilter`). Dentro de cada tier, `leo_cache.pct_sim` desempata; sem histórico, distância desempata.
- **Fase 2** (trabalho de engenharia real, não 1 linha): extrair a lógica de `ConfiabilidadeStats` pra uma função reutilizável indexada só por telefone (hoje só roda dentro do painel de FUP do Dashboard, sem cache), pra cruzar com o ranking de BID sem misturar métricas incompatíveis.
- **Achado colateral, não corrigido:** o limiar de "não-responde" já está inconsistente em 3 lugares do código (0.2 em `computeScore`, 0.25 em `M4_classificacao.ts`, 0.3 no filtro/tier) — decisão de unificar fica pro usuário.

**Próximo passo real:** implementar a aba "Recomendados" (Fase 1) + disparo cruzado entre listas. Usuário ainda vai testar a sync do Leo com a planilha real corrigida antes.

---

## Sessões anteriores (mais antigas)

## ✅ Pendência #1 RESOLVIDA nesta sessão (2026-07-17)

Runbook executado do início ao fim nesta máquina (tem `tauri_update_key`):
1. `gh` CLI não estava instalado → instalado via `winget install --id GitHub.cli`.
2. Autenticação `gh auth login --web` falhou 3x com "token in keyring is invalid" (Windows Credential Manager corrompido por tentativas anteriores) — resolvido limpando `%APPDATA%\GitHub CLI` e reautenticando com `--insecure-storage` (grava em arquivo, não no keyring do SO).
3. `npm run tauri build` — build limpo, ~13min (vite 44s + cargo release).
4. Assinado com `tauri_update_key` → `.sig` gerado.
5. `gh release upload v1.0.17 <exe> --clobber` + upload do `.sig`.
6. **Achado:** `latest.json` ainda apontava pra `1.0.16` — nunca tinha sido atualizado quando o outro PC publicou o release v1.0.17 (o publish do release e o bump do `latest.json` são passos separados, e só o release foi feito). Corrigido: `version: "1.0.17"`, `url` apontando pro asset certo, `signature` do `.sig` gerado agora.
7. **Verificado ao vivo:** `curl -I https://raw.githubusercontent.com/jwijngaardemeuchapa/mcm/main/latest.json` → 200; asset do release → 302 (redirect normal do GitHub pra CDN, download funcional).

**Auto-update está funcional agora.** `gh` fica autenticado nesta máquina (`--insecure-storage`, token em arquivo `%APPDATA%\GitHub CLI\hosts.yml`) — releases futuros não precisam repetir o login.

### Pendência #2 — colisão de versionamento de migration entre mcm e mcm-v2 (sem correção)
`mcm` e `mcm-v2` compartilham o MESMO banco físico, mas cada repo numera suas migrations Rust independentemente. Achado real: v1 `version:15` = `activity_log` (colunas `descricao/chapa_nome/empresa/timestamp`); mcm-v2 `version:16` = `activity_log` (colunas DIFERENTES `mensagem/created_at`). Mesma tabela, schemas incompatíveis — quem rodar primeiro numa máquina "vence", o outro app fica com uma tabela que não bate com seu código. **Antes de adicionar QUALQUER migration nova em qualquer um dos dois repos, rodar `grep "version: " src-tauri/src/lib.rs` no OUTRO repo primeiro** (v1 em `version:20`, mcm-v2 em `18` na última checagem — reconferir sempre). Registrado em LESSONS.md. **Decisão pendente do usuário:** reconciliar o `activity_log` já colidido.

### Roteiro de 7 frentes — TODOS os blocos feitos (1a → 2 → 3 → 4)
- **Bloco 1a** (`a979501`): catch mudo do updater corrigido.
- **Bloco 2**: MCM-96 (endereços por tarefa, card 1420) ✅. MCM-97 (chapas 15d, card 1425) ✅. MCM-100 (leads regionais, card 983) ✅.
- **Bloco 3** (`0081529`, `0f1cdb6`, `844da4f`): badges NOVO/ORGÂNICO + aba Leads Região (MCM-97/100) · Relançamento de disparo (MCM-101) · Busca Chapa por tarefa vira por empresa/cidade (MCM-102).
- **Bloco 4** (`2bdfcee`, MCM-103): chapa confirmado há mais de `fupEsquecerConfirmacaoHoras` (padrão 6h) pra tarefa que ainda não começou volta a `pendente` automaticamente (`useForgetFupConfirmation`, molde `useScheduledFup.ts`) — entra de volta no próximo FUP em massa. `data_contato` limpo junto (evita loop); mesmo fix aplicado em `onUndoOutcome` (reabertura manual), que tinha o mesmo gap.

Todos os 8 tickets do roteiro (MCM-93/94/96/97/99/100/101/102/103) estão fechados no Jira. Tickets MV2 (MV2-1/3/5/6) já receberam comentários com tudo que mudou na v1 (16/07), pra dev da v2 não perder nada.

### Refinamento opcional registrado, não crítico
MCM-97 (chapas 15d) usa só `CreateDate`; schema real revelou sinal melhor de "orgânico" via `UserLog.LogType='Add' AND UserId=LoggedUserId`, não capturado hoje — considerar se o usuário quiser refinar a question depois.

---

## Sessão 2026-07-17 — MCM-91 fechado, MCM-98 implementado, updater resolvido

Usuário revisou as pendências antigas remanescentes e decidiu:

- **MCM-91** (dropdown Umbler preso no rótulo antigo) → **fechado sem código**. Usuário reporta que digitando o Trigger Name exatamente como configurado no Umbler, o disparo funciona normalmente — o bug do `<Select>` tecnicamente ainda existe em `Integracoes.tsx`, mas não é mais prioridade.
- **MCM-95** (spike extensão Chrome) → adiado, "retomar posteriormente". Sem mudança de status.
- **MCM-98** (remessa/indicados) → **implementado, commit `b844082`**. Em vez da integração pesada originalmente cogitada no ticket (nova coluna em `chapa_registry` + expor no matchesSearch do BID), o usuário optou por reaproveitar o mecanismo de anexo de CSV do Consultor já construído pro MCM-99 — já que `Obs` (descrição) e `Shipping` (remessa) vêm da mesma tabela `WorkHeader`, a MESMA question/CSV cobre os dois campos.
  - `src/utils/consultorFields.ts`: `F.remessa` (lê `Remessa`/`Shipping`).
  - `src/pages/Consultor.tsx`: `descMap` passou de `Map<string,string>` pra `Map<string,{descricao,remessa}>`; `classifyIndicado()` aplica a heurística já documentada no guia de schema (`Shipping` trim/upper === "INDICADO" → confirmado; contains "indicado" → possível). Busca casa contra os dois campos; popover mostra Descrição e Remessa separadas com badge/dot de indicado.
  - **Se o usuário quiser voltar a incluir `Remessa` na SQL da Query 1 (descrições)**, adicionar `wh."Shipping" AS "Remessa"` no SELECT — mesma tabela, sem JOIN extra.
- **Updater** → runbook executado, Pendência #1 resolvida (ver topo do arquivo).

Todos os itens levantados na pergunta "veja as pendências e roteiros do prompt anterior que ainda são válidas" foram endereçados nesta sessão.

---

## Roteiro de 7 frentes — ENCERRADO (detalhe do Bloco 4 abaixo, já implementado)

Usuário trouxe um guia de schema Metabase (`guia_estrutura_metabase_meuchapa.md`, fora do repo — PostgreSQL, schema `core_api`) e pediu 7 mudanças. Exploração completa feita (sync system, BID Dashboard, FUP/updater). **Depois do rebase, descobrimos que a sessão de 07-08 já criou tickets pra boa parte disso: MCM-96 (endereços), MCM-97 (chapas 15 dias), MCM-98 (remessa/indicados), MCM-95 (extensão Chrome, spike).** Ler as descrições reais desses tickets no Jira antes de codar — elas podem ter nuances mais precisas que o que segue (ex.: MCM-97 já especifica "question filtrada por Data de Criação, upsert incremental, completo 2x/semana continua fonte de verdade").

### Decisões do usuário (não reabrir)
- Ordem de execução: **Bloco 1 → 2 → 3 → 4** abaixo.
- Updater: **tornar o repo `mcm` público** (não hospedar em local alternativo) — ver Pendência #2.
- Endereços de empresa (item 2 / MCM-96): **endereços das tarefas** (via `WorkHeader`→`Address`), não o endereço cadastral único do `Business`.

### BLOCO 1 — Updater + 3 queries Metabase

**1a. FEITO** (commit `a979501`, release v1.0.17). Próximo passo real do Bloco 1: **1b/1c/1d** são queries que o usuário roda no Metabase (1b já virou MCM-99/Consultor, feito) — falta 1c (endereços) e 1d (chapas 15d), que exigem o usuário rodar as queries de descoberta de schema e colar os resultados/card IDs antes de qualquer código do Bloco 2.

**1b. Query 1 — Descrições de tarefa** (já entregue, MCM-99 já implementado no Consultor):
```sql
SELECT
  wh."ID"                                   AS "ID Tarefa",
  b."FantasyName"                           AS "Empresa",
  wh."CreateDate"                           AS "Data",
  wh."Obs"                                  AS "Descrição"
FROM core_api."WorkHeader" wh
JOIN core_api."Business" b ON b."Id" = wh."IdBusiness"
WHERE wh."Obs" IS NOT NULL
  AND TRIM(wh."Obs") <> ''
  AND wh."IdWorkStatus" NOT IN (6)
  [[AND b."FantasyName" ILIKE '%' || {{empresa}} || '%']]
  [[AND wh."CreateDate" >= {{data_inicio}}::date]]
  [[AND wh."CreateDate" < ({{data_fim}}::date + INTERVAL '1 day')]]
ORDER BY wh."CreateDate" DESC
```
Variáveis simples (Text/Date), não Field Filter — Field Filter numa variável ainda tipo Text causa `argument of AND must be type boolean`.

**1c. Query 2 — Endereços por empresa (MCM-96).** Antes de rodar, descobrir a coluna de endereço da tarefa em `WorkHeader` (guia de schema não documenta):
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'core_api' AND table_name = 'WorkHeader' ORDER BY ordinal_position
```
Procurar `IdTaskAddress`/`IdAddress`/`IdWorkAddress`. Depois:
```sql
SELECT DISTINCT
  b."FantasyName"  AS "Empresa",
  a."Zipcode"      AS "CEP",
  a."Street"       AS "Logradouro",
  a."Number"       AS "Numero",
  a."Neighborhood" AS "Bairro",
  a."City"         AS "Cidade",
  a."State"        AS "UF"
FROM core_api."WorkHeader" wh
JOIN core_api."Business" b ON b."Id" = wh."IdBusiness"
JOIN core_api."Address"  a ON a."Id" = wh."IdTaskAddress"   -- AJUSTAR conforme o resultado acima
WHERE wh."IdWorkStatus" NOT IN (6) AND a."Zipcode" IS NOT NULL
  [[AND b."FantasyName" ILIKE '%' || {{empresa}} || '%']]
ORDER BY b."FantasyName", a."City", a."Street"
```
`DISTINCT` = múltiplos endereços por empresa (cada local onde ela já teve tarefa). Fallback se a coluna não existir: `JOIN Address a ON a."Id" = b."IdAdress"` (cadastral, 1 por empresa — nota o typo real `IdAdress`).

**1d. Query 3 — Chapas cadastrados últimos 15 dias (MCM-97):**
```sql
SELECT
  u."Id" AS "id",
  LPAD(u."DocumentNumber", 11, '0') AS "CPF",
  CONCAT(u."FirstName", ' ', u."LastName") AS "Nome",
  u."Phone" AS "Telefone",
  u."CreateDate" AS "Data Cadastro",
  a."City" AS "Cidade", a."State" AS "UF"
FROM core_api."User" u
LEFT JOIN core_api."Address" a ON a."Id" = u."IdAddress"
WHERE u."CreateDate" >= (CURRENT_DATE - INTERVAL '15 days')
ORDER BY u."CreateDate" DESC
```
Checar contra a descrição real de MCM-97 no Jira ("question filtrada por Data de Criação, upsert incremental") antes de finalizar — pode já ter refinamentos que essa versão não tem.

### BLOCO 2 — 3 sincronizações (MCM-96, MCM-97 + cruzamento Saac)

Molde: `sincronizarRegistro`/`sincronizarLeadsSaac` em `src/lib/metabaseSync.ts:100-379` (ALTER idempotente → DELETE por discriminador → parse+dedup em memória → INSERT resiliente em chunks de 30 → `localStorage[..._last_sync]`).

- **Settings/UI:** novos campos `metabaseEnderecosCardId?`, `metabaseChapas15dCardId?` em `AppSettings` (`src/lib/settings.ts`); blocos de card ID em `Integracoes.tsx:1157-1205`.
- **MCM-96 (endereços):** `sincronizarEnderecos(silent)` — agrupa por `FantasyName`, monta JSON array de `ClienteAddress`, **UPSERT em `cliente_book`** casando por `nome` via `companyMatches` (`src/lib/company.ts`), merge preservando endereços manuais (dedup por CEP+logradouro+número). BID já consome `cliente_book.enderecos` (`BIDDashboard.tsx:508-537`) — zero mudança no BID. Gate **semanal**.
- **MCM-97 (chapas 15d):** nova tabela `chapas_novos` (migração aditiva em `src-tauri/src/lib.rs`, NÃO em `chapa_registry` pra não colidir com o DROP+recreate do import). `sincronizarChapas15d(silent)` — DELETE+INSERT, dedup por telefone. Gate **diária**.
- **Cruzamento Saac diário:** mudar gate de `sincronizarLeadsSaac` de "todo boot" pra diário (novo `devesSincronizarLeadsSaac`), mantendo botão manual.
- **Flags NOVO/ORGÂNICO (read-time, sem persistir):** no efeito de candidatos do BID, montar `novoPhoneSet` (de `chapas_novos`) e `leadsPhoneSet` (de `chapa_registry WHERE fonte='leads_saac'`, espelhando `basePhoneSet` já existente). NOVO = phone ∈ novoPhoneSet; ORGÂNICO = NOVO e phone ∉ leadsPhoneSet.
- Boot jobs em `src/components/AppStartup.tsx:201-205`.

### BLOCO 3 — UX do BID (itens 4, 5)

- **Badges NOVO/ORGÂNICO:** `BIDDashboard.tsx:1855-1864` (junto de EXTRA/LEAD/ASO).
- **Relançamento (item 4):** `dispatchOne` (`:888-947`) já não trava no INSERT — trava é visual (`available` esconde `disparo.status==="aguardando"`, `:994`). Adicionar coluna `diaria TEXT` em `bid_disparos` (ALTER idempotente, molde `motivo_nao` em `:2189`). Botão "Relançar" em "Respostas desta tarefa" (`:1994+`) com a `diaria` atual do card. Desbloquear Send do Matchmaker (`:1981-1984`).
- **"Busca Chapa" por tarefa (item 5):** remover botão "Extras" do topo (`:2454-2456`); botão por card (`BidTaskCard`, âncora `:1150-1162` ou `:1519`) chamando `doImport` direto com `task.id_tarefa`/`task.empresa`, sem o `<Select>` de tarefa (`:3020-3041`). Adicionar coluna `empresa TEXT` em `bid_chapas` (ALTER idempotente, hoje só tem `cidade`/`estado`, `:2182-2188`); query de extras (`:611-620`) passa a trazer `empresa` casada (`companyMatches`) OU `cidade` da tarefa.

### BLOCO 4 — Reenvio de FUP após 6h (item 6)

Travas: disparo em massa exclui `status_contato==='confirmado'` (`TaskCard.tsx:554-566`); linha confirmada não renderiza botão de envio (`:1807-1816`). `chapas.data_contato` = hora da confirmação.
- Novo settings `fupEsquecerConfirmacaoHoras` (padrão 6), espelhando `fupAutoDispatchBloqueioHoras`.
- Novo hook `useForgetFupConfirmation` (molde `src/lib/useScheduledFup.ts:102-130`): tarefas futuras/dia seguinte (via `isPrefup` de `src/lib/prefup.ts`), `now - data_contato > 6h` → auto-flip `status_contato → 'pendente'` **e limpa `data_contato`** (senão loop — `onUndoOutcome` em `:1097-1102` hoje não limpa esse campo, ajustar junto).

### Verificação por bloco
1. Bloco 1: `curl -I` no `latest.json` = 200 (só após repo público); as 3 queries rodam com filtros ok.
2. Bloco 2: toast de contagem por sync; `cliente_book` recebe endereços; `chapas_novos` populada; gates corretos.
3. Bloco 3: badges aparecem; "Relançar" gera novo `bid_disparos`; "Busca Chapa" sem pedir tarefa, chapa reaparece em outras da mesma empresa/cidade.
4. Bloco 4: confirmar chapa em tarefa de amanhã, simular 6h, verificar volta a `pendente`.
5. Todos: `npm run typecheck` (baseline 13); commit+push+JOURNAL/handoff por bloco (§J8).

---

## MCM-99 — Consultor: busca em descrições (FEITO, commit `3bf27bb`)

- `src/utils/consultorFields.ts`: `F.descricao`.
- `src/pages/Consultor.tsx`: upload separado de CSV de descrições, `descMap` (ID normalizado só-dígitos), busca dedicada varre **todo** `descMap` (task só-com-descrição vira linha mínima com ID clicável), ícone `FileText`+`Popover` com highlight.
- Decisão do usuário: dois CSVs separados (não Question unificada), ícone+popover (não coluna de texto). Query = "Query 1" do Bloco 1 acima.

---

## MCM-94 — Busca por nome/telefone por tarefa no BID (FEITO 07-08, commit `54da22b`)
Input ao lado das abas Disponíveis/Bloqueados/Leads em cada card. Nome via `normalize()`, telefone por dígitos parciais. Busca ativa força "mostrar todos" (senão match escondido pela paginação de 40). **Ainda não está no release publicado** (ver Pendência #3).

---

## MCM-93 — dialog mensagem personalizada (FEITO 07-07, commit `170d3a0`)
Bug: janela scrollava pra direita infinitamente com mensagens longas. Causa: `<Textarea>` sem `resize-none`. Fixes em `src/components/TaskCard.tsx`: `resize-none max-h-48 overflow-y-auto`; `DialogContent flex flex-col max-h-[90vh]`; header/footer `shrink-0`; atalhos viraram chips colapsáveis.

---

## Pendências mais antigas

### MCM-91 — Umbler: Select dropdown fica preso no label antigo
`src/pages/Integracoes.tsx` (~L744, L788, L868, L911) — `value` do Select deve exigir Bot ID **e** Trigger Name batendo simultaneamente:
```tsx
value={FUP_D0_BOTS.find((b) => b.botId === umblerSettings.fupBotId && b.label === umblerSettings.fupBotTriggerName)?.botId ?? ""}
```
Aguarda autorização do usuário.

### MCM-92 — Mapeamento completo de erros UTalk
Mensagens user-friendly (2 camadas) pra todos os códigos de erro da API UTalk. Aguarda revisão da doc oficial.

### MCM-95 — Spike viabilidade extensão Chrome
Aberto, não retomado — usuário interrompeu em plan mode pra priorizar Consultor/roteiro de 7 frentes.

### Chave de assinatura
`tauri_update_key` confirmada existente e funcional na máquina de 07/07 (`C:\Users\W Design\task-flow-hub\tauri_update_key`, gitignored). Não é o problema do updater — ver Pendências #1 e #2 no topo.
