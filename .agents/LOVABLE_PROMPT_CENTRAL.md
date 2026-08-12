# Prompt pro Lovable — MeuChapa Central

> Copiar o conteúdo abaixo (a partir de "## Contexto") direto no chat do
> Lovable pra criar o projeto. Este arquivo fica versionado no MCM
> (`.agents/LOVABLE_PROMPT_CENTRAL.md`) como registro do que foi pedido.

---

## Contexto

Estou construindo o **MeuChapa Central** — uma aplicação web que centraliza
dados hoje espalhados em ~16 instalações locais de um app desktop (MCM,
"MeuChapa Manager", usado por analistas de operação). A Central vai ser a
**única fonte que fala direto com o Metabase e com o Firestore** — os MCMs
locais, num passo futuro (fora do escopo agora), vão parar de consultar essas
fontes direto e passar a ler da Central. Por isso a Central puxa os dados
DELA MESMA pras fontes externas, não espera que ninguém empurre dado pra ela.

Dois módulos na v1:

1. **Dashboard ao vivo** — liderança acompanha confirmações/disparos de BID e
   FUP em tempo real, sem depender de olhar cada máquina local.
2. **Lista de bloqueio BID** — cruza quem nunca converte em disparos de BID
   com o cadastro geral de chapas, pra gerar lista exportável de bloqueio.

## Autenticação e papéis

- Supabase Auth (email/senha é suficiente pra v1).
- Dois papéis: `lideranca` e `analista`. Guardar em uma tabela `profiles`
  (`id` referenciando `auth.users`, `role`, `nome`).
- V1: ambos os papéis conseguem logar e ver as telas. Diferença de permissão
  por papel (ex: só liderança edita configuração de integração) pode ficar
  simples por enquanto — não precisa de RBAC elaborado ainda.

## Identidade visual — usar em TUDO, sem exceção

A marca trocou recentemente de Montserrat pra **Fustat** (Google Fonts:
`https://fonts.google.com/specimen/Fustat`) — é a mudança mais estrutural da
identidade, então a fonte da Central inteira é Fustat.

**Paleta oficial** (não inventar variações, usar exatamente estas):
- `#e5490e` — laranja principal (CTAs, marca, links)
- `#fb7b2f` — laranja claro (hover, glow, gradiente claro)
- `#fb6104` — laranja vivo (ícones, elementos de destaque)
- `#efeee5` — off-white (fundo)
- `#000000` — preto (texto sempre preto, nunca cinza-azulado)

**Regras de uso** (do guia de marca):
- Títulos: SemiBold ou Bold, 14-20pt, letter-spacing sempre -0.02em (a marca
  chama isso de "-20").
- CTAs são sempre botões com sombra.
- Elementos/retângulos em laranja usam luz interna + sombra (10-30% de luz
  indireta), tipo um efeito de profundidade sutil, não flat.
- Gradientes são bem-vindos — o ângulo pode variar entre telas, 135deg é um
  bom padrão.
- Fundo laranja → pode usar elementos pretos por cima pra dar contraste.
  Fundo off-white → elemento laranja claro + borda.

O objetivo visual pedido: telas **bonitas, modernas, com efeitos e
interatividade** — não é só um CRUD burocrático. Pode (e deve) usar
micro-animações, transições suaves, gráficos animados, hover states ricos —
desde que sirvam pra entender o dado mais rápido, não só decoração.

## Módulo 1 — Dashboard ao vivo

Mostra em tempo real (ou near-real-time, refresh de alguns segundos é
aceitável) os eventos que chegam de duas fontes:

**Fonte A — Confirmações/respostas via Firestore.** Já existe um projeto
Firebase público (`fup-webhook-intermediary`) que recebe webhooks da Umbler
Talk (WhatsApp) numa coleção `messages`. Config pública do Firebase Web SDK
(safe embutir no client):
```
apiKey: AIzaSyBPUvqk0CembJ7LBWy0NYZ0fHqAI4kYhCA
authDomain: fup-webhook-intermediary.firebaseapp.com
projectId: fup-webhook-intermediary
storageBucket: fup-webhook-intermediary.firebasestorage.app
messagingSenderId: 366335984881
appId: 1:366335984881:web:45de35e17e6b75aec79550
```
As regras do Firestore exigem Firebase Anonymous Auth (`signInAnonymously`)
antes de conseguir ler — sem isso a leitura falha.

**Importante:** os MCMs locais AINDA consomem e apagam documentos dessa
mesma coleção (`WHERE status == "pending"`, e apagam depois de processar).
A Central deve **ler sem apagar** — é só um observador a mais por enquanto,
pra não quebrar o fluxo que já funciona nas máquinas locais. (Migrar pra
Central-apaga-e-MCM-lê-da-Central é um passo futuro, fora de escopo agora.)

Classificar a resposta recebida em categorias (confirmado / cancelado /
precisa_ajuda / interesse_sim / interesse_nao / não classificado) — a lógica
de classificação já existe e pode ser portada (está em TypeScript, arquivo
`src/lib/firestoreQueue.ts` do MCM, função `classifyResponse`). Posso colar
essa função no Lovable se pedir.

Tela: feed cronológico (mais recente primeiro) com nome do chapa/contato,
telefone, tipo de evento, empresa/tarefa relacionada quando identificável,
horário. Filtro por tipo de evento e por período. Um cabeçalho com
contadores do dia (confirmados, cancelados, sem resposta ainda).

**Fonte B — Disparos por bot (Umbler Talk API).** Endpoint
`GET https://app-utalk.umbler.com/api/v1/bots/flowchart/botinstances/`
(Bearer token da Umbler, vou fornecer depois via variável de ambiente/config
na própria Central — não inventar o token). Parâmetros: `organizationId`,
`botId` (filtra por bot específico), `startUTC`/`endUTC` (período),
`Behavior=CountAllAndGetSlice` (retorna total + página sem precisar paginar
tudo). Cada item retornado tem `botId`, `botTitle`, `createdAtUTC`, `status`
(`Waiting`/`Running`/`Complete`), referência do chat. Endpoint não é
oficialmente estável (uso interno da própria Umbler), mas funciona.

Tela (pode ser a mesma do feed, ou uma aba separada): contagem de disparos
por bot, por dia, com breakdown de status. Ainda não confirmamos qual campo
identifica o analista que disparou — se não achar um campo direto na
resposta desse endpoint, deixar essa quebra por analista como TODO visível
na tela ("em breve") em vez de inventar um campo que não existe.

## Módulo 2 — Lista de bloqueio BID

Cruza duas fontes:

**Fonte A — `leo_cache`:** métricas de resposta a disparos de BID por
telefone (`total_ofertas`, `total_sim`, `pct_sim`, `passa_75pct`, `repete`).
Hoje vem de uma planilha Google Sheets (API oficial do Google Sheets, auth
via Service Account — vou fornecer as credenciais depois). Colunas da
planilha (podem variar levemente, fazer parsing tolerante por nome de
coluna, não por posição): Número/Telefone, total de ofertas, total de
respostas SIM, percentual.

**Fonte B — Cadastro geral de chapas:** vem de uma Question do Metabase
(pergunta uma "pergunta" salva, executada via API do Metabase — vou fornecer
URL da instância + API key depois). Colunas confirmadas num export real:
`Id, Nome do Chapa, Nome da Mãe, CPF, Telefone, Data de Criação, Data
Primeira Tarefa, Data da Última Tarefa, Data do Bloqueio, Bloqueio em tudo?,
[motivo de bloqueio], Tarefas, Situação, ASO, Cidade, Bairro, Estado, Rua,
CEP, Número da Casa, Cadastro, Repositor`. Formato de data:
`"Wednesday, August 12, 2026, 12:10 AM"` (dia da semana + vírgula — fazer
parse tolerante, não confiar em `new Date()` puro nesse formato).

**Tela:** tabela com nome, telefone, cidade, data de cadastro, % de aceite
BID (da fonte A). **Filtro de porcentagem configurável via slider** (não
fixo em 0%) — ex: "mostrar quem tem taxa de aceite abaixo de X%". Filtro
adicional por "cadastro há mais de N dias" (também configurável, padrão 30).
Botão de exportar CSV da lista filtrada (colunas: nome, telefone — é pra
alguém aplicar bloqueio manualmente no admin do sistema principal, a Central
não bloqueia nada automaticamente).

## Sincronização das fontes externas

A Central deve puxar Metabase e Google Sheets **periodicamente** (Supabase
Edge Function agendada via `pg_cron`, ou similar — a cada X minutos/horas,
não em tempo real, essas fontes não mudam tão rápido) e guardar cópia local
em tabelas Supabase (`chapa_registry`, `leo_metrics`). O Firestore (Fonte A
do Dashboard) é o único que precisa ser near-real-time — pode ser client-side
listener direto (`onSnapshot`) já que a config é pública.

## O que NÃO fazer nessa v1

- Não implementar bloqueio automático — só geração de lista pra aplicar
  manualmente em outro sistema.
- Não fazer os MCMs locais lerem da Central ainda — isso é uma migração
  separada, decidida depois que a Central provar valor.
- Não inventar credenciais/tokens/URLs de Metabase ou Umbler — deixar
  campos de configuração vazios/placeholder pra eu preencher depois.
- Não construir RBAC granular — só o suficiente pra diferenciar liderança
  de analista visualmente/funcionalmente quando fizer sentido óbvio.
