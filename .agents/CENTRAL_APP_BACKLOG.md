# Backlog — Aplicação Central (Lovable)

Documento vivo. Não é código, não é o MCM em si — é o levantamento de requisitos
pra uma futura aplicação separada (proposta em 2026-08-12) que centralizaria o
que hoje cada instalação local do MCM faz sozinha. **Nada disso foi construído
ainda** — é backlog pra quando a decisão de arquitetura for tomada.

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

## Perguntas de arquitetura em aberto (não decidir sem discutir)

- A central vira fonte de verdade (os MCMs locais só leem dela) ou só espelha
  (cada MCM local ainda é dono do seu próprio dado, a central é read-only
  agregado)? Isso muda toda a estratégia de sync/conflito.
- Como resolver duas máquinas mexendo na mesma tarefa/chapa ao mesmo tempo?
- Autenticação/isolamento por analista.
- Vale começar pequeno (só 1-2 telas na central, sem migrar sync do Metabase/
  Firebase ainda) pra validar a ideia antes de comprometer semanas na
  arquitetura completa? (Foi a sugestão feita e não respondida ainda — decisão
  de escopo do primeiro incremento segue em aberto.)

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

## Estado atual (não mexer sem essa decisão)

Nada disso foi implementado. O MCM local continua com sync direto no
Metabase e consumo direto da fila Firestore, como sempre foi. Este documento
existe só pra não perder o levantamento entre sessões.
