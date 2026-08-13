# Backlog — Aplicação Central (Lovable)

Documento vivo sobre uma aplicação SEPARADA deste repo — não é código do MCM.

**Status: EM CONSTRUÇÃO.** Repositório real:
`https://github.com/jwijngaardemeuchapa/central-hub` (criado pelo Lovable a
partir do prompt em `LOVABLE_PROMPT_CENTRAL.md`). Não é mais só backlog —
já existe código rodando lá, com acesso direto via GitHub (mesmo fluxo de
commit/push usado neste repo). Ver `LOVABLE_PROMPT_CENTRAL.md` pro prompt
original e a seção "Estado atual" no fim deste arquivo pro que já foi
implementado versus o que falta.

## Motivação (por que centralizar)

1. **Reduzir chamadas ao Metabase.** Hoje ~16 computadores (uma instalação MCM
   por analista) fazem sync direto no Metabase, cada um puxando as mesmas
   Questions. A central puxaria uma vez só e os MCMs locais sincronizariam
   dela — não do Metabase direto.
2. **Acompanhamento da liderança em tempo real.** A central teria as
   confirmações do Firebase (a mesma fila que hoje alimenta
   `useFirestoreQueue.ts`/`firestoreQueue.ts` nos MCMs locais) já sincronizadas
   — disparos, confirmações, mensagens em grupo — e os MCMs locais
   "espelhariam" isso pro analista ver, ao invés de cada instalação consumir a
   fila raw sozinha.

## Arquitetura — divisão local × nuvem (confirmada com o usuário em 2026-08-12)

Direção do dado confirmada: **a Central é quem fala com Metabase/Firestore/
Sheets** — os MCMs locais, num passo futuro (fora de escopo do v1), passam a
ler da Central em vez de bater direto nessas fontes. Não é o contrário.

- **Nuvem (fonte de verdade), MCM local só lê:** sync do Metabase (cadastro
  geral), sync da planilha do Leo (Sheets), métricas de disparo por bot,
  feed de confirmações (Firestore).
- **Local sempre** (não faz sentido mover — precisa ser instantâneo ou é
  puro estado de UI): clique de enviar mensagem/FUP, estado de tela (seleção,
  composer, scroll), matching/score do BID, undo, notificações desktop.
- **Nuvem também — CONFIRMADO pelo usuário em 2026-08-12** (estava marcado
  como "migra depois, com cuidado" na proposta original; usuário decidiu que
  vale a pena resolver logo): **status real de chapa/tarefa** (confirmado,
  sem resposta, comentários, validações) vira compartilhado na nuvem — o
  motivo explícito foi "analistas podem compartilhar informações do que o
  outro já disparou, confirmou, comentou, validou". Direção do dado aqui é
  diferente do resto: o MCM local GERA o evento (é o analista clicando), e
  empurra pra Central — não é a Central pré-populando do nada. Ainda em
  aberto: isso entra no módulo v1 (dashboard ao vivo) ou é um módulo/fase
  separada? **Não decidido ainda — perguntar antes de desenhar o schema.**
- Ainda não resolvido: como tratar duas máquinas mexendo na mesma
  tarefa/chapa ao mesmo tempo (conflito), uma vez que o status virar
  compartilhado. Não fabricar estratégia de conflito sem discutir.

## Usuário de desenvolvimento + auditoria (pedido em 2026-08-12)

Requisito explícito do usuário: precisa existir um **usuário de
desenvolvimento** com acesso a tudo e a todos (todos os analistas, todas as
empresas, sem filtro de carteira/grupo), e um **log de histórico de TUDO**,
organizado e persistente no banco — não é log que expira ou se apaga, é
histórico permanente de toda mutação relevante (quem fez o quê, quando, valor
antes/depois). Isso entrou no prompt do Lovable (`LOVABLE_PROMPT_CENTRAL.md`)
como papel `dev` (terceiro papel, além de `lideranca`/`analista`) + tabela de
auditoria genérica (trigger em cada tabela relevante, grava em `audit_log`).

## Features já mapeadas pra essa central

### 1. Lista de bloqueio BID — quem nunca converte

**Pedido original:** cruzar quem nunca respondeu SIM a um disparo de BID
(`leo_cache`, sincronizado da planilha do Leo no Google Sheets — ver
`src/pages/AnaliseBase/modules/M_leo.ts`) com o cadastro geral de chapas
(`chapa_registry`, sincronizado do Metabase — ver `sincronizarRegistro` em
`src/lib/metabaseSync.ts`), filtrando só quem tem cadastro de mais de 1 mês,
pra gerar uma lista exportável de bloqueio.

**O que já foi confirmado nessa investigação (2026-08-12):**
- `leo_cache` tem por telefone: `total_ofertas`, `total_sim`, `pct_sim`,
  `passa_75pct`, `repete`.
- `chapa_registry` (fonte='metabase') tem cadastro completo, incluindo quem
  NUNCA trabalhou uma tarefa (`tarefas = 0`) — é diferente da população que o
  `AnaliseBase`/`gerarListas()` (`M7_listas.ts`) classifica, que só enxerga
  quem já tem `tarefas_raw` (histórico local de tarefas trabalhadas). A lista
  "BID — Sem Resposta" que já existe em `M7_listas.ts` NÃO cobre esse caso —
  é outra query, direto em `chapa_registry` × `leo_cache`.
- A Question do Metabase que alimenta `chapa_registry` (card configurado em
  `metabaseRegistroCardId`, aparenta ser a question 1296) **tem uma coluna
  "Data de Criação"** que hoje **não é capturada** pelo parser de
  `sincronizarRegistro` — confirmado via CSV real exportado pelo usuário
  (headers: `Id,Nome do Chapa,Nome da Mãe,CPF,Telefone,Data de Criação,Data
  Primeira Tarefa,Data da Última Tarefa,Data do Bloqueio,Bloqueio em tudo?,...`).
  Formato da data: `"Wednesday, August 12, 2026, 12:10 AM"` (dia da semana +
  vírgula, precisa de parse manual, `new Date()` puro não é confiável nesse
  formato).
  **Pra essa feature funcionar, vai precisar:** (a) migration nova em
  `chapa_registry` pra coluna `data_criacao`, (b) capturar essa coluna em
  `sincronizarRegistro` (regex `/cria[cç][aã]o/i`).
- Critério de "nunca converte" definido pelo usuário: **filtro de
  porcentagem configurável** (não fixo em 0%) — ex. "quem responde uma
  quantidade baixa ou nunca responde". Não é só `total_sim === 0`.
- `chapa_registry.bloqueio`/`motivo_bloqueio` são **somente leitura** (vêm do
  Metabase, refletem o que já está bloqueado no admin do Meu Chapa) — a MCM
  não escreve bloqueio de volta hoje. Então essa feature é sobre **gerar uma
  lista pra alguém aplicar manualmente no admin do Meu Chapa**, mesmo padrão
  do CSV 3C (`exportDisponiveisCsv` em `BIDDashboard.tsx`), não um bloqueio
  automático dentro do app.

### 2. Disparos por analista

Endpoint `GET /v1/bots/flowchart/botinstances/` da Umbler Talk API (mapeado em
2026-08-12, ver JOURNAL v1.0.50) — filtra por `botId` + `startUTC`/`endUTC`,
`Behavior=CountAllAndGetSlice` devolve total sem paginar tudo. Segundo o
usuário, o endpoint (ou os relatórios que ele já usa, arquivo de referência em
`G:\Meu Drive\Utilidades\`) já devolve dados de resposta E de disparo POR
ANALISTA — não confirmado em detalhe ainda qual campo identifica o analista
(provavelmente `sentByOrganizationMember` nas mensagens, ou um campo
equivalente na instância do bot). Precisa validar contra um payload real antes
de desenhar a tela.

### 3. Identidade visual — "visores de tirar o fôlego"

Pedido do usuário (2026-08-12): a central deve ter telas "extremamente
bonitas, interativas, cheias de efeitos, modernas" mas continuar útil
(não só bonita à toa). **A base já foi aplicada no MCM local nesta mesma
data** — reaproveitar direto na central quando ela existir:

- Fonte **Fustat** (trocou Montserrat/IBM Plex Sans — "a mudança mais
  estrutural da identidade" segundo o guia de marca).
- Paleta oficial: `#e5490e` (laranja principal), `#fb7b2f` (laranja claro),
  `#fb6104` (laranja vivo, ícones/destaques), `#efeee5` (off-white),
  `#000000` (texto sempre preto). Convertidos pra HSL em
  `src/index.css` (`--primary`, `--primary-glow`, `--primary-strong`).
  Reaproveitar os MESMOS valores na central, não reconverter do zero.
  **Fonte da verdade:** `G:\...\OneDrive\Meu Chapa\MEUCHAPA_Identidade
  Social.pdf` — guia completo (27 páginas) com regras de CTA (sempre com
  sombra), tratamento de elementos laranja (luz interna 10-30% + sombra),
  variação de ângulo de gradiente permitida, tratamento de fotos
  (sempre ambientadas, roupas laranja).
- Tracking -0.02em em headings (regra "-20" do guia, SemiBold/Bold,
  14-20pt).

### 4. Logos de empresas-cliente

Pedido do usuário: mostrar o logo de cada empresa-cliente (não só a
inicial num círculo colorido, como o MCM faz hoje). Duas opções ainda
não decididas:
1. **Upload manual** — cliente sobe o logo uma vez (provavelmente na
   tela de Carteira/cadastro do cliente), fica salvo e reaproveitado
   em toda a UI que mostra aquela empresa.
2. **Automatizar** — buscar logo automaticamente por algum serviço de
   logo-por-domínio/CNPJ (ex: Clearbit Logo API, Brandfetch, ou scraping
   do site do cliente se tiver URL cadastrada). Precisa avaliar custo/
   confiabilidade antes de decidir — **não escolher fornecedor sem
   validar com o usuário**, pode ter custo por request.

Não fica claro ainda se isso é só pra central ou também vale a pena portar
pro MCM local (ex: no lugar da inicial em círculo no header do
`TaskDetailPanel`, que hoje é só a primeira letra do nome da empresa).
**Perguntar ao usuário no início dessa feature.**

### 5. Sessão de ocorrências (NOVO — 2026-08-12)

Pedido do usuário: "uma sessão de ocorrências, para acompanhamento da
liderança. Talvez tudo atrelado à tarefas. Para ser útil e didático." — ainda
sem detalhamento nenhum (o que conta como ocorrência? quem registra? é
manual ou puxado de algum sync existente?). **Não fabricar schema — perguntar
ao usuário na próxima sessão que tocar nisso.**

### 6. Aba de solicitação de pagamento de tarefa (NOVO — 2026-08-18)

Pedido do usuário, registrar na lista (não implementar ainda). Requisitos
citados:
- ID da tarefa anexado/incluído na solicitação
- Poder selecionar **todos** os ajudantes da tarefa, ou **apenas 1**
- Informações por ajudante: nome, telefone e **valor** (pagamento)

**Decisões já confirmadas com o usuário (2026-08-18):**
- **Fluxo:** o MCM local gera a solicitação e envia pra Central (mesmo
  padrão dos endpoints `/api/public/hooks/*` já existentes, ex:
  `chapa-status.ts`) — fica registrado lá pros gestores verem. Não é a
  Central que gera, é o MCM que empurra.
- **Onde no MCM:** dentro do `TaskDetailPanel.tsx`, junto dos outros botões
  de ação da tarefa (Copiar, FUP Todos etc) — não uma tela separada.
- **Valor:** confirmado que existe no Metabase, mas o usuário não lembra
  qual Question/coluna — **precisa perguntar de novo quando for
  implementar, não presumir que é a mesma Question de tarefas (card 1290).**
  Mesma disciplina de "Data de Criação": pedir export/print da Question
  real antes de escrever qualquer parser.

**Ainda em aberto, não fabricar sem confirmar:**
- Qual Question/coluna do Metabase tem o valor (pendente, ver acima).
- O que a solicitação produz do lado da Central — só um registro pra
  visualização (lista com status solicitado/pago?), ou também dispara algo
  (notificação, export)? Não perguntado ainda.
- Schema da nova tabela na Central (`payment_requests` ou similar) e do
  novo endpoint — desenhar só quando o campo de valor estiver confirmado.

## Estado atual (atualizado 2026-08-18)

**Camada 1 — MIGRADA pra Tarefas e Cadastro Geral.** Pedido explícito do
usuário: "o que estamos movendo pra a central, some das integrações do MCM
e vai para o hub". Implementado nos dois repos no mesmo dia:

- `src/lib/central.ts` (MCM) ganhou `pullTarefasFromCentral()` (monta linhas
  no shape que `ingestTarefas()` já esperava do Metabase — nomes de campo
  já batiam, zero mudança no parser) e `syncRegistroFromCentral()` (grava
  direto em `chapa_registry`, sem o parser de coluna-por-regex antigo).
- `sincronizarMetabase()`/`sincronizarRegistro()` em `metabaseSync.ts`
  mantiveram nome/assinatura, só trocaram a fonte por dentro — todos os
  call sites (`AppStartup.tsx`, `Dashboard.tsx`, `Integracoes.tsx`)
  continuam funcionando sem alteração.
- `Integracoes.tsx`: campos "ID da pergunta" removidos pra Tarefas do dia e
  Cadastro Geral (ficam só na tela de Integrações da Central agora).
  URL/API key do Metabase **continuam no MCM** — ainda usadas pelas 6
  Questions NÃO centralizadas (carteira, endereços, tarefa→endereço,
  chapas 15d, leads regionais, bloqueios do dia).
- **Cuidado que quase passou batido:** os gates de sync automático no boot
  (`AppStartup.tsx`, `hasMetabase`/`hasRegistro`) dependiam de
  `metabaseTarefasCardId`/`metabaseRegistroCardId` estarem configurados
  localmente. Como esses campos saíram da UI, uma instalação nova (sem
  esses valores cacheados de uma sessão antiga) pararia de sincronizar
  tarefas silenciosamente. Corrigido pra sempre tentar (a função já falha
  graciosamente e silenciosa se a Central estiver fora do ar).

**Outras 6 Questions do Metabase continuam direto do MCM local** (carteira,
endereços, tarefa→endereço, chapas 15d, leads regionais, bloqueios do dia)
— não fazem parte desta migração, decisão explícita de escopo (só o que já
tinha sido centralizado no lado da Central: `chapa_registry` e
`tarefas`/`tarefa_chapas`).

Consumo direto da fila Firestore pelo MCM **não mudou** — continua
funcionando em paralelo com o `syncFirestoreStatus()` da Central (que só
lê, nunca apaga documento — ver seção de Camada 3 acima).

**Repositório `central-hub` — já implementado pelo Lovable + eu (acesso
direto via GitHub, mesmo fluxo do MCM):**
- Auth com 3 papéis (`lideranca`/`analista`/`dev`), `profiles`+`user_roles`
- Audit log genérico (trigger em toda tabela relevante) + tela de auditoria
  só pro papel `dev`
- Sync de `chapa_registry` (Metabase, cadastro geral) e `leo_metrics`
  (Google Sheets) — mesmo padrão upsert em `sync.server.ts`
- Sync de `bot_dispatches` (API de bots da Umbler) — quebra por analista
  ainda não implementada (endpoint não confirma o campo, mesma ressalva do
  prompt original)
- Identidade visual aplicada CERTO (Fustat, paleta exata #e5490e/#fb7b2f/
  #fb6104 em oklch)
- Dashboard com feed de mensagens do Firestore + módulo de bloqueio BID
  (leo_metrics × chapa_registry, filtro de % configurável)
- **2026-08-18 — Visão por tarefa** (eu implementei direto no repo, sessão
  de hoje): faltava o conceito central do MCM (tarefa + ajudantes escalados,
  fill rate) — o dashboard só tinha o feed cru de mensagens, sem noção de
  tarefa/empresa. Adicionei `tarefas`+`tarefa_chapas` sincronizadas da MESMA
  Question do Metabase que o MCM local usa (`metabaseTarefasCardId`, uma
  linha por ajudante escalado, agrupa por ID Tarefa igual `ingestTarefas`),
  e uma aba "Visão por tarefa" cruzando com o Firestore por telefone pra dar
  um sinal de confirmação (rotulado "confirmado via Umbler", não fonte
  autoritativa — ver nota abaixo). **Falta o usuário preencher a config
  "Metabase — tarefas do dia" na tela de Integrações (mesma URL/apiKey do
  cadastro geral, cardId diferente — 1290 por padrão no MCM) e clicar em
  Sincronizar antes de aparecer dado.**

**2026-08-18 — Camada 3 IMPLEMENTADA** (pedido explícito do usuário: "os
MCMs também informem quando o analista confirma manualmente" + "quando for
confirmado pelo webhook... a central sincroniza e os MCMs sincronizam com a
central"). Ciclo fechado nos dois repos:

- `tarefa_chapas` ganhou `status_contato`/`status_source`/`status_changed_by`/
  `status_changed_at` (migration `20260818113000_status_compartilhado.sql`).
- Central: novo endpoint `POST /api/public/hooks/chapa-status` (mesmo padrão
  apikey de `sync-sources.ts`) — o MCM chama isso quando o analista confirma/
  cancela manualmente (`status_source='mcm_manual'`). `syncFirestoreStatus()`
  em `sync.server.ts` persiste o sinal do bot da Umbler
  (`status_source='firestore_bot'`, login anônimo + REST API do Firestore
  server-side, já que Edge Function não mantém `onSnapshot`). Nunca sobrescreve
  uma confirmação manual mais recente. `TarefaOverview` agora lê direto da
  tabela em vez de cruzar Firestore no client a cada render.
- MCM: `src/lib/central.ts` — `pushChapaStatusToCentral()` chamado em
  `updateChapaStatus`/`confirmAllPendentes` do `TaskDetailPanel.tsx` (best
  effort, nunca bloqueia a ação local se a Central estiver fora do ar).
  `applyCentralStatusLocally()` roda a cada 60s (mesmo polling de
  `WatcherContext.tsx`), aplica na tabela `chapas` local só quando o status
  atual ainda é `pendente`/`nao_respondeu` — nunca sobrescreve uma ação que o
  próprio analista já fez nessa máquina.
- Credenciais da Central (URL do app `https://central-chapa-nexus.lovable.app`,
  URL/publishable key do Supabase `https://uesgakycmstdhnctdtpc.supabase.co`)
  ficam hardcoded em `src/lib/central.ts` — mesma lógica de `firebase.ts`
  (chave pública, segura de embutir, segurança vem de RLS/apikey do lado de
  lá, não do segredo do valor).

**Ainda em aberto:** conflito de verdade (dois analistas mexendo na mesma
tarefa ao mesmo tempo) não foi testado em produção — a regra "só aplica se
local ainda não é confirmado/cancelado" cobre o caso óbvio, mas não foi
validada com uso real ainda.

**2026-08-18 — Escopo da Camada 3 esclarecido, extensão PAUSADA a pedido do
usuário.** Ele perguntou se todos os analistas já veem disparado/confirmado/
negado de BID e mensagem de cancelamento — resposta foi não, o que está no
ar hoje cobre só **FUP: confirmado/cancelado** (resultado final do chapa na
tarefa). Três lacunas confirmadas, aguardando decisão de testar o que já
existe antes de crescer:

1. **Evento de disparo** (FUP enviado, mensagem de cancelamento enviada) —
   hoje só empurro pra Central quando o status vira confirmado/cancelado,
   nunca no momento do ENVIO. A Central não sabe "fulano recebeu FUP às 14h
   e ainda não respondeu".
2. **BID completo** — vive em `bid_disparos` no MCM local, tabela separada
   de `chapas`/`tarefas`, com estados próprios (`aguardando`/
   `interesse_sim`/`interesse_nao`/`aceita_app`/`nao_aceita_app`/
   `precisa_ajuda`). Não foi tocado — a Central só tem `bot_dispatches`
   (contagem agregada por bot, sem saber QUEM foi negado/aceito).
3. **Canal de cancelamento** — `canal_contato` tipo `umbler_cancelamento*`
   também não é empurrado.

Usuário decidiu: **testar primeiro o ciclo de confirmação/cancelamento FUP
que já está no ar, antes de estender.** Não iniciar a extensão sem sinal
verde explícito — quando vier, provavelmente precisa de: nova tabela
`bid_status` na Central (espelhando `bid_disparos`), push no MCM tanto no
momento do disparo quanto da resposta (não só no resultado final), e
extensão do endpoint `/api/public/hooks/chapa-status` (ou um novo) pra
aceitar eventos de disparo além de status final.

## Mapa geral da Central (planejamento, 2026-08-18 — SÓ DESENHO, NADA IMPLEMENTADO)

Usuário pediu pra montar a estrutura completa antes de continuar
adicionando telas soltas ("vamos montar a estrutura... vamos por partes pra
não virar confusão"). 8 seções mapeadas:

| Seção | Tipo | Status |
|---|---|---|
| **Dashboard Geral** | Overview cross-cutting (tarefas ativas, fill rate médio, confirmações, cancelamentos, ocorrências abertas, disparos de bot) | Já existe (feed Firestore + bot stats), falta reorganizar como overview de verdade |
| **Analistas** | Overview (ranking: disparos, confirmações manuais, ocorrências registradas, última atividade) + Detalhe (linha do tempo por analista, tempo real) | A construir |
| **Tarefas** | Overview (lista/fill rate) + Detalhe (ajudantes + ocorrências MCM + ocorrências Meu Chapa) | Já existe (Visão por Tarefa), falta ocorrências Meu Chapa |
| **Fill Rate** | Tela dedicada, "extremamente didática" (pedido explícito) | A construir |
| **OTIF** | Placeholder "em breve" só — sem dado ainda | A construir (só placeholder) |
| **Métricas/Causas** | Ocorrências agrupadas por empresa / carteira (G1-G7) / tarefa — rastreamento de "por que o atendimento não foi feito" | A construir. **Futuro (não agora): IA gerando insights sobre essas métricas** |
| **Bloqueio BID / Integrações / Auditoria** | Já existem | Sem mudança estrutural |

### Ocorrências — duas fontes distintas, não misturar

| | Ocorrências do MCM | Ocorrências Meu Chapa |
|---|---|---|
| Fonte | `audit_log` da Central (trigger em `tarefa_chapas`) | `WorkExtracts` no Postgres do Meu Chapa (guia: `G:\Meu Drive\Utilidades\guia_estrutura_metabase_meuchapa.md`, seção 9) |
| O que registra | Confirmação/cancelamento feito no MCM ou via bot Umbler | Ocorrência formal registrada por analista na plataforma (44 tipos: No-show, Avaria, Abandono etc.) |
| Já temos? | Sim | Não — precisa de uma Question NOVA no Metabase (join `WorkExtracts`+`OccurrenceTypes`+`Business`+`User`) e tabela nova na Central |
| Campos confirmados no guia | — | `WorkheaderId` (=`id_tarefa`), `OccurrenceTypes.Title` (tipo), `Business.FantasyName`, `Amount` (valor), `CreatedAt`, `OccurrenceStatus` (Aberto/Concluído), `Carrier`, `Notes`, `Nf`, `Reverted`, analista via `ResponsibleId` join `User` filtrado por `ProfileType IN ('Admin','Super')` |

**Dentro do card de tarefa aberto:** seção de ocorrências Meu Chapa carregada
**só sob clique** (lazy load) — pedido explícito do usuário, "acredito que é
muita informação pra ser puxada o tempo todo". Além disso, o usuário quer
(no último estágio de detalhe) o **log de ações do analista dentro do Meu
Chapa** — criação de tarefa, remoção, alocação de chapas, ajuste de valor —
parecido com o `audit_log` do MCM, só que do lado da plataforma principal.
**Essa tabela NÃO está documentada no guia de schema** (só existe `UserLog`,
que é sobre cadastro de chapa, não ações sobre `WorkHeader`). **Não
fabricar nome de tabela — usuário precisa confirmar no Metabase se algo
tipo `WorkHeaderLog`/`%Audit%`/`%History%` existe antes de desenhar essa
parte.**

### Identidade do analista — decidido

**Usar o `User.Id` do próprio Meu Chapa** (o mesmo `ResponsibleId` já
confirmado no guia pra ocorrências, com `ProfileType IN ('Admin','Super')`)
como identificador canônico — reaproveita a lógica que a empresa já usa em
vez de inventar um ID novo. Alternativa aceita: ID do agente na Umbler.
Mapeamento ("nome → ID Meu Chapa / ID Umbler") fica **curado manualmente na
tela de Integrações da Central** pelo usuário — não é algo que o MCM local
descobre sozinho. Hoje `operadorNome` no MCM é texto livre; o mapeamento por
nome na Central é frágil a erro de digitação, mas foi a opção escolhida por
enquanto (sem mudança de código no MCM pra isso).

### Cruzamento com o MCM (o que cada seção da Central precisa do lado local)

| Seção da Central | Depende de mudança no MCM? | Detalhe |
|---|---|---|
| Dashboard Geral | Não | Central já puxa tudo direto |
| Analistas — overview | **Sim, gap** | "Disparos feitos" não é empurrado hoje — Camada 3 só manda status final (confirmado/cancelado), nunca o momento do envio (mesmo gap já registrado acima, "Evento de disparo") |
| Analistas — identidade | Não (resolvido via Integrações da Central) | Ver seção acima |
| Tarefas — ocorrências Meu Chapa | Não | Vem direto do Metabase, sem passar pelo MCM |
| Fill Rate | Sim, indireto | Depende da Camada 3 estar completa — hoje só reflete confirmado/cancelado, não estados intermediários (FUP enviado, aguardando) |
| OTIF | — | Placeholder, sem dado |
| **Métricas/Causas** | **Sim, gap NOVO (não mapeado antes de hoje)** | O motivo real de "não atendido" mora no MCM local: `chapas.motivo_remocao` (quando o analista sinaliza remoção) e `bid_disparos.motivo_nao` (motivos fixos do BID: "Em cima da hora", "Localização da Tarefa", "Valor da Tarefa", "Não uso mais o App", "Outro"). **Nenhum dos dois é empurrado pra Central hoje** — só status, nunca motivo |
| Bloqueio BID / Integrações / Auditoria | Não | Central-only |

**Decisão do usuário (2026-08-18): só registrar esses gaps no backlog por
agora, não implementar nada ainda** (nem o motivo, nem o resto do
planejamento) — o mapeamento completo estava sendo fechado primeiro.
Próximo passo, quando retomar: escolher qual seção detalhar primeiro
(Analistas, Fill Rate ou Métricas/Causas) e desenhar o schema específico
dela antes de codar.

### Motivo de não atendimento — gatilho de detecção (refinado 2026-08-18, 2ª rodada)

**Correção importante de conceito, feita pelo usuário:** o fill rate do MCM
(`confirmedCount / requested`, baseado em `chapas.status_contato='confirmado'`)
**NÃO é o fill rate real da empresa.** O fill rate real — o que interessa pra
"Métricas/Causas" — é baseado em **quantos ajudantes efetivamente
compareceram** na tarefa em andamento ou finalização, que é exatamente a
métrica de Fill Rate já documentada no guia de schema (`WorkItem`/
`WorkHeader.OriginalWorkersQty`, seção 6 do guia) — vem do lado do Meu
Chapa (via Metabase), não do `status_contato` local do MCM. Confirmação no
MCM é um proxy/sinal antecipado, não a métrica de verdade.

**Gatilho de detecção (refinado):** dialog automático (não manual) quando a
tarefa **entra em andamento com MENOS ajudantes do que tinha quando
surgiu/foi lançada** — ou seja, compara o headcount original (na criação da
tarefa) com o headcount real no momento em que ela entra em andamento. Fica
diferente do que eu tinha registrado antes (que comparava com
`confirmedCount` do MCM) — o número certo de comparação é o **real**, vindo
do Meu Chapa.

**"A central pode monitorar isso"** — usuário indicou que a **Central** é
quem tem condição de fazer essa detecção (ela já sincroniza `tarefas` do
Metabase com o headcount original, e pode sincronizar também o headcount
real via `WorkItem` conforme a tarefa progride). Isso muda a arquitetura da
detecção: não é o MCM comparando contra o próprio `confirmedCount` local,
é a Central comparando dado real contra dado real, e então **sinalizando**
de alguma forma pro MCM mostrar o dialog pro analista (autor que sabe o
motivo de verdade) — mesma direção Central→MCM já usada pra status
(`applyCentralStatusLocally`), aplicada a um novo tipo de sinal.

**Motivo: texto livre**, confirmado ("razão do não atendimento").

**Ainda em aberto, não fabricar sem confirmar quando for implementar:**
- Onde o dialog aparece de fato — no MCM (`TaskDetailPanel.tsx`, já que é
  onde o analista trabalha e sabe o motivo real) recebendo um sinal
  "precisa de motivo" da Central via polling (mesmo padrão de
  `applyCentralStatusLocally`)? Ou a Central mostra isso direto pra quem
  estiver overview a tarefa? **Minha leitura é que faz mais sentido no MCM
  — o gestor não sabe o motivo, quem sabe é o analista — mas não foi
  confirmado explicitamente.**
- Precisa de uma nova sincronização Central←Metabase pra trazer o headcount
  REAL em andamento (via `WorkItem`), separado do que já é sincronizado
  hoje (`tarefas.quantidade_chapas`, que é só o pedido original) — é uma
  Question nova do Metabase, não fabricar nome/card sem o usuário
  confirmar.
- Onde o motivo fica salvo — campo em `tarefas` (MCM local, depois empurrado
  pra Central) ou direto numa tabela na Central (já que é a Central quem
  detecta a condição)?
