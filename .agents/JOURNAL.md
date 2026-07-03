# JOURNAL.md — MCM Delivery Log
# Append-only. Never edit past entries. Newest entries at top.

---

## 2026-07-03 — MCM→MV2 — v1 formalizada como escopo técnico da MV2 (trabalho no repo mcm-v2)
**Actor:** Jeremiah | **Agent:** claude (Fable 5)
**Commits:** nenhum código no mcm; entregas no repo mcm-v2 (`6c17870`, `68c979a`, `5bbf1a2`)

Decisão do usuário: o backend da v1 (v1.0.15, funcional) é o escopo técnico da reconstrução MV2 — mesmas funcionalidades/integrações, UI e execução novas, SEM repetir o caminho das pedras. Entregas (detalhes no JOURNAL do mcm-v2): `docs/escopo_tecnico_v1.md` no repo mcm-v2 (inventário do motor, schema v1–v15, contratos das 4 integrações, 21 armadilhas de LESSONS/JOURNAL deste repo) + spec técnica em comentário nos **17 tickets MV2** do Jira (épico, marcos M0.5–M5 e features). Specs antigas (era v0.9.96) atualizadas para v1.0.15. Este repo (mcm) não foi alterado.

---

## 2026-07-03 — MCM — Investigação: "Umbler bot 404" ao reaproveitar bot de ex-funcionária (MCM-91)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 5)
**Tickets:** MCM-91 (aberto, backlog — fix de código não implementado nesta sessão)
**Commits:** nenhum (sessão só de investigação/documentação; código não foi alterado)

### Incidente relatado
Analista novo sem bot próprio no Umbler Talk. Usuário reaproveitou o bot da "Emanuelle" (ex-funcionária): renomeou o bot **e** o gatilho (Automação) corretamente no painel do Umbler. No MCM (Integrações), selecionou a entrada "FUP_EMANUELLE | D0" na lista fixa de bots e editou manualmente só o campo **Trigger Name** (manteve o **Bot ID** original). Disparo passou a falhar: `Falha no envio — Umbler bot 404: type tools.ietf.org...` (corpo RFC 7807 "Problem Details").

### Resolução operacional (sem deploy)
Usuário identificou que era **divergência de texto** no Trigger Name — corrigiu digitando o nome exatamente como configurado no Umbler, disparo voltou a funcionar. Incidente do dia resolvido sem alteração de código.

### Causa raiz de código encontrada durante a investigação (NÃO corrigida — ver MCM-91)
Em `src/pages/Integracoes.tsx`, os 4 blocos de configuração de bot (FUP D0 ~L744, FUP D1 ~L788, BID D0 ~L868, BID D1 ~L911) têm um `<Select>` de atalho cujo `value` é calculado **só a partir do Bot ID**:
```tsx
value={FUP_D0_BOTS.find((b) => b.botId === umblerSettings.fupBotId)?.botId ?? ""}
```
Ao lado, **Trigger Name** e **Bot ID** são dois `<Input>` de texto livre, editáveis independentemente do Select. Quando o usuário edita só o Trigger Name (mantendo o Bot ID de um preset), o `<Select>` continua mostrando o rótulo antigo do preset como "selecionado" — mesmo o Trigger Name já divergindo logo abaixo. Essa divergência visual é enganosa: convida o usuário a reabrir o dropdown "pra conferir" e, se clicar em qualquer item, `onValueChange` dispara de novo e **sobrescreve o Trigger Name editado manualmente**, revertendo pro rótulo antigo — reproduzindo o mesmo 404 depois de já corrigido manualmente. É exatamente o mecanismo que o usuário suspeitou ("o dropdown não lida bem com selecionar um e editar o nome no campo editável").

### Fix proposto (aguardando aprovação/implementação futura)
Fazer o `value` do `<Select>` exigir Bot ID **e** Trigger Name batendo simultaneamente com uma entrada da lista:
```tsx
value={FUP_D0_BOTS.find((b) => b.botId === umblerSettings.fupBotId && b.label === umblerSettings.fupBotTriggerName)?.botId ?? ""}
```
Assim, ao editar qualquer um dos dois campos manualmente, o dropdown volta pro placeholder "Selecionar da lista…" em vez de ficar preso num rótulo desatualizado — elimina o incentivo de reabrir o dropdown e o risco de sobrescrita acidental. Mesma mudança nos 4 blocos.

**Bônus de baixo custo (não implementado):** adicionar entrada `/404/` em `UMBLER_ERROS` (`src/lib/umbler.ts:4`) — hoje 404 cai no fallback genérico que mostra o corpo RFC 7807 cru e ilegível.

### Por que não foi implementado nesta sessão
Usuário rejeitou o plano de implementação duas vezes (`ExitPlanMode`) — a leitura mais provável é que, com o incidente já resolvido manualmente, não havia urgência para o deploy do fix de código na hora. Ticket MCM-91 registrado em backlog com o diagnóstico completo para retomar quando o usuário decidir.

**Files changed:** nenhum.
**Next:** implementar o fix do `<Select>` (4 linhas em `Integracoes.tsx`) + entrada 404 em `umbler.ts` quando o usuário autorizar; build + release.

---

## 2026-06-30 — MCM — Aba Leads: cidade/UF com comparação exata escondia leads Saac (MCM-90)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 5)
**Tickets:** MCM-90
**Commits:** `44f5693`

### Problema relatado
Usuário: leads do Saac não aparecem na aba "Leads" do BID mesmo sendo da mesma cidade da tarefa.

### Diagnóstico
A query filtrava `fonte = 'leads_saac'` com `UPPER(r.cidade) = UPPER(?) AND UPPER(r.estado) = UPPER(?)` — comparação exata em SQL, mesmo padrão usado na query de "Disponíveis" (que funciona porque ambos os lados vêm do Metabase, com formato consistente). Para leads Saac, a origem é uma API externa (Lovable/Supabase) sem garantia de formato:
1. **Acentos:** SQLite `UPPER()` não normaliza diacríticos — `Ã` continua `Ã`. Se a tarefa tem "São Paulo" (Metabase) e o lead tem "Sao Paulo" (Saac sem acento, ou vice-versa), nunca batem apesar de ser a mesma cidade.
2. **UF:** tarefas trazem sigla de 2 letras ("SP", vindo do campo `Cidade/UF` do Metabase). A API Saac pode devolver o nome completo do estado ("São Paulo") em vez da sigla — comparação de string falha.

### Fix (`BIDDashboard.tsx`)
- Query da aba Leads não filtra mais cidade/UF em SQL — traz todos os `fonte='leads_saac'` (dataset pequeno, ~4mil linhas no total da base, perfeitamente ok carregar inteiro no cliente, mesmo padrão já usado para `rawCandidates`).
- Filtro migrado para o cliente: `normalize(r.cidade) === normalize(cityUf.cidade)` (usa o helper `normalize()` já existente no app, que despe acentos e normaliza caixa — mesmo usado para matching de nomes).
- Novo helper `normalizeUf()`: se a string já tem 2 letras, usa como sigla; senão, consulta um mapa estático das 27 UFs (nome completo, sem acento → sigla) e converte antes de comparar.

### Validação
Typecheck baseline 13 (sem novos). ESLint: mesmo erro pré-existente já documentado (linha deslocada, fora do escopo desta mudança).

**Files changed:** `src/pages/BIDDashboard.tsx`
**Next:** build v1.0.16 (ou incluir nesta mesma leva se ainda não buildado) e assinar quando a chave do updater estiver disponível.

---

## 2026-06-30 — MCM — BID: ocupado também por telefone (MCM-89)
**Actor:** Jeremiah | **Agent:** claude (Opus 4.8)
**Tickets:** MCM-89
**Commits:** `b36e6f8`

### Contexto
Após confirmar que o fix da "Nome da Mãe" funcionou (usuário: "deu certo"), revisamos a lógica de detecção de "ocupado" no BID (candidato já alocado em alguma tarefa na mesma data → deve ser ocultado e não disparado).

### Problema
A detecção usava só CPF + nome (`occupiedCpfSet`, `occupiedNameSet`, ambos incluindo a própria tarefa). Ambos frágeis: nome varia em grafia (e o cadastro às vezes traz nome trocado, ver fix da Mãe); leads Saac não têm CPF. Resultado: pessoas já em tarefa escapavam da detecção e voltavam a aparecer em Disponíveis.

### Fix (`BIDDashboard.tsx`)
- Novo `occupiedPhoneSet`: query `SELECT DISTINCT c.telefone_chapa` de todas as `chapas` em tarefas da data (não-removidas), normalizado via `normalizePhone` (remove DDI 55 + não-dígitos → casa formatos diferentes).
- Adicionado como 3º critério no `isOccupied`: `c.telefone != null && occupiedPhoneSet.has(normalizePhone(c.telefone))`.
- Respeita a exceção dos extras autorizados (`is_extra === 1`, MCM-83) — extras nunca viram ocupados.
- Tudo flui pelo flag único `is_occupied`: `available` já filtra (`line 959`), checkbox some, botão de disparo desabilita. Sem mudança de UI necessária.

### Validação
Typecheck baseline 13 (sem novos). ESLint: 1 erro pré-existente (linha ~1707/1719, fora do escopo) confirmado via `git stash`.

**Files changed:** `src/pages/BIDDashboard.tsx`
**Next:** atualizar handoff, build, e (pendente de sessões anteriores) assinar v1.0.14 quando a chave estiver disponível.

---

## 2026-06-30 — MCM — Release v1.0.14 publicado sem assinatura + gh CLI autenticado
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)

### Tentativa de assinatura falhou: chave não está nesta máquina
Após o build final (3ª rodada, confirmado via `grep` que o bundle tinha `meu-chapa.com`), tentei assinar com `tauri signer sign --private-key-path tauri_update_key` — arquivo não existe nesta máquina. Busca em todo `$env:USERPROFILE` (Jeremiah) não encontrou. `C:\Users\W Design\` (caminho referenciado em sessão de 26/06) não existe neste Windows — só `Jeremiah` e `Public`. A chave privada está fisicamente em outra máquina, fora do alcance desta sessão.

Usuário decidiu (via pergunta direta): **publicar sem assinar por enquanto**, em vez de esperar a chave ou abortar o release.

### gh CLI não autenticado — resolvido via device flow
`gh release create` falhou (`gh auth login` necessário). Rodei `gh auth login --web`, usuário autorizou no navegador com o código exibido. Login persistiu no keyring do Windows (`jwijngaardemeuchapa`, escopos `gist, read:org, repo`). Primeira tentativa de `gh release create` retornou `401 Bad credentials` (provável atraso de propagação do token logo após o device flow) — retry imediato funcionou.

### Release v1.0.14 publicado
https://github.com/jwijngaardemeuchapa/mcm/releases/tag/v1.0.14 — apenas o `.exe`, sem `.sig`. Notas do release documentam que a instalação precisa ser manual (auto-update não vai oferecer esta versão até a assinatura ser regularizada).

**Atenção:** `latest.json` no repo já tinha `version: 1.0.14` com uma assinatura de uma sessão anterior — mas é a assinatura de um binário DIFERENTE (antes dos fixes MCM-87/88 desta sessão). Não foi atualizado nesta sessão (não temos assinatura válida pro binário atual). O updater vai falhar a verificação com segurança, não vai instalar nada incorreto — só não vai oferecer a atualização até isso ser corrigido.

**Lição para LESSONS.md:** a chave privada do updater (`tauri_update_key`) precisa de um local fixo e documentado (gerenciador de senhas, não "qual máquina tem ela hoje"). Já causou retrabalho em pelo menos 2 sessões.

**Next:** localizar `tauri_update_key` na máquina física certa, assinar `MCM_1.0.14_x64-setup.exe` (já publicado), atualizar `latest.json` com assinatura real, commit + push.

---

## 2026-06-30 — MCM — Fix "Nome da Mãe" sobrepondo nome do chapa (MCM-87) + domínio .com (MCM-88)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-87, MCM-88
**Commits:** `5be532c`, `f26a53c`, `f230de5`

### Problema relatado
Usuário reportou nomes femininos aparecendo em "Disponíveis" do BID com telefones que, ao ligar, eram de homens. Já tinha sido investigado antes (sessão 2026-06-29, "Angelita com número do Cleverson") e supostamente corrigido via `_key` único no virtual scroll (`b2f5414`) — mas o usuário desinstalou, apagou os dados e ressincronizou do zero em v1.0.14 e o bug persistiu. Isso descartou a causa anterior (colisão de chave no virtualizer) e apontou para um problema de dado-na-origem, não de renderização.

### Diagnóstico
1. Revisão da pipeline de renderização (`BIDDashboard.tsx`): todos os filtros/maps preservam o objeto inteiro (`available`, `withinDist`, `visibleCandidates`) — nome e telefone nunca são desacoplados na UI. Descartado.
2. Revisão do `metabaseSync.ts`: detecção de coluna por regex (`g(/telefone|celular|fone/i)`) sem prioridade — primeira coluna que bater, na ordem de `Object.keys(row)`. Hipótese: pergunta do Metabase com colunas ambíguas.
3. **Confirmação com dado real:** usuário exportou a pergunta de Cadastro Geral (`query_result_2026-06-30T13_21_29...xlsx`) — colunas: `Id, Nome do Chapa, Nome da Mãe, CPF, Telefone, ...`.
4. **Causa raiz:** existem DUAS colunas que batem com `/nome/i` — "Nome do Chapa" e "Nome da Mãe". Quando "Nome do Chapa" vem vazio/omitido do JSON para uma linha específica (comportamento comum de APIs que omitem campos nulos), o regex genérico caía no fallback "Nome da Mãe" — produzindo nome feminino (da mãe) associado ao **telefone real do próprio chapa** (predominantemente masculino na base). Bug inconsistente por natureza: só ocorre nas linhas onde "Nome do Chapa" está vazio na origem — por isso o reinstall completo não resolveu (o dado de origem continuava com o mesmo gap).

### Fix (`metabaseSync.ts`, `sincronizarRegistro`)
- `nomeCol` nunca aceita coluna contendo `mãe`/`mae`, mesmo como fallback. Se "Nome do Chapa" estiver ausente na linha, ela é descartada (`if (!nome) continue`) em vez de mal-rotulada.
- Detecção de telefone endurecida: `pick()` tenta padrões exatos primeiro (`^telefone$`, `^celular$`, `^fone$`) antes do fallback amplo.
- Toast de alerta (visível sem DevTools, já que o build de release não tem `devtools` feature) se houver ambiguidade real de coluna nome/telefone numa sincronização futura — exclui "Nome da Mãe" da contagem de ambiguidade (caso já tratado).

### Achados relacionados (não corrigidos — aguardando confirmação do operador)
- `Número da Casa`: regex exige match exato (`^número$|^num$`), não bate com o nome real da coluna → campo `numero` provavelmente sempre vazio.
- Motivo do bloqueio: coluna real é `c_bloqueio_ativacao → BlacklistReasonDescr`, regex procura `/motivo/i` → `motivo_bloqueio` provavelmente sempre vazio.
- Coluna de bloqueio ambígua: existem `Data do Bloqueio` E `Bloqueio em tudo?`; o código usa a primeira (`Data do Bloqueio`) para o campo `bloqueio` que decide status de bloqueado — pode estar usando a coluna errada.
- Decisão do usuário: "deixe isso como está por enquanto" — registrado para retomar depois.

### Domínio dos links de tarefa (MCM-88)
Painel Meu Chapa migrou de `app.meu-chapa.net` para `app.meu-chapa.com`. Atualizadas 9 ocorrências do link "Abrir tarefa no Meu Chapa" em `TaskCard.tsx`, `BIDDashboard.tsx`, `Historico.tsx` (×3), `Agenda.tsx`, `Consultor.tsx`, `FillrateDetalhe.tsx`, `ValidacoesTardiasTab.tsx` (×2), `quickLinks.ts`.

### Build v1.0.14 (3 rodadas)
- 1ª rodada: build inicial pendente de release (sessão anterior).
- 2ª rodada: incluiu o fix de nome/telefone, mas o `dist/` já tinha sido buildado ANTES do fix de domínio ser commitado — bundle ficou com `.net`. Confirmado via `grep` no JS compilado.
- 3ª rodada (em andamento): inclui ambos os fixes. Rust já compilado em cache — só rebuild do frontend + repack NSIS, bem mais rápido.

**Lição:** quando há commits em sequência rápida durante um build longo (Rust ~15-25min), o passo `vite build` roda no início do pipeline e captura o estado do working tree NAQUELE momento — commits feitos depois do build começar não entram no bundle. Sempre conferir `grep` no `dist/` antes de assumir que um build pegou o último commit.

### Typecheck/Lint
0 erros novos em ambos os commits (baseline mantido em 13 erros pré-existentes, fora do escopo). ESLint limpo nos arquivos alterados.

**Files changed:** `src/lib/metabaseSync.ts`, `src/components/TaskCard.tsx`, `src/components/ValidacoesTardiasTab.tsx`, `src/lib/quickLinks.ts`, `src/pages/Agenda.tsx`, `src/pages/BIDDashboard.tsx`, `src/pages/Consultor.tsx`, `src/pages/FillrateDetalhe.tsx`, `src/pages/Historico.tsx`
**Next:** terminar 3ª rodada de build → assinar → atualizar `latest.json` → GitHub Release v1.0.14 (ainda pendente desde a sessão anterior) → revisitar os 3 achados de coluna ambígua (numero, motivo_bloqueio, bloqueio) com o usuário.

---

## 2026-06-29 — MCM v1.0.14 — Aba Leads no BID + remoção leads de Disponíveis
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-84 (continuação)
**Commits:** `cfeb175`, `477e647` (sessão anterior)

### O que foi feito

**1. Code review multi-agente da lógica de leads (sessão anterior)**
- 4 bugs confirmados: DELETE antes do parse, cidade_cache cacheia null, geocoder case-sensitive, client_name null.
- Todos corrigidos no commit `477e647` (geocode.ts, metabaseSync.ts, BIDDashboard.tsx).
- Root cause dos "nomes de mulheres": dedup era first-seen wins → troca por Map com prioridade de status (chapa_ativado > candidato_apto > ...).

**2. Nova aba "Leads" em cada card de tarefa BID (commit cfeb175)**
- `candidateView` expandido para `"disponiveis" | "bloqueados" | "leads_bid"`.
- Aba "Leads" carrega lazy `chapa_registry WHERE fonte='leads_saac'` para a cidade da tarefa.
- Cruzamento de telefone: `basePhoneSet` = todos telefones da fonte metabase → leads NA BASE ficam esmaecidos e sem disparo.
- Filtro de status por dropdown (inclui prazo_vencido, candidato_apto, etc.) — usuário decidiu filtrar em vez de bloquear.
- Disponíveis agora só retorna `fonte = 'metabase'` — leads não aparecem mais misturados.
- Checkbox + disparo em lote funcionam na aba Leads para leads disponíveis (não bloqueados e não na base).

**3. Build e release v1.0.14**
- `npm run tauri build` → `MCM_1.0.14_x64-setup.exe` gerado com sucesso.
- Assinado com `tauri signer sign` → `.sig` gerado.
- `latest.json` atualizado com assinatura real e URL v1.0.14.
- Commit `cfeb175` pendente de push (bloqueado por auto-mode; aguardar autorização do usuário).
- GitHub Release pendente: upload `.exe` + `.sig` para `v1.0.14`.

**Files changed:** `src/pages/BIDDashboard.tsx`, `src-tauri/tauri.conf.json`, `latest.json`
**Next:** `git push origin main` → criar GitHub Release `v1.0.14` → upload assets.

---

## 2026-06-29 — MCM — Correções pós-v1.0.13: updater, _key virtual scroll, farol leads
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-84 (follow-up)

### Problemas e correções

**1. Updater retornava erro de conexão**
- Causa 1: repo privado bloqueava `raw.githubusercontent.com` → resolvido tornando repo público.
- Causa 2 (principal): `capabilities/default.json` não declarava `updater:allow-check`, `updater:allow-download-and-install`, `process:allow-restart` — em Tauri v2 o plugin rejeita sem permissão explícita. Commit `02ce714`.

**2. Nome/telefone trocados no BID ("Angelita com número do Cleverson")**
- Causa: `_key = COALESCE(r.cpf, 'anon_'||rowid)` dependia de CPF único, mas a migração removeu cpf de PK → mesmo CPF em `metabase` e `leads_saac` → `_key` duplicado → virtualizer (`@tanstack/react-virtual`) reciclava DOM errado ao reordenar async.
- Fix: `_key = 'reg_'||rowid` / `'extra_'||id` — sempre único por linha. Commit `b2f5414`.

**3. Bloqueio falso de candidato_apto e chapa_ativado**
- Análise do payload real (4169 leads): `farol_status='vermelho'` aparece em `candidato_apto` (388x) e `chapa_ativado` (216x) — é indicador de workflow, não de bloqueio.
- Fix: bloqueio apenas por `status ∈ [cadastro_cancelado, chapa_bloqueado, reprovado_brk]` ou `block_reason`/`cancel_reason` preenchidos. Remove `farol_status==='vermelho'` da condição.
- Bônus: `chapa_ativado → tarefas=1` para entrar no tier ativado (prioridade máxima no BID). Commit `aa2c8bf`.

**4. Filtro de status na aba Leads**
- Select com três modos: Disponíveis (sem bloqueio), Bloqueados, ou status cru específico. Commit `6d552e5`.

### Status dos leads no payload Saac
- `novos` / `triagem` / `acolhimento` → em processo, sem bloqueio
- `candidato_apto` → aprovado (tier aprovado no BID)
- `chapa_ativado` → já trabalhou (tier ativado, `tarefas=1`)
- `prazo_vencido` → prazo expirado (baixa prioridade, não bloqueado)
- `cadastro_cancelado` + `cancel_reason` → BLOQUEADO
- `chapa_bloqueado` + `block_reason` → BLOQUEADO
- `reprovado_brk` → BLOQUEADO
- `farol_status` → indicador de workflow, ignorado para bloqueio

### Versão
v1.0.13 (commits sequenciais `02ce714` → `b2f5414` → `6d552e5` → `aa2c8bf`)

---

## 2026-06-29 — MCM — BID Dashboard: correção de bugs + aba Leads + v1.0.13
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-84 (follow-up), MCM-85

### Problema
Quatro bugs relatados no BID: (1) nomes de mulheres/estranhos aparecendo em Disponíveis; (2) chapas já alocados aparecendo como disponíveis; (3) bloqueados entre disponíveis; (4) incerteza sobre sync dos Leads Saac + sem visibilidade dos leads.

### Diagnóstico
- Leads Saac (`fonte='leads_saac'`) vazavam para Disponíveis porque `cep=null` → `distance_km=null` → filtro de raio sempre incluía.
- Mapeamento de bloqueio estreito (só `cadastro_cancelado`/farol vermelho) deixava outros status não-aprovados passarem.
- `chapa_registry.cpf` era PRIMARY KEY → INSERT colide quando mesmo CPF existe no cadastro e nos leads → chunk de 30 linhas descartado em silêncio.
- `occupiedNameSet`: `normalize()` não colapsa espaços internos; SQL usava `LOWER(TRIM())` → mismatch deixava chapas alocados escaparem.

### Alterações
**`src-tauri/src/lib.rs`**
- Migração idempotente: recria `chapa_registry` com `id INTEGER PRIMARY KEY AUTOINCREMENT` (surrogate), CPF deixa de ser PK. Preserva todos os dados e índices.
- Cria `cidade_cache` (chave TEXT PK, lat/lng por cidade+UF).

**`src/lib/metabaseSync.ts`**
- `sincronizarRegistro`: dedup por CPF/nome antes de inserir; insert resiliente por chunk (try/catch individual + toast com contagem de falhas).
- `sincronizarLeadsSaac`: dedup por CPF/telefone/nome; bloqueio abrangente (`/cancel|bloque|inativ|reprov|recus/i` + farol + block_reason); captura `tarefas` reais do payload; insert resiliente.

**`src/lib/geocode.ts`**
- Novo `CityGeocoder` + singleton `cityGeocoder`: fila + rate-limit 1.1s + cache em `cidade_cache`, Nominatim `city=+state=`.

**`src/pages/BIDDashboard.tsx`**
- `normName()`: normalize + colapsa espaços → aplicado nos dois lados do occupied check (fecha bug 2).
- `isApprovedSituacao()`: heurística `/aprovad|apto|ativo|verde|liberad/i`.
- `computeScore()`: tiers ativado (+1000+tarefas) > aprovado (+500) > demais (+10) — magnitude domina distância/recência.
- `useEffect` geocode por cidade para leads sem CEP via `cityGeocoder`.
- Gate de leads no raio: `fonte='leads_saac'` só entra em Disponíveis se `distance_km != null && <= maxDistKm`.
- Badge EXTRA corrigido: `is_extra === 1` (antes `cpf === null` conflitava com leads).
- Badge LEAD adicionado para `fonte='leads_saac'`.
- Nova aba **"Leads"** no BID: lista `leads_saac`, busca, filtro cidade, contagem, último sync, botão sincronizar, badges ATIVADO/APROVADO/BLOQUEADO/LEAD.

### Diagnóstico adicional (sessão 2026-06-29)
- `latest.json` retornava 404 para o updater → repo privado bloqueia `raw.githubusercontent.com`. Resolvido tornando o repo público.

### Verificação
- `npm run typecheck`: 13 erros pré-existentes, 0 novos.
- `cargo check`: clean.
- Versão bumped `1.0.12` → `1.0.13`.

---

## 2026-06-26 — MCM — Build v1.0.12 + GitHub Release + senha de Integrações
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** —

### Alterações
- Senha de Integrações atualizada: `ch@p@Meu` → `meuCh@p@` (commit `27e504c`).
- Versão bumped `1.0.11` → `1.0.12` em `tauri.conf.json` e `Ajuda.tsx`.
- Build `MCM_1.0.12_x64-setup.exe` gerado com sucesso (exit 0).
- `.exe` assinado com `tauri signer sign` → `MCM_1.0.12_x64-setup.exe.sig` gerado.
- `latest.json` atualizado com assinatura real e URL v1.0.12.
- GitHub Release `v1.0.12` criado via API; `.exe` + `.sig` publicados.
- Commit `04f2ed3` (versão + latest.json assinado).
- **Updater operacional:** instalar MCM_1.0.12 → abrir Integrações → desbloquear → Verificar → "versão mais recente".

---

## 2026-06-26 — MCM — Atualização manual protegida por senha (updater)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** —

### Alterações
- `tauri-plugin-updater` + `tauri-plugin-process` adicionados ao `Cargo.toml` e registrados em `lib.rs`.
- `tauri.conf.json`: bloco `plugins.updater` com pubkey, endpoint `raw.githubusercontent.com/jwijngaardemeuchapa/mcm/main/latest.json`, `dialog: false`.
- `npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process`.
- Card "Atualização do Sistema" adicionado em `Integracoes.tsx` dentro do bloco `unlocked` — 6 estados (idle/checking/up-to-date/available/downloading/installing), barra de progresso, sem auto-notificação.
- `latest.json` criado na raiz do repo (atualizar a cada release com `.exe.sig` e URL do GitHub Release).
- `tauri_update_key.pub` adicionada ao repo; chave privada em `.gitignore`.
- **Processo de release:** `$env:TAURI_SIGNING_PRIVATE_KEY` → `npm run tauri build` → upload `.exe` + `.exe.sig` → atualizar `latest.json` → push.
- Typecheck: 0 erros novos (baseline 13 mantida).
- Commit: `0da8cc9`.

---

## 2026-06-26 — MCM — Janela maximizada + versão 1.0.11 + mockup do instalador
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** —

### Alterações
- **`tauri.conf.json`**: `"maximized": true` adicionado à janela principal — app abre maximizado.
- **`tauri.conf.json`**: versão bumped de `1.0.1` → `1.0.11`.
- Build `MCM_1.0.11_x64-setup.exe` gerado com sucesso (exit 0).

### Mockup do instalador customizado
- Criado mockup interativo (3 telas: boas-vindas, progresso, conclusão) com identidade visual real do MCM.
- Cores: laranja `#e85f00`, Montserrat 900 bold, logo real embutido em base64.
- Autoria "por Wijngaarde Design" presente na sidebar.
- Design **aprovado** pelo usuário — implementação NSIS pendente para próxima sessão.

### Implementação NSIS pendente (planejada)
- Exportar `sidebarImage` (164×314px) e `headerImage` (150×57px) com o design aprovado.
- Configurar `bundle.windows.nsis` no `tauri.conf.json` com os assets.
- Script NSIS customizado com cores e fontes MCM.

---

## 2026-06-26 — MCM — Sync automático Leads Saac + notificações filtradas pela carteira
**Actor:** Jeremiah | **Agent:** claude (Opus 4.8)
**Tickets:** — (melhorias de operação)

### Parte A — Desacoplar e automatizar o sync dos Leads Saac
- **`sincronizarLeadsSaac(silent)`** extraída de dentro de `sincronizarRegistro` (estava acoplada ao DELETE+INSERT pesado do cadastro geral). Função leve, autossuficiente: só `fonte='leads_saac'`. Grava `saac_last_sync`.
- `sincronizarRegistro` **deixa de puxar Saac** (mudança intencional — agora é o botão dedicado).
- **`devesSincronizarRegistro()`**: cadastro geral passa a auto-sincronizar **2x/semana** (âncoras seg/qui), espelhando `devesSincronizarCarteira`. Reusa o timestamp `chapa_registry_imported_at`.
- **`AppStartup.tsx`**: boot refatorado para steps dinâmicos (`jobs[]`) com progresso distribuído. Adiciona Saac (sempre, se configurado) + cadastro (2x/sem se devido) além de tarefas/carteira.
- **`Integracoes.tsx`**: botão `SincronizarLeadsSaacBtn` na seção Saac, com timestamp da última sync; desabilitado sem credenciais.

### Parte B — Notificações filtradas pela carteira (tempo real)
- **`src/lib/carteira.ts`** novo: `getActiveCarteiraNames()` — nomes visíveis pelo filtro de grupos (`[]` = sem filtro). Espelha a lógica do `Dashboard.load()`.
- **`WatcherContext.tsx`**: cache `activeNamesRef` (atualizado no mount + tick 60s + evento `carteira:changed`); helper `empresaVisivel()`; gate na entrada de `handleActivity` e `handleWebhookEvent` — respostas de empresa fora do filtro não viram notificação (`notifLog` + `logActivity`).
- **Importante:** só o lado de notificação é filtrado. Em `handleWebhookEvent`, `fup:refresh`/`fup:remove-chapa` (dados) ficam fora do gate — integridade das tarefas não depende do filtro de visualização.
- **`Carteira.tsx`**: dispara `carteira:changed` ao trocar/limpar o filtro → tempo real.

### Validação
- `npm run typecheck` (comando correto — `npx tsc --noEmit` é vazio neste repo): **0 erros novos**; baseline pré-existente de 13 mantida (ingestTarefas, ClienteBook, useNotificationWatcher, Dashboard, AnaliseBase, etc.).
- Custo do filtro: 1 `companyMatches` por resposta (eventos raros) sobre array em cache. Zero overhead de render.

### Contexto de sessão
- Sincronizado com 14 commits do outro PC (MCM-78→85, v1.0.1). Corrigida regressão própria: `sync_aceite` faltando no `TIPO_CONFIG` do ActivityBell (commit b31b39f).

---

## 2026-06-25 — MCM — Conserto do BID quebrado (MCM-85) + autorizados (MCM-83)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-85 (Feito), MCM-83 (Feito)
**Commit:** 8ab536a

### Contexto — MCM-84 (Gemini) foi para a main quebrado
- BIDDashboard.tsx usava `virtualizer`, `activeList`, `toggleSort` indefinidos e tipo `AdHocBidParams` inexistente → ReferenceError ao expandir card do BID.
- **Por que passou:** `npx tsc --noEmit` não checa `src/` (tsconfig.json tem `files:[]` + project references). Check real é `tsc -p tsconfig.app.json`. Gemini e claude viram "verde" à toa.

### Correções (MCM-85)
- `useVirtualizer()` completo com medição dinâmica (`measureElement` + `data-index`), `activeList` (lista da aba ativa) e `toggleSort` implementados; tipo `AdHocBidParams` definido. `tsc -p tsconfig.app.json` limpo no arquivo.
- **Recovery da coluna `fonte`** em `chapa_registry` no `setup()` do Rust (mesmo padrão idempotente do `enderecos`) — a query `r.fonte` do BID quebrava em instalação que ainda não sincronizou o cadastro. Não usei migration por causa do ALTER de runtime já existente (evita "duplicate column").
- Script npm **`typecheck`** (`tsc -p tsconfig.app.json --noEmit`) adicionado para não repetir o check vazio.

### MCM-83 — extras autorizados não somem
- `is_occupied` agora ignora extras via flag **`is_extra === 1`** (vindo de `bid_chapas`), não mais `cpf === null` — leads Saac no cadastro também podem ter CPF nulo. Adicionado `is_extra` ao tipo `BidChapa` e às 3 queries (1 nos extras, 0 no cadastro/bloqueados).

### Pendência herdada do MCM-84
- 14 erros de tipo **pré-existentes** (ingestTarefas, Dashboard, ClienteBook, useNotificationWatcher etc.) revelados pelo `tsc -p tsconfig.app.json`. Vite ignora; fora do escopo desta sessão.

---

## 2026-06-25 — MCM — Umbler bloqueado por templateId vazio (MCM-82)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-82 (Feito)
**Commit:** c544bd3

### umblerReady — pré-requisito desnecessário removido
- `umblerReady` em `TaskCard.tsx` e `ApproachingAlert.tsx` exigia `templateId` preenchido
- Em instalações novas o campo vem vazio (`""`) bloqueando todos os botões Umbler
- Fix: remover `templateId` da guarda — `umblerReady` agora requer só `bearerToken + fromPhone + organizationId`
- FUP usa `fupBotId`/`fupBotTriggerName` (verificado no disparo); cancel tem `cancelTemplateReady` próprio

---

## 2026-06-24 — MCM — BIDDashboard: extras truncados e Usuários Excluídos (MCM-81)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-81 (Feito)
**Commit:** 54edc64

### BIDDashboard — dois bugs corrigidos
- **Bug 1 (86→25):** query UNION ALL com ORDER BY + LIMIT 600 cortava extras de baixo volume. Fix: split em duas queries paralelas — extras sem LIMIT, registry com LIMIT 600; extras colocados primeiro no array combinado
- **Bug 2 (Usuários Excluídos):** contas deletadas no `chapa_registry` (situação/nome contendo "Excluído") passavam pelo filtro de bloqueio pois não tinham flag bloqueio. Fix: `AND UPPER(COALESCE(r.situacao,'') || ' ' || COALESCE(r.nome,'')) NOT LIKE '%EXCLU%'` nas queries de disponíveis e bloqueados
- Parser defensivo em `parseXlsxFile`: pula linhas com nome "usuario excluido" e mostra toast com contagem

---

## 2026-06-24 — MCM — Sync cadastro geral de chapas via Metabase (question 1296)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-81 (pendente criação)
**Commit:** d01dea8

### Metabase — Cadastro Geral de Chapas
- `settings.ts`: `metabaseRegistroCardId: 1296` em `SETTING_DEFAULTS` — pré-preenchido em qualquer máquina nova
- `metabaseSync.ts`: nova função `sincronizarRegistro(silent)` — DELETE FROM chapa_registry + INSERT em chunks de 30, mapeamento de colunas por regex (nome, CPF, telefone, cidade, bairro, estado, rua, CEP, número, tarefas, datas, situação, bloqueio, motivo, ASO)
- `Integracoes.tsx`: campo "ID da pergunta — Cadastro Geral de Chapas" pré-preenchido com 1296, botão "Sincronizar agora", timestamp da última sync
- Substitui a importação manual do CSV de cadastro

---

## 2026-06-23 — MCM — Sininho: log disparo auto FUP + CPF formatado na cópia
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-80 (Feito)
**Commit:** 862ede9

### ActivityBell — disparo automático visível
- Novo tipo `fup_auto` em `activityLog.ts` (union type expandido)
- `useScheduledFup.ts`: após `startAutoFup` disparar, chama `logActivity(fup_auto)` + dispara `activity:new-diff` para tocar o sininho
- `ActivityBell.tsx`: ícone Zap para `fup_auto`, label "Disparo automático FUP"
- Itens com `id_tarefa` ficam clicáveis: ao clicar, navega para `/dashboard` + dispara `fup:flash-task` no card da tarefa

### TaskCard — CPF formatado na cópia
- Função `formatCpf(cpf)` adicionada: converte 11 dígitos → `000.000.000-00`; passa intacto se não tiver 11 dígitos
- Aplicada em `copyCpfConfirmados` e `copyList`

---

## 2026-06-22 — MCM — Startup rework (vídeo→loading + ações/lembretes) + BID melhorias + FUP sync aceites
**Actor:** Jeremiah | **Agent:** claude (Opus 4.8 / Sonnet 4.6)
**Tickets:** MCM (sem ticket específico — melhorias de UX)
**Summary:**

### Startup screen rework (`AppStartup.tsx`, `App.tsx`, `PriorityPanel.tsx`, `index.css`)
- **Fix sobreposição vídeo × loading:** `AppStartup` agora só monta após `IntroScreen` finalizar — gate `!showIntro &&` em `App.tsx`. Quando intro já foi exibida hoje, `showIntro` nasce `false` e startup monta imediatamente (comportamento preservado).
- **Fase boas-vindas redesenhada:** substituiu 3 cards de métricas (vaidade) por conteúdo acionável:
  - `loadTodayTasks()` — query SQLite juntando tarefas + chapas do dia + overnight
  - `loadLembretes(tasks)` — replica loop de lembretes do Dashboard
  - `buildPriorities()` exportado de `PriorityPanel.tsx` — reutiliza lógica de exceções (emergente/urgente)
  - Cada item clicável → `fup:flash-task` + `onDone()` — abre a tarefa no painel
  - Estado vazio: mensagem calma "Tudo certo por aqui" + auto-advance 6s
  - Com ações/lembretes: lista priorizada, sem auto-advance, botão "Entrar no painel"
- CSS: adicionado `.startup-action-row` hover (translateX + border glow)

### BID Dashboard melhorias
- **Chapas extras didáticas:** badge "EXTRA" em cada chapa importada (cpf=null); filtro "Só extras (N)"; após importação, o card da tarefa abre automaticamente com filtro ativo
- **Ocultar aguardando dos disponíveis:** chapas com `status="aguardando"` excluídos do filtro `available` — evita duplo disparo
- **Respostas ordenadas por ação + painel digest no topo** (commit anterior desta sessão)
- **FUP auto-disparo de aproximação:** novo setting `fupAutoDispatchBloqueioHoras` (default 4h) — se FUP manual foi enviado a mais de 4h da tarefa, o auto-disparo de aproximação ainda ocorre; diálogo indica "lembrete de aproximação"

### FUP Dashboard — Novos aceites no sync
- `computeRefreshDiff` passa a rastrear `prevStatus` por chapa
- Transições → `confirmado` entre syncs viram `diff.accepted[]`
- Seção "Novos aceites detectados" (verde) no topo do painel RefreshDiff
- Logado como `sync_aceite` na ActivityBell
- Painel abre automaticamente mesmo sem added/removed quando há aceites

**Files changed:** `src/App.tsx`, `src/components/AppStartup.tsx`, `src/components/PriorityPanel.tsx`, `src/index.css`, `src/pages/BIDDashboard.tsx`, `src/lib/settings.ts`, `src/lib/useScheduledFup.ts`, `src/components/AutoFupConfirmDialog.tsx`, `src/pages/Configuracoes.tsx`, `src/components/RefreshDiff.tsx`, `src/pages/Dashboard.tsx`, `src/lib/activityLog.ts`
**Next:** BID — sorting de respostas por ação + painel digest (confirmado). Fechar MCM-68 (Tela Foco) quando retomar.

---

## 2026-06-21 — MCM — Tela de startup premium (sync + boas-vindas) + planejamento MV2
**Actor:** Jeremiah | **Agent:** claude (Opus 4.8)
**Tickets:** MV2-17 criado, MV2-18 criado, MV2-4 (comentário), MV2-6 (comentário)
**Summary:**
- **Tela de startup redesenhada (`AppStartup.tsx`):** substitui o spinner mínimo + botão "importar" por um fluxo premium em duas fases sobre fundo escuro (`hsl(225 25% 6%)`, mesma referência da IntroScreen).
  - **Fase sync:** só roda se Metabase estiver configurado (`metabase_status` + cardIds). Logo com anel SVG girando + pulso de brilho azul, lista de steps com stagger (`startup-step-in`), spinner na linha ativa, ✓ verde nos concluídos, barra de progresso com gradiente/glow, texto de status dinâmico. Sincroniza tarefas e, se devido, carteira.
  - **Fase boas-vindas:** crossfade após o sync. Ícone Sun/Sunset/Moon por hora do dia, saudação com `operadorNome`, data por extenso (fuso SP), 3 cards de métricas do dia (tarefas hoje / a contatar / confirmados) com count-up animado e `startup-metric-pop` staggerado, botão "Entrar no painel" + auto-advance de 6s.
  - **Sem Metabase configurado:** `onDone()` imediato, nenhuma tela é exibida.
  - Métricas vêm de 3 queries SQLite parametrizadas por `DATE(data_tarefa)` no fuso SP.
- **CSS (`index.css`):** 5 keyframes novos no `@layer utilities` — `startup-glow-pulse`, `startup-step-in`, `startup-metric-pop`, `startup-countdown`, `startup-spin`.
- **Planejamento MV2:** análise de quais correções da v1.0.0 viram capacidade arquitetural na MV2. Bugs pontuais (toast / timeline / BID guard) ficam fechados sem ticket. Criados como pré-requisitos do Autopilot (MV2-7): **MV2-17** (observabilidade & health da esteira Firestore — diagnóstico achou 104/104 docs em `error` silenciosos) e **MV2-18** (fila global de disparo + rate-limit Umbler "2C" — rAF foi patch de sintoma, falta a orquestração global). Comentários em MV2-4 (Foco) e MV2-6 (Desempenho) apontando a agregação diária já pronta em `AppStartup.tsx` como embrião dessas telas.
**Files changed:** `src/components/AppStartup.tsx`, `src/index.css`, `.agents/`
**Next:** Concluir build, distribuir. Avaliar MV2-16 (protótipo navegável das 3 telas-núcleo).

---

## 2026-06-21 — MCM v1.0.0 — Correções críticas Firestore + desempenho de disparos em massa
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-74 (comentário)
**Summary:**
- **Bug 3.1 — canal_contato race condition:** `_executeMassFup` gravava `canal_contato='umbler_talk'` para todas as chapas só no final do lote. Para 57 chapas isso demorava vários minutos. Chapas rápidas respondiam antes da gravação → `processFirestoreMessage` não achava match FUP → `error`. Fix: `_markCanalContato()` chamado por chapa imediatamente após cada `startUmblerBot` bem-sucedido, dentro do loop. UPDATE em massa no final removido.
- **Bug 3.2 — misses transientes viram error permanente imediatamente:** `useFirestoreQueue` chamava `updateDoc(status:'error')` em qualquer miss. Fix: misses `transient: true` agora reprocessam com backoff (10s/30s/60s/120s, até 4 tentativas) mantendo doc `pending`. Só após esgotar as tentativas (ou miss permanente) marca `error`.
- **Bug 3.3 — BID aguardando engolia confirmações FUP:** Guard do BID bloqueava o fluxo FUP inteiro quando havia qualquer `bid_disparos aguardando` do mesmo número nos últimos 7 dias. Fix: guard só bloqueia quando o payload tem campos BID (`resposta_interesse`/`resposta_aceite`); payloads FUP (`resposta_opcao`) continuam para o fluxo FUP.
- **Bug 2 — 57 setIntervals = render storm:** `ActiveDispatchesOverlay` recebia N notificações/seg (uma por tarefa ativa). Fix: `requestAnimationFrame` coalescing — só 1 `setState` por frame de animação (~16ms).
- **Bug 1 — Timeline mostra tarefas de amanhã como hoje:** Timeline plota por hora do dia, sem consciência de data. Ao sincronizar 30h, tarefas do dia seguinte apareciam sobrepostas. Fix: filtro adicional `fmtSP(t.data_tarefa, "yyyy-MM-dd") === selectedDate` no render da TaskTimeline.
- **Ferramenta de diagnóstico/limpeza Firestore:** `scripts/firestore-diag.mjs --clean-errors` apaga docs `error` históricos em lotes de 500.
- **LESSON:** miss FUP no Firestore é quase sempre transiente (race com canal_contato), não erro permanente. Marcar `error` imediatamente descarta confirmações reais.
**Files changed:** `src/lib/dispatchQueue.ts`, `src/lib/firestoreQueue.ts`, `src/lib/useFirestoreQueue.ts`, `src/components/ActiveDispatchesOverlay.tsx`, `src/pages/Dashboard.tsx`, `scripts/firestore-diag.mjs`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`, `.agents/`
**Next:** Distribuir MCM_1.0.0_x64-setup.exe.

---

## 2026-06-19 — MCM v0.9.99 — Correção crítica: regressão de ingestTarefas (pool SQLx + transação manual)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-74 (comentário)
**Summary:**
- **Root cause:** `db.execute("BEGIN")` via `@tauri-apps/plugin-sql` não funciona em pool de conexões (SQLx). BEGIN/COMMIT/ROLLBACK rodavam em conexões diferentes do pool → BEGIN ficava "órfão" com write lock aberto indefinidamente. Causava: "database is locked" (code 5), "transaction within a transaction" (code 1), e lentidão generalizada (cliques esperavam o lock, ~800 IPCs sequenciais).
- **Fix em `src/lib/ingestTarefas.ts`:** removida toda a lógica de transação manual (BEGIN/COMMIT/ROLLBACK e DELETE-tudo de chapas). Substituído por: (1) upsert em lote multi-row `INSERT OR REPLACE INTO tarefas` em chunks de 50 (~800 binds); (2) upsert em lote multi-row `INSERT OR REPLACE INTO chapas` em chunks de 80 (~960 binds); (3) delete cirúrgico só de chapas com ids que não constam mais no novo ingest — usa `chapaPrev` (já carregado) como referência. Ids de chapas são determinísticos (reusados se chapa existe) então upsert nunca esvazia a tabela.
- **LESSON aprendida:** `@tauri-apps/plugin-sql` usa pool SQLx — NUNCA usar BEGIN/COMMIT via `db.execute()`. Cada execute já é atômico. Para batches, usar multi-row VALUES. Ver M_leo.ts:236 para referência.
**Files changed:** `src/lib/ingestTarefas.ts`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`, `.agents/`
**Next:** Distribuir MCM_0.9.99_x64-setup.exe.

---

## 2026-06-19 — MCM v0.9.98 — Fixes de estabilidade pós v0.9.97
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-74 (comentário), MCM-77 (comentário)
**Summary:**
- **ingestTarefas — transação SQLite**: DELETE+INSERT de chapas agora em BEGIN/COMMIT/ROLLBACK. Elimina a janela de inconsistência onde leituras concorrentes (WatcherContext timer 60s) viam chapas zeradas entre o DELETE e o INSERT — causava flicker na UI e diff falso no ActivityBell.
- **skipDiffRef em Dashboard**: `useRef(false)` ativado em `handleSyncMetabase()` e `handleSync30h()` durante o ciclo sync+load. O algoritmo de diff em `load()` ignora quando este flag está ativo — evita "tudo apareceu/sumiu" no sino após atualização manual.
- **Troca de Turno — filtro de grupo corrigido**: `carteiraBd` salvo em state (antes era variável local descartada). `generate()` agora filtra `allTarefas` pelo grupo selecionado antes de passar para `buildMessage()`. `empresasDisponiveis` (useMemo) também respeita o grupo ativo.
**Files changed:** `src/lib/ingestTarefas.ts`, `src/pages/Dashboard.tsx`, `src/components/TrocaDeTurno.tsx`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`
**Next:** Distribuir MCM_0.9.98_x64-setup.exe. Avaliar MCM-27 (Pool de Chapas).

---

## 2026-06-19 — MCM v0.9.96 — MCM-74/75/76/77: Feed atualizações + sync amanhã + carteira + startup loading
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-74 ✅, MCM-75 ✅, MCM-76 ✅, MCM-77 ✅ | MV2-12/13/14/15 criados
**Summary:**
- **MCM-75**: removidos Respostas/Importar/Fonte de Dados do menu; botão Atualizar em BIDDashboard e DisparosUmbler dispara sync Metabase; relógio de sync dinâmico na toolbar ("atualizado há X min · próximo em Y min")
- **MCM-76**: `metabaseTarefas30hCardId` + `metabaseCarteiraCardId` em settings e Integrações (novos campos); botão "Sync amanhã" em Dashboard/BID/Disparos via `sincronizarMetabase30h()`; `metabaseSync.ts` centraliza todas as funções de sync
- **MCM-74**: migration v15 — tabela `activity_log` com índice em timestamp; `activityLog.ts` com TTL 30 dias; WatcherContext e useAutoCancelFup persistem eventos no DB; `pruneActivityLog()` no startup do WatcherProvider; `ActivityBell` na toolbar — popover com feed cronológico, badge de não-lidos, botão Limpar; painel "Confirmações Automáticas" removido
- **MCM-77**: `sincronizarCarteira()` — upsert sem DELETE (preserva entradas manuais); `devesSincronizarCarteira()` detecta se é segunda pós-último sync; `AppStartup` — overlay de loading com progresso (tarefas sempre + carteira às segundas); botão "Sincronizar agora" em Integrações com timestamp da última sync
**Files changed:** `AppSidebar.tsx`, `Dashboard.tsx`, `BIDDashboard.tsx`, `DisparosUmbler.tsx`, `Integracoes.tsx`, `settings.ts`, `metabaseSync.ts` (novo), `activityLog.ts` (novo), `WatcherContext.tsx`, `useAutoCancelFup.ts`, `ActivityBell.tsx` (novo), `AppStartup.tsx` (novo), `App.tsx`, `lib.rs` (migration v15), `tauri.conf.json`, `Ajuda.tsx`
**Next:** Build v0.9.96. Configurar IDs dos cards de 30h e Carteira em Integrações. Testar loading de startup.

---

## 2026-06-19 — MCM v0.9.95 — Auto-cancel FUP + Lista Para Remover + XLSX (MV2-9/10/11)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MV2-9 ✅, MV2-10 ✅, MV2-11 ✅
**Summary:**
- `src/lib/useAutoCancelFup.ts` (novo): hook global que a cada 30s verifica chapas com FUP disparado sem resposta. Avisa (toast.warning) 5 min antes do limiar configurável. Ao atingir o limiar: envia `cancelTemplateId` via `sendUmblerFup`, atualiza `canal_contato='umbler_cancelamento'`, insere `fup_log canal='umbler_cancelamento_auto'`. `useRef<Set>` previne double-fire.
- `src/lib/WatcherContext.tsx`: integra `useAutoCancelFup(handleRefresh)`.
- `src/lib/settings.ts`: `autoCancelFupEnabled: boolean` (default false) + `autoCancelFupMinutes: number` (default 60).
- `src/components/ApproachingAlert.tsx`: seção colapsável "Para remover (N)" em vermelho, acima das seções de tarefas. Query: `canal_contato='umbler_cancelamento'` + `status_contato NOT IN ('confirmado','removido')` + tarefa nas últimas 4h. Botão Remover por linha: `UPDATE chapas SET status_contato='removido', data_remocao=NOW`.
- `src/pages/Configuracoes.tsx`: toggle "Cancelamento automático por falta de resposta" + Select de minutos (30/45/60/90/120), visível só quando toggle ON.
- `src/pages/Dashboard.tsx`: botão "Exportar" na toolbar; Dialog com checkboxes por tarefa (Todos/Nenhum); "Exportar selecionadas (N)" gera `tarefas_YYYY-MM-DD.xlsx` via `xlsx` lib.
- Build v0.9.95 pendente.
**Files changed:** `src/lib/useAutoCancelFup.ts`, `src/lib/WatcherContext.tsx`, `src/lib/settings.ts`, `src/components/ApproachingAlert.tsx`, `src/pages/Configuracoes.tsx`, `src/pages/Dashboard.tsx`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`
**Next:** Build v0.9.95. Ativar e testar auto-cancel com threshold baixo (ex: 1 min) para validar fluxo.

---

## 2026-06-19 — MCM v0.9.94 — Fix FUP/BID Firebase
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** (bug fix — sem ticket Jira)
**Summary:**
- `firestoreQueue.ts` / `classifyResponse`: NÃO verificado ANTES do SIM — elimina falso-positivo com histórico misto; SIM exige frase completa ("sim, to nessa" | "sim, estou nessa") espelhando fix já feito no Rust no commit 0eb8540.
- `firestoreQueue.ts` / BID fallthrough: payload BID sem `resposta_interesse` retorna `handled:false` em vez de cair no fluxo FUP e atualizar chapa errado.
- `WatcherContext.tsx`: default do actionMap corrigido de "confirmado" para "recusou"; recusa via Firebase agora dispara `fup:remove-chapa` (sugestão de remoção), igual ao comportamento da notificação Windows.
- Build v0.9.94 gerado: `MCM_0.9.94_x64-setup.exe`
**Files changed:** `src/lib/firestoreQueue.ts`, `src/lib/WatcherContext.tsx`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`
**Next:** Distribuir MCM_0.9.94_x64-setup.exe. Testar fluxo FUP NÃO → badge "Negou FUP" + sugestão de remoção via Firebase.

---

## 2026-06-19 — MCM v0.9.93 — Importação direta Metabase (MCM-72)
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-72 ✅
**Summary:**
- `src/lib/ingestTarefas.ts` (novo): lógica de ingestão extraída de Importar.tsx como biblioteca compartilhada; suporte a datas ISO do Metabase via `parseDateForIngest`; CPF aceita coluna "CPF do Chapa"; callback opcional `confirmDateMismatch` (só fluxo CSV)
- `src/pages/Importar.tsx`: refatorado para chamar `ingestTarefas()` — sem mudança visual
- `src/lib/settings.ts`: campo `metabaseTarefasCardId?: number` adicionado
- `src/pages/Integracoes.tsx`: novo Card "Metabase — Fonte de Tarefas" com campos URL, API key (write-only → backend Rust), ID da pergunta, botão "Sincronizar agora", timestamp última sync
- `src/pages/Dashboard.tsx`: auto-sync silencioso a cada 5 min via `setInterval`; throttle por localStorage; recarga após sync bem-sucedido
- `src/pages/MetabaseSetup.tsx`: página auxiliar mantida para listagem/amostra de Questions (agora secundária)
- Build v0.9.93 gerado: `MCM_0.9.93_x64-setup.exe`
**Files changed:** `src/lib/ingestTarefas.ts`, `src/pages/Importar.tsx`, `src/pages/MetabaseSetup.tsx`, `src/pages/Integracoes.tsx`, `src/pages/Dashboard.tsx`, `src/lib/settings.ts`, `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`
**Next:** Distribuir MCM_0.9.93_x64-setup.exe. Testar sync Metabase com VPN ativa.

---

## 2026-06-20 — MCM v0.9.92 — build release
**Actor:** Jeremiah | **Agent:** claude
**Tickets:** MCM-61 ✅, MCM-62 ✅, MCM-63 ✅, MCM-64 ✅
**Summary:** Build v0.9.92 com todas as features e fixes desde v0.9.91: Carteira por grupos (G1-G5, fixar empresa, CSV importa coluna automaticamente), badge "Negou FUP" + botão Sinalizar Remoção para chapas cancelados, fix crash UserX não importado, botão Ver em Confirmações Automáticas, BID webhook unificado, phone match com parênteses, BID refresh Firestore, ocupados completos, ApproachingAlert dispara bot. Protocolo de sync codificado em PROJECT_RULES §J8.
**Files changed:** `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`, `.agents/PROJECT_RULES.md`
**Next:** Distribuir MCM_0.9.92_x64-setup.exe. Pendente: validar queries PG (MCM-42), MCM-68 (Tela Foco) em progresso.

---

## 2026-06-20 — MCM-64: Carteira multi-seleção de grupos + build
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-64 ✅
**Summary:**
- **Migration v14:** `ALTER TABLE empresa_config ADD COLUMN fixar_visivel INTEGER DEFAULT 0`
- **settings.ts:** novo campo `carteiraGruposAtivos: string[]` ([] = todos ativos, backwards compat)
- **Carteira.tsx:** seção de chips G1-G5 no topo (toggleáveis, salvos em settings); ícone contextual por empresa: Eye/EyeOff (grupo ativo), PinOff/Pin (grupo inativo = fixar empresa avulsa)
- **Dashboard.tsx + BIDDashboard.tsx:** query carteira atualizada com LEFT JOIN empresa_config; filtro grupo + fixar_visivel em TS; BIDDashboard agora também respeita oculta_dashboard
- **Lógica:** gruposAtivos=[] → sem filtro (todos visíveis); gruposAtivos=[G1,G2] → só G1+G2 aparecem; fixar_visivel=1 → empresa sempre aparece mesmo com grupo inativo
- **Build:** v0.9.91 buildado (MCM-64 incluso)
**Files changed:** `src-tauri/src/lib.rs`, `src/lib/settings.ts`, `src/pages/Carteira.tsx`, `src/pages/Dashboard.tsx`, `src/pages/BIDDashboard.tsx`
**Next:** Distribuir instalador. MCM-58 aguarda validação de queries PG.

---

## 2026-06-20 — Bug fixes Firebase + ApproachingAlert bot + Jira + planejamento Carteira
**Actor:** Jeremiah | **Agent:** claude (Sonnet 4.6)
**Tickets:** MCM-61 ✅, MCM-62 ✅, MCM-63 ✅, MCM-64 (backlog)
**Summary:**
- **MCM-61 (fix):** Queries SQL em `firestoreQueue.ts` não normalizavam `(` e `)` no telefone — números `(11) 99999-9999` falhavam no LIKE. REPLACE chain estendido para remover `(`, `)`, `+` nas 3 queries (BID etapa 3, BID etapas 1/2, FUP). Também adicionado `precisa_ajuda → "recusou"` no actionMap do WatcherContext.
- **MCM-62 (fix):** BIDDashboard não escutava `fup:refresh` após resposta Firestore — adicionado `useEffect` com listener → `loadAll()`.
- **MCM-63 (fix):** `byName` query em BIDDashboard tinha `AND c.cpf IS NULL` causando blind spot; removido. Adicionado estado `allOccupiedChapas` + query completa + UI no "Ver ocupados" com nome + empresa.
- **ApproachingAlert (fix):** `fireUmblerFup()` usava `sendUmblerFup` (template) em vez de `startUmblerBot` (bot). Corrigido com lógica D0/D1 igual ao dispatchQueue.
- **MCM-64 (planejamento):** Carteira — múltipla seleção de grupos + empresas avulsas + ocultar/mostrar. Arquitetura: campo `selecionada` na tabela + `grupos_ativos` em settings. Ainda não implementado.
- **Git:** confirmado que o outro computador tinha mudanças locais não commitadas. Regra criada: sempre commitar ao término de cada implementação aprovada.
- **Build:** v0.9.91 compilado e testado. Pushs feitos para `jwijngaardemeuchapa/mcm.git`.
**Files changed:** `src/lib/firestoreQueue.ts`, `src/lib/WatcherContext.tsx`, `src/pages/BIDDashboard.tsx`, `src/components/ApproachingAlert.tsx`
**Next:** Novo build v0.9.91 com todos os fixes (push feito). Implementar MCM-64 (Carteira multi-seleção). Validar queries PG antes de iniciar sync (MCM-58 em andamento).

---

## 2026-06-17 — Planejamento migração banco + arquitetura sync direto PG
**Actor:** Jeremiah | **Agent:** claude
**Tickets:** (planejamento — sem ticket Jira)
**Summary:** Levantamento completo do banco de dados de origem (PostgreSQL — plataforma Antigravity/Meu Chapa). Criado `docs/planejamento_migracao_banco.md` com: schema completo das 25 tabelas SQLite locais, prioridades de migração P0-P3, arquitetura de sync direto (Rust command + Windows Credential Manager + throttle 3min/2x semana), mapeamento campo a campo WorkHeader→tarefas / WorkItem→chapas / User→chapa_registry / User→bid_chapas, confirmação de status e perfis de usuário. Descoberto que as tabelas do banco de origem estão no schema `core_api` (não `public`). Queries da seção 7 precisam ser validadas com o schema correto antes de implementar — **implementação NÃO iniciada**, aguardando validação das queries no banco.
**Files changed:** `docs/planejamento_migracao_banco.md`
**Next:** Usuário precisa rodar as 3 queries de validação (WorkStatus, Profile, tabelas em core_api) e colar resultados. Após confirmação, implementar: `keyring` + `tokio-postgres` no Cargo.toml, comandos Rust de sync, seção de DB credentials em Integrações, throttle no botão Atualizar.

---

## 2026-06-17 — Lead Protocol v2.0.4 scaffold installed
**Actor:** Jeremiah | **Agent:** claude
**Tickets:** (infra — no Jira ticket)
**Summary:** Installed Lead Protocol framework in MCM project. Created `.agents/` directory with CORE_RULES.md, PROJECT_RULES.md, AGENTS_MAP.md, JOURNAL.md, LESSONS.md, decisions.jsonl, sessions/active_sessions.md, and local/jeremiah/claude/handoff.md. Migrated all existing CLAUDE.md content and memory files (user_profile.md, project_mcm.md, feedback_session.md) into the protocol structure. Updated CLAUDE.md to be the Lead Protocol boot pointer while preserving the Jira session-start ritual.
**Files changed:** `.agents/*`, `CLAUDE.md`, `AGENTS.md`, `.gitignore`
**Next:** Commit framework files to git. Continue with any pending Jira tickets.

---

## 2026-06-17 — MCM v0.9.91 — FUP Dashboard, Carteira manual, version bump
**Actor:** Jeremiah | **Agent:** claude
**Tickets:** MCM-53, MCM-54, MCM-55, MCM-56
**Summary:** Four FUP Dashboard improvements: timeline auto-scrolls to "now" on open (MCM-53); task cards minimum 80px wide so confirmados count never clips (MCM-54); "Prioridades de Ação" panel starts collapsed (MCM-55); "Confirmações Automáticas" panel starts collapsed (MCM-56). Added Carteira manual company entry with instruction to match exact name from Meu Chapa dashboard. Bumped version to v0.9.91 in tauri.conf.json and Ajuda.tsx. Tauri build started.
**Files changed:** `src/components/TaskTimeline.tsx`, `src/components/PriorityPanel.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Carteira.tsx`, `src/pages/Ajuda.tsx`, `src-tauri/tauri.conf.json`
**Next:** Distribute v0.9.91 installer.

---

## 2026-06-17 — Firebase Firestore queue replaces axum webhook server
**Actor:** Jeremiah | **Agent:** claude
**Tickets:** MCM-5 (closed)
**Summary:** Replaced non-functional axum HTTP webhook server (port 9988) with Firebase Firestore real-time queue. Vercel receives Umbler webhooks and writes to `messages` collection; desktop app listens via onSnapshot. Phone-based correlation (last 11 digits) replaces bot_id filter. Implemented: firebase.ts (Web SDK singleton + anon auth), firestoreQueue.ts (classifyResponse, processFirestoreMessage with FUP and BID 2-step flow), useFirestoreQueue.ts (onSnapshot hook). Also updated Integracoes.tsx: dispatch+listen test dialog using startUmblerBot with Firestore listener. `.env` added to `.gitignore` (contains JIRA_TOKEN and Supabase keys).
**Files changed:** `src/lib/firebase.ts` (new), `src/lib/firestoreQueue.ts` (new), `src/lib/useFirestoreQueue.ts` (new), `src/pages/Integracoes.tsx`, `src/lib/settings.ts`, `src/lib/WatcherContext.tsx`, `.gitignore`
**Next:** Enable Firebase Anonymous Auth in Firebase Console. Set Firestore rules to `request.auth != null`. Toggle "Recebimento de Respostas (Firebase)" in Integracoes. Test end-to-end with real Umbler dispatch.

---

## 2026-06-19 — Bug fix: recusa via Firebase não sinalizava remoção + Jira MV2

**Actor:** Jeremiah | **Agent:** claude
**Tickets:** MCM-73, MV2-1..8
**Summary:** (1) Criado MCM-73 / MV2-8: persistir resposta_log no Firebase para confiabilidade cross-device. (2) jira.cjs expandido para suportar dois projetos (MCM + MV2) via flag --project; session-start agora exibe ambos. IDs de issue type e status mapeados por projeto. Tickets MV2-1..7 criados (épico + marcos M0–M5); MV2-2 fechado (M0 feito), MV2-3 em andamento (M1). (3) fix(detect_response): has_sim exige frase completa "sim, to nessa" para evitar falso positivo com nomes contendo "nessa" (Vanessa, Odessa). (4) fix principal: handleWebhookEvent no WatcherContext não disparava fup:remove-chapa para recusas via Firebase — o caminho do watcher de notificações Windows tinha o comportamento correto mas o Firebase não. Corrigido: recusa via Firebase agora dispara fup:remove-chapa + toast.warning em vez de toast.success.
**Files changed:** `scripts/jira.cjs`, `src-tauri/src/lib.rs`, `src/lib/WatcherContext.tsx`, `src/lib/useFirestoreQueue.ts`
**Next:** Build v0.9.94 com fixes de hoje. Validar se payload Firestore tem campo de direção (bot vs chapa) para evitar que mensagem enviada pelo bot seja processada como resposta.

---

## 2026-06-23 — Fix BID: chapas alocados visíveis (fuso) + extras não recarregam

**Actor:** Jeremiah | **Agent:** opus
**Tickets:** MCM-78
**Summary:** Dois bugs no BID Dashboard. (1) Detecção de "ocupado" usava DATE(t.data_tarefa); como data_tarefa é gravada com offset -03:00, o SQLite convertia p/ UTC e errava o dia em tarefas após 21h SP (noturnas) → conjunto de ocupados vazio → chapas alocados apareciam como disponíveis. Trocado por substr(t.data_tarefa,1,10) (data SP literal, bate com fmtSP). Além disso byCpf/byName passaram a INCLUIR a própria tarefa (chapa já alocado nela não deve receber novo BID); allOccupied mantém o != ? por ser a lista "outras tarefas". (2) Lista de candidatos só recarregava ao expandir o card (deps do efeito) — extras importados com card já aberto não apareciam. Adicionado estado candReloadKey + listener do evento bid:extras-imported (disparado no onDone do ImportExtrasDialog) que força reload. tsc --noEmit limpo.
**Files changed:** `src/pages/BIDDashboard.tsx`
**Next:** Build v0.9.94 com os fixes acumulados (detect_response, recusa Firebase, e estes dois do BID). Validar em produção com tarefa noturna real.

---

## 2026-06-23 — Build v1.0.1 (bump + instalador)

**Actor:** Jeremiah | **Agent:** opus
**Tickets:** MCM-79
**Summary:** Bump de versão 1.0.0 → 1.0.1 em tauri.conf.json e Ajuda.tsx (badge, changelog, rodapé, módulos). Esclarecido: o repo já estava em 1.0.0 desde a3b69e9 (21/06); o app mostrando "9.94" era build antigo instalado. Build NSIS gerado com sucesso: MCM_1.0.1_x64-setup.exe (216 MB) em src-tauri/target/release/bundle/nsis/. O 1.0.1 carrega os fixes acumulados desde o build 1.0.0 original: detect_response (frase completa, evita falso-positivo "nessa"), recusa via Firebase sinaliza remoção (fup:remove-chapa), e MCM-78 (chapas alocados fuso + extras reload). tsc limpo, build exit 0.
**Files changed:** `src-tauri/tauri.conf.json`, `src/pages/Ajuda.tsx`
**Next:** Distribuir MCM_1.0.1_x64-setup.exe e reinstalar nas máquinas para o app passar a exibir 1.0.1 com os fixes.
