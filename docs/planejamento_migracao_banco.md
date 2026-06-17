# Planejamento de Migração do Banco de Dados — FUP Manager (MCM)

> **Criado em:** 2026-06-17  
> **Versão do app:** v0.9.91  
> **Banco:** SQLite (`fupmanager.db`) em WAL mode, localizado em `%APPDATA%\com.fupmanager.app\fupmanager.db`

---

## 1. O Que o App Precisa Para Migrar

Para migrar um usuário (ou instância) para um novo banco de dados — seja numa troca de máquina, backup/restore, migração para servidor compartilhado, ou sincronização entre operadores — os dados abaixo precisam ser extraídos, preservados e reimportados **com integridade total**.

### 1.1 Dados Operacionais Críticos (migrar obrigatoriamente)

| Tabela | O que armazena | Por que é crítico |
|--------|----------------|-------------------|
| `tarefas` | Pedidos de serviço: empresa, data, quantidade de chapas, status, validação | Núcleo do sistema. Sem isso, todo histórico operacional se perde |
| `chapas` | Trabalhadores alocados por tarefa: nome, telefone, CPF, status de contato, presença | Liga trabalhador à tarefa. Necessário para FUP, validação e histórico |
| `fup_log` | Histórico de disparos de follow-up por tarefa | Rastreabilidade de comunicação. Necessário para auditorias |
| `carteira` | Portfólio de empresas clientes | Base de dados de clientes. Referência em todo o sistema |
| `chapa_book` | Cadastro persistente de trabalhadores (além do vínculo por tarefa) | Banco de talentos. Dados construídos ao longo do tempo |
| `bid_chapas` | Trabalhadores candidatos ao BID (sistema de oferta de vaga) | Base do fluxo BID. Perde-se histórico de interesse/disponibilidade |
| `bid_disparos` | Histórico de mensagens enviadas pelo BID por trabalhador/tarefa | Rastreabilidade do BID. Evita reenvio e mostra histórico de resposta |
| `resposta_log` | Respostas recebidas via bots (FUP/BID) | Log de comunicação de entrada. Necessário para auditoria e debug |

### 1.2 Dados de Suporte Importantes (migrar se possível)

| Tabela | O que armazena | Observação |
|--------|----------------|------------|
| `chapa_registry` | Cadastro geral de trabalhadores importado do sistema externo (CPF como PK) | Dados históricos de presença/bloqueio/ASO. Pode ser re-importado da fonte |
| `validacoes_tardias` | Validações de presença retroativas | Dados de auditoria. Importante para histórico de exceções |
| `agenda` | Tarefas do Kanban interno | Dados de gestão interna. Perda impacta produtividade, não operação |
| `cliente_book` | CRM básico de clientes com endereços | Dados construídos manualmente. Importante para continuidade comercial |
| `lembretes` | Lembretes por empresa | Dados menores, mas construídos manualmente |
| `empresa_config` | Configurações por empresa (ex: ocultar do dashboard) | Preferências de operação |
| `analise_snapshots` + `analise_chapas` + `analise_anotacoes` | Snapshots de análise de performance de trabalhadores | Dados históricos de análise. Pode ser recalculado, mas perda significa retrabalho |
| `analise_flags` | Flags/alertas manuais por trabalhador/empresa | Dados inseridos manualmente pelo operador. Não recalculáveis |
| `leo_cache` | Cache de histórico de resposta por número de telefone | Pode ser reconstruído com tempo |

### 1.3 Cache / Dados Descartáveis (não precisam migrar)

| Tabela | Por que pode descartar |
|--------|------------------------|
| `notificacoes_enviadas` | Controle de deduplicação de notificações. Reinicia sem problema |
| `cep_cache` | Cache de geocodificação. Reconstruído automaticamente via API |
| `analise_ai_cache` | Cache de respostas da IA. Reconstruído ao rodar análise novamente |
| `analise_chapas_nome_norm` | Índice normalizado derivado de `analise_chapas`. Recriado automaticamente |
| `leo_config` / `analise_config` | Configurações de módulo. Reconfigurar é simples |

### 1.4 Dados em localStorage (não estão no SQLite)

Além do banco, os seguintes dados vivem no `localStorage` e **precisam ser exportados separadamente**:

| Chave | Conteúdo |
|-------|----------|
| `fup_settings` | Todas as configurações do app (bots, tokens Umbler, Firebase, sons, etc.) |
| `dash_*` | Preferências do dashboard (filtros, colunas visíveis, etc.) |
| `quick_links` | Links rápidos da sidebar |
| `mcm_intro_last_shown` / `mcm_intro_open_count` | Controle de intro screen |

---

## 2. Como o Banco Funciona — Schema Completo

### Migração 1 — Tabelas Principais

```sql
CREATE TABLE tarefas (
  id_tarefa              INTEGER PRIMARY KEY,           -- ID numérico sequencial
  data_tarefa            TEXT NOT NULL,                 -- ISO 8601 com offset -03:00 (SP)
  cidade_uf              TEXT,
  empresa                TEXT NOT NULL,                 -- Nome da empresa (fuzzy match com carteira)
  cnpj                   TEXT,
  status_tarefa          TEXT NOT NULL DEFAULT 'Em Aberto',
    -- Ciclo: 'Em Aberto' → 'Aprovado' → 'Em Análise' → 'Aguardando Início' → 'Em Andamento' → 'Concluído'
  quantidade_chapas      INTEGER NOT NULL DEFAULT 0,
  ativo                  INTEGER NOT NULL DEFAULT 0,    -- 0=inativo, 1=ativo
  is_overnight           INTEGER NOT NULL DEFAULT 0,    -- 1=tarefa noturna
  importado_em           TEXT,                          -- Timestamp da importação CSV/JSON
  observacoes            TEXT,
  observacoes_updated_at TEXT,
  validacao_status       TEXT NOT NULL DEFAULT 'aguardando',
    -- Ciclo: 'aguardando' → 'pendente' → 'validacao_recebida'
  data_validacao_recebida TEXT,
  data_upload_meu_chapa  TEXT,
  obs_validacao          TEXT
);

CREATE TABLE chapas (
  id               TEXT PRIMARY KEY,              -- UUID gerado pelo app
  id_tarefa        INTEGER NOT NULL,              -- FK → tarefas.id_tarefa
  nome_chapa       TEXT,
  telefone_chapa   TEXT,
  cpf              TEXT,
  status_contato   TEXT NOT NULL DEFAULT 'pendente',
    -- Valores: 'pendente', 'confirmado', 'cancelado', 'removido', etc.
  validacao_presenca TEXT,                        -- NULL, 'presente', 'ausente'
  data_validacao   TEXT,
  data_contato     TEXT,
  canal_contato    TEXT,                          -- 'whatsapp', 'ligacao', etc.
  data_remocao     TEXT,
  motivo_remocao   TEXT
);

CREATE TABLE carteira (
  id            TEXT PRIMARY KEY,
  nome_fantasia TEXT NOT NULL UNIQUE,
  cnpj          TEXT,
  grupo         TEXT,                             -- Adicionado na migração 3
  created_at    TEXT NOT NULL DEFAULT ...
);

CREATE TABLE fup_log (
  id          TEXT PRIMARY KEY,
  id_tarefa   INTEGER NOT NULL,                  -- FK → tarefas.id_tarefa
  canal       TEXT NOT NULL,                     -- 'whatsapp', 'ligacao', 'bot', etc.
  data_disparo TEXT NOT NULL DEFAULT ...,
  observacao  TEXT,
  chapa_id    TEXT                               -- FK → chapas.id (adicionado na migração 5)
);

CREATE TABLE notificacoes_enviadas (
  id              TEXT PRIMARY KEY,
  tipo            TEXT NOT NULL,
  id_tarefa       INTEGER,
  referencia_data TEXT NOT NULL
);

CREATE TABLE validacoes_tardias (
  id                       TEXT PRIMARY KEY,
  id_tarefa_retroativa     INTEGER NOT NULL,
  data_tarefa_retroativa   TEXT,
  id_tarefa_original       INTEGER,
  data_tarefa_original     TEXT,
  data_validacao_cliente   TEXT NOT NULL,
  motivo                   TEXT NOT NULL,
  observacao               TEXT,
  empresa                  TEXT,
  registrado_por           TEXT,
  chapas_alocados          TEXT,                  -- JSON array de nomes
  created_at               TEXT NOT NULL DEFAULT ...
);
```

### Migração 2 — Chapa Book & Agenda

```sql
CREATE TABLE chapa_book (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  telefone1     TEXT,
  telefone2     TEXT,
  cpf           TEXT,
  empresas      TEXT,                             -- JSON array de empresas
  grupo         TEXT,
  status_chapa  TEXT NOT NULL DEFAULT 'ativo',   -- 'ativo', 'inativo', 'bloqueado'
  observacoes   TEXT,
  pedidos       TEXT,                             -- JSON array de histórico de pedidos
  created_at    TEXT NOT NULL DEFAULT ...,
  updated_at    TEXT NOT NULL DEFAULT ...
);

CREATE TABLE agenda (
  id                 TEXT PRIMARY KEY,
  titulo             TEXT NOT NULL,
  descricao          TEXT,
  prazo              TEXT,                        -- Data ISO
  importancia        TEXT NOT NULL DEFAULT 'normal', -- 'baixa', 'normal', 'alta', 'urgente'
  status             TEXT NOT NULL DEFAULT 'a_fazer', -- 'a_fazer', 'em_andamento', 'concluido'
  vinculo_tipo       TEXT,                        -- 'chapa', 'empresa', 'tarefa', NULL
  vinculo_chapa_nome TEXT,
  vinculo_chapa_tel  TEXT,
  vinculo_empresa    TEXT,
  vinculo_id_tarefa  INTEGER,
  concluido_em       TEXT,
  created_at         TEXT NOT NULL DEFAULT ...,
  updated_at         TEXT NOT NULL DEFAULT ...
);
```

### Migração 4 — Cliente Book

```sql
CREATE TABLE cliente_book (
  id              TEXT PRIMARY KEY,
  nome            TEXT NOT NULL,
  cnpj            TEXT,
  contato_nome    TEXT,
  telefone        TEXT,
  email           TEXT,
  segmento        TEXT,
  status_cliente  TEXT NOT NULL DEFAULT 'ativo',
  particularidades TEXT,
  exigencias      TEXT,
  pedidos         TEXT,                           -- JSON array
  observacoes     TEXT,
  enderecos       TEXT,                           -- JSON array (adicionado na migração 8)
  created_at      TEXT NOT NULL DEFAULT ...,
  updated_at      TEXT NOT NULL DEFAULT ...
);
```

### Migração 6 — Lembretes

```sql
CREATE TABLE lembretes (
  id             TEXT PRIMARY KEY,
  empresa        TEXT NOT NULL,
  mensagem       TEXT NOT NULL,
  minutos_antes  INTEGER NOT NULL DEFAULT 60,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL
);
```

### Migração 7 — Config de Empresa

```sql
CREATE TABLE empresa_config (
  nome_fantasia      TEXT PRIMARY KEY,
  oculta_dashboard   INTEGER NOT NULL DEFAULT 0
);
```

### Migração 8/9 — BID Tables

```sql
CREATE TABLE bid_chapas (
  id                  TEXT PRIMARY KEY,
  id_usuario          INTEGER,                    -- ID no app Meu Chapa
  nome                TEXT NOT NULL,
  telefone            TEXT,
  lat                 REAL,
  lng                 REAL,
  cidade              TEXT,
  estado              TEXT,
  tarefas_finalizadas INTEGER NOT NULL DEFAULT 0,
  usuario_app         INTEGER NOT NULL DEFAULT 0, -- 1=tem conta no app
  verificacao1        TEXT,                       -- Resultado 1ª verificação
  verificacao2        TEXT,                       -- Resultado 2ª verificação
  status_contato_bid  TEXT,
  importado_em        TEXT NOT NULL DEFAULT ...
);

CREATE TABLE bid_disparos (
  id               TEXT PRIMARY KEY,
  chapa_nome       TEXT NOT NULL,
  chapa_telefone   TEXT NOT NULL,
  id_tarefa        INTEGER,
  empresa          TEXT,
  data_tarefa      TEXT,
  params_json      TEXT,                          -- JSON com parâmetros do disparo
  data_disparo     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'aguardando',
    -- 'aguardando', 'etapa1_enviada', 'interessado', 'nao_interessado', 'aceito', 'precisa_ajuda', etc.
  data_resposta1   TEXT,                          -- Timestamp da resposta à etapa 1 (interesse)
  data_resposta2   TEXT                           -- Timestamp da resposta à etapa 2 (aceite/recusa)
);
```

### Migração 10 — Chapa Registry & CEP Cache

```sql
CREATE TABLE chapa_registry (
  cpf                  TEXT PRIMARY KEY,          -- CPF como identificador único
  nome                 TEXT NOT NULL,
  telefone             TEXT,
  cidade               TEXT,
  bairro               TEXT,
  estado               TEXT,
  rua                  TEXT,
  cep                  TEXT,
  numero               TEXT,
  tarefas              INTEGER NOT NULL DEFAULT 0,
  data_primeira_tarefa TEXT,
  data_ultima_tarefa   TEXT,
  situacao             TEXT,                      -- Status no sistema externo
  bloqueio             TEXT,                      -- Tipo de bloqueio se houver
  motivo_bloqueio      TEXT,
  aso                  TEXT,                      -- Atestado de Saúde Ocupacional
  importado_em         TEXT NOT NULL DEFAULT ...
);

CREATE TABLE cep_cache (
  cep             TEXT PRIMARY KEY,
  lat             REAL,
  lng             REAL,
  geocodificado_em TEXT NOT NULL
);
```

### Migração 11 — Análise de Performance

```sql
CREATE TABLE analise_snapshots (
  id             TEXT PRIMARY KEY,
  cliente        TEXT NOT NULL,
  periodo_inicio TEXT NOT NULL,
  periodo_fim    TEXT NOT NULL,
  total_tarefas  INTEGER NOT NULL DEFAULT 0,
  total_chapas   INTEGER NOT NULL DEFAULT 0,
  configuracoes  TEXT,                            -- JSON de configurações usadas no cálculo
  created_at     TEXT NOT NULL DEFAULT ...
);

CREATE TABLE analise_chapas (
  id                   TEXT PRIMARY KEY,
  snapshot_id          TEXT NOT NULL REFERENCES analise_snapshots(id) ON DELETE CASCADE,
  nome                 TEXT NOT NULL,
  telefone             TEXT,
  cpf                  TEXT,
  categoria            TEXT NOT NULL,             -- 'estrela', 'regular', 'irregular', 'risco'
  score                REAL NOT NULL DEFAULT 0,
  total_finalizado     INTEGER NOT NULL DEFAULT 0,
  total_cancelado      INTEGER NOT NULL DEFAULT 0,
  recencia_dias        INTEGER,
  frequencia_semanal   REAL,
  fill_rate_individual REAL,
  turno_perfil         TEXT,
  tendencia            TEXT,                      -- 'subindo', 'estavel', 'caindo'
  metricas_json        TEXT                       -- JSON com métricas detalhadas
);

CREATE TABLE analise_anotacoes (
  id           TEXT PRIMARY KEY,
  chapa_nome   TEXT NOT NULL,
  snapshot_id  TEXT NOT NULL REFERENCES analise_snapshots(id) ON DELETE CASCADE,
  texto        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT ...
);

CREATE TABLE analise_config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
```

### Migração 12 — Flags, AI Cache, Léo

```sql
CREATE TABLE analise_flags (
  id         TEXT PRIMARY KEY,
  chapa_nome TEXT NOT NULL,
  empresa    TEXT NOT NULL,
  flag       TEXT NOT NULL,                       -- 'positivo', 'atencao', 'bloqueio', etc.
  nota       TEXT,
  created_at TEXT NOT NULL DEFAULT ...
);

CREATE TABLE analise_ai_cache (
  id         TEXT PRIMARY KEY,
  ancora     TEXT NOT NULL,                       -- Âncora de contexto
  input_hash TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ...
);

CREATE TABLE leo_config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE leo_cache (
  numero          TEXT PRIMARY KEY,               -- Número de telefone
  total_ofertas   INTEGER NOT NULL DEFAULT 0,
  total_sim       INTEGER NOT NULL DEFAULT 0,
  pct_sim         REAL NOT NULL DEFAULT 0,
  passa_75pct     INTEGER NOT NULL DEFAULT 0,     -- 1=passa filtro de 75% aceitação
  repete          INTEGER NOT NULL DEFAULT 0,     -- 1=repete o mesmo número
  atualizado_em   TEXT NOT NULL DEFAULT ...
);

CREATE TABLE analise_chapas_nome_norm (
  snapshot_id TEXT NOT NULL,
  nome_norm   TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, nome_norm),
  FOREIGN KEY (snapshot_id) REFERENCES analise_snapshots(id) ON DELETE CASCADE
);
```

### Migração 13 — Log de Respostas

```sql
CREATE TABLE resposta_log (
  id             TEXT PRIMARY KEY,
  tipo           TEXT NOT NULL,                   -- 'fup', 'bid'
  chapa_nome     TEXT NOT NULL,
  chapa_telefone TEXT,
  resposta       TEXT NOT NULL,                   -- Conteúdo da resposta do bot
  id_tarefa      INTEGER,
  empresa        TEXT,
  data_tarefa    TEXT,
  disparo_id     TEXT,                            -- FK → bid_disparos.id (se BID)
  fonte          TEXT NOT NULL DEFAULT 'webhook', -- 'webhook', 'firebase', 'manual'
  message_body   TEXT,                            -- Corpo bruto da mensagem recebida
  received_at    TEXT NOT NULL DEFAULT ...
);
```

---

## 3. Relacionamentos Chave

```
tarefas (id_tarefa)
  ├── chapas.id_tarefa           (1:N — trabalhadores da tarefa)
  ├── fup_log.id_tarefa          (1:N — histórico de FUP)
  ├── bid_disparos.id_tarefa     (1:N — disparos BID para esta tarefa)
  ├── resposta_log.id_tarefa     (1:N — respostas recebidas)
  ├── notificacoes_enviadas.id_tarefa (1:N)
  └── agenda.vinculo_id_tarefa   (1:N — tarefas do kanban vinculadas)

chapas.id
  └── fup_log.chapa_id           (1:N — FUPs enviados para este chapa)

analise_snapshots (id)
  ├── analise_chapas.snapshot_id (1:N ON DELETE CASCADE)
  ├── analise_anotacoes.snapshot_id (1:N ON DELETE CASCADE)
  └── analise_chapas_nome_norm.snapshot_id (1:N ON DELETE CASCADE)
```

---

## 4. Prioridade de Migração

| Prioridade | Tabelas | Estratégia |
|------------|---------|------------|
| **P0 — Bloqueia operação** | `tarefas`, `chapas`, `fup_log`, `carteira` | Migrar primeiro. Sem esses dados, o app não funciona. |
| **P1 — Impacta fortemente** | `chapa_book`, `bid_chapas`, `bid_disparos`, `resposta_log`, `validacoes_tardias` | Migrar junto se possível. Perda impacta operação BID e auditoria. |
| **P2 — Importante mas recuperável** | `chapa_registry`, `cliente_book`, `agenda`, `lembretes`, `empresa_config`, `analise_snapshots`, `analise_chapas`, `analise_anotacoes`, `analise_flags` | Migrar se bandwidth permitir. Dados podem ser reinseridos manualmente ou recalculados. |
| **P3 — Descartável** | `notificacoes_enviadas`, `cep_cache`, `analise_ai_cache`, `analise_chapas_nome_norm`, `leo_config`, `leo_cache` | Não migrar. Recriados automaticamente. |

---

## 5. Método de Extração Atual

O app já possui o comando Tauri `export_db_base64` (registrado em `lib.rs`) que exporta o arquivo `.db` inteiro como base64. Isso permite:

1. **Backup completo**: exportar o arquivo `.db` e reimportar com `import_db_base64`
2. **Migração entre máquinas**: export → transfer → import na nova máquina

Para uma migração **seletiva** (ex: sincronizar apenas tarefas entre instâncias), seria necessário implementar exportação por tabela/período — ainda não existe no app.

---

## 6. Arquitetura de Sincronização Direta com o Banco de Origem

### Contexto

Atualmente o fluxo de dados é:
```
Banco original → Metabase (exportação manual) → arquivo CSV/XLSX → importação no app
```

O objetivo é substituir por:
```
Banco original → sync automático no Rust (Tauri command) → SQLite local
```

O SQLite local **permanece como banco operacional**. A conexão com o banco de origem é somente leitura — os dados são lidos de lá e escritos no SQLite local via upsert.

### Tabelas a Sincronizar

| Tabela local | Frequência | Gatilho |
|---|---|---|
| `tarefas` | Max 1x/3min | Ao abrir o app + botão "Atualizar" |
| `chapas` | Max 1x/3min | Junto com tarefas |
| `chapa_registry` | Max 2x/semana | Ao abrir o app (verifica último sync) |

### Comportamento do Botão "Atualizar"

O botão "Atualizar" no Dashboard (Dashboard.tsx:1032) atualmente apenas relê o SQLite local (`load(true)`). Precisa ser expandido:

1. **Verificar throttle**: ler `localStorage.getItem("mcm_sync_last")` — se `Date.now() - last < 3 * 60 * 1000` (3 min), pular sync e só relê local
2. **Chamar comando Tauri**: `invoke("sync_from_source")` que conecta ao banco de origem e faz upsert no SQLite local
3. **Atualizar timestamp**: `localStorage.setItem("mcm_sync_last", Date.now().toString())`
4. **Re-ler SQLite local**: o `load()` já existente roda normalmente após o sync

Para `chapa_registry`:
- Chave: `mcm_sync_registry_last` (timestamp)
- Throttle: `Date.now() - last < 3.5 * 24 * 60 * 60 * 1000` (3.5 dias → max 2x/semana)
- Disparado apenas na abertura do app, não no botão "Atualizar"

### Estrutura do Comando Tauri (Rust)

```rust
// src-tauri/src/lib.rs
#[tauri::command]
async fn sync_from_source(app: tauri::AppHandle) -> Result<SyncResult, String> {
    // 1. Ler credenciais do banco de origem das configurações do app
    //    (armazenadas em app_data_dir/sync_config.json — nunca em localStorage por segurança)
    let config = read_sync_config(&app)?;

    // 2. Conectar ao banco de origem (driver depende do tipo: PostgreSQL, MySQL, etc.)
    let remote = connect_remote(&config).await?;

    // 3. Executar queries mapeadas (ver seção 7)
    let tarefas = remote.fetch_tarefas().await?;
    let chapas  = remote.fetch_chapas().await?;

    // 4. Abrir SQLite local e fazer upsert
    let local_db = open_local_db(&app)?;
    upsert_tarefas(&local_db, tarefas)?;
    upsert_chapas(&local_db, chapas)?;

    Ok(SyncResult { tarefas_synced: ..., chapas_synced: ... })
}

#[tauri::command]
async fn sync_registry_from_source(app: tauri::AppHandle) -> Result<SyncResult, String> {
    // Mesmo padrão, mas para chapa_registry (tabela maior, menos frequente)
}
```

### Configuração de Conexão

As credenciais do banco de origem **não devem ficar em localStorage** (visível via DevTools). Devem ser armazenadas em:
```
%APPDATA%\com.fupmanager.app\sync_config.json
```

Acessado apenas pelo processo Rust, nunca exposto ao WebView. Estrutura:
```json
{
  "host": "...",
  "port": 5432,
  "database": "...",
  "user": "...",
  "password": "...",
  "db_type": "postgresql"
}
```

A página de Integrações (Integracoes.tsx) receberá uma nova seção para configurar esta conexão. O comando `save_sync_config` escreverá no arquivo diretamente via Rust.

### Dependências Rust a Adicionar (após confirmar tipo do banco)

| Banco | Crate |
|-------|-------|
| PostgreSQL | `tokio-postgres` ou `sqlx` com feature `postgres` |
| MySQL/MariaDB | `sqlx` com feature `mysql` |
| MS SQL Server | `tiberius` |

> **Próximo passo**: identificar o tipo do banco e o schema das tabelas de origem na máquina com Antigravity. Com isso, escrever o mapeamento de campos (seção 7).

---

## 7. Mapeamento de Campos — Banco Origem (PostgreSQL) → SQLite Local

> **Banco de origem confirmado**: PostgreSQL (plataforma Antigravity / Meu Chapa)  
> **Driver Rust a usar**: `sqlx` com feature `postgres` (ou `tokio-postgres`)

---

### 7.1 `tarefas` ← `WorkHeader` + JOIN `Business` + JOIN `Address`

Query de origem:
```sql
SELECT
  wh."Id"                                    AS id_tarefa,
  wh."TaskDate"                              AS data_tarefa,
  CONCAT(a."City", '/', a."State")           AS cidade_uf,
  b."FantasyName"                            AS empresa,
  b."DocumentNumber"                         AS cnpj,
  wh."IdWorkStatus"::text                    AS status_tarefa,
  wh."WorkersQty"                            AS quantidade_chapas,
  CASE WHEN wh."IsFinished" THEN 0 ELSE 1 END AS ativo,
  wh."Obs"                                   AS observacoes,
  wh."TaskEndDate"                           AS data_tarefa_fim,
  wh."CreateDate"                            AS importado_em
FROM "WorkHeader" wh
JOIN "Business" b ON b."Id" = wh."IdBusiness"
LEFT JOIN "Address" a ON a."Id" = wh."IdTaskAddress"
WHERE wh."TaskDate" >= NOW() - INTERVAL '90 days'  -- ajustar conforme necessidade
ORDER BY wh."TaskDate" DESC
```

Mapeamento de colunas:

| PG (`WorkHeader`) | SQLite (`tarefas`) | Tipo SQLite | Obs |
|---|---|---|---|
| `Id` (bigint) | `id_tarefa` | INTEGER | PK |
| `TaskDate` (timestamp) | `data_tarefa` | TEXT ISO-8601 | Converter para `-03:00` |
| `City`/`State` (via Address) | `cidade_uf` | TEXT | `"São Paulo/SP"` |
| `Business.FantasyName` | `empresa` | TEXT | Via JOIN |
| `Business.DocumentNumber` | `cnpj` | TEXT | Via JOIN |
| `IdWorkStatus` (int/text) | `status_tarefa` | TEXT | Ver mapeamento abaixo |
| `WorkersQty` | `quantidade_chapas` | INTEGER | |
| `IsFinished` | `ativo` | INTEGER | 0 se finalizado, 1 caso contrário |
| `Obs` | `observacoes` | TEXT | |
| `CreateDate` | `importado_em` | TEXT | Timestamp do registro original |

**Mapeamento de `IdWorkStatus` → `status_tarefa`:**
> Os valores exatos de `WorkStatus.Description` precisam ser confirmados no banco.  
> Provável: `1=Em Aberto`, `2=Em Andamento`, `3=Finalizado`, `4=Cancelado`

---

### 7.2 `chapas` ← `WorkItem` + JOIN `User`

Query de origem:
```sql
SELECT
  wi."Code"::text                            AS id,
  wi."IdWorkHeader"                          AS id_tarefa,
  CONCAT(u."FirstName", ' ', u."LastName")   AS nome_chapa,
  u."Phone"                                  AS telefone_chapa,
  u."DocumentNumber"                         AS cpf,
  wi."IdWorkStatus"::text                    AS status_contato,
  wi."TaskAcceptance"                        AS task_acceptance,
  wi."CreateDate"                            AS data_contato
FROM "WorkItem" wi
LEFT JOIN "User" u ON u."Id" = wi."IdUser"
WHERE wi."IdWorkHeader" IN (/* ids das tarefas sincronizadas */)
```

Mapeamento de colunas:

| PG (`WorkItem`) | SQLite (`chapas`) | Tipo SQLite | Obs |
|---|---|---|---|
| `Code` (uuid) | `id` | TEXT | UUID → string |
| `IdWorkHeader` | `id_tarefa` | INTEGER | FK → tarefas |
| `User.FirstName + LastName` | `nome_chapa` | TEXT | Concatenar |
| `User.Phone` | `telefone_chapa` | TEXT | |
| `User.DocumentNumber` | `cpf` | TEXT | CPF do trabalhador |
| `IdWorkStatus` | `status_contato` | TEXT | Ver mapeamento |
| `TaskAcceptance` | `validacao_presenca` | TEXT | Mapear para `presente`/`ausente` |
| `CreateDate` | `data_contato` | TEXT | |

**Mapeamento de `TaskAcceptance` → `validacao_presenca`:**
- `"Accepted"` → `"presente"`
- `"Rejected"` / `"Canceled"` → `"ausente"`
- `null` → `null`

---

### 7.3 `chapa_registry` ← `User` + JOIN `Address`

Tabela mais pesada — sincronizar 2x/semana. Query filtra apenas usuários chapa (Profile = trabalhador).

```sql
SELECT
  u."DocumentNumber"                         AS cpf,
  CONCAT(u."FirstName", ' ', u."LastName")   AS nome,
  u."Phone"                                  AS telefone,
  a."City"                                   AS cidade,
  a."Neighborhood"                           AS bairro,
  a."State"                                  AS estado,
  a."Street"                                 AS rua,
  a."ZipCode"                                AS cep,
  a."Number"                                 AS numero,
  u."ASO"                                    AS aso,
  CASE WHEN u."IsActive" THEN 'ativo' ELSE 'inativo' END AS situacao,
  CASE WHEN bl."Id" IS NOT NULL THEN 'bloqueado' ELSE NULL END AS bloqueio,
  bl_reason."Description"                    AS motivo_bloqueio,
  u."CreateDate"                             AS importado_em
FROM "User" u
LEFT JOIN "Address" a ON a."Id" = u."IdAddress"
LEFT JOIN "Blacklist" bl ON bl."IdUser" = u."Id" AND bl."IsBlockAllBusiness" = true
LEFT JOIN "BlacklistReason" bl_reason ON bl_reason."Id" = bl."IdBlacklistReason"
WHERE u."IsDeleted" = false
  AND u."Profile" = 3  -- ajustar conforme valor do perfil "chapa" no sistema
ORDER BY u."Id"
```

Mapeamento de colunas:

| PG (`User`) | SQLite (`chapa_registry`) | Tipo SQLite | Obs |
|---|---|---|---|
| `DocumentNumber` | `cpf` | TEXT | **PK** |
| `FirstName + LastName` | `nome` | TEXT | |
| `Phone` | `telefone` | TEXT | |
| `Address.City` | `cidade` | TEXT | |
| `Address.Neighborhood` | `bairro` | TEXT | |
| `Address.State` | `estado` | TEXT | |
| `Address.Street` | `rua` | TEXT | |
| `Address.ZipCode` | `cep` | TEXT | |
| `Address.Number` | `numero` | TEXT | |
| `ASO` | `aso` | TEXT | Atestado de saúde |
| `IsActive` | `situacao` | TEXT | `'ativo'`/`'inativo'` |
| `Blacklist` (join) | `bloqueio` | TEXT | `'bloqueado'` se tiver registro |
| `BlacklistReason.Description` | `motivo_bloqueio` | TEXT | |
| `IsMobileAppUser` | — | — | Usado em `bid_chapas.usuario_app` |

---

### 7.4 `bid_chapas` ← `User` + JOIN `Address`

Mesma origem que `chapa_registry`. A diferença é o escopo e campos adicionais de localização.

```sql
SELECT
  u."Id"                                     AS id_usuario,
  CONCAT(u."FirstName", ' ', u."LastName")   AS nome,
  u."Phone"                                  AS telefone,
  a."Latitude"                               AS lat,
  a."Longitude"                              AS lng,
  a."City"                                   AS cidade,
  a."State"                                  AS estado,
  u."IsMobileAppUser"                        AS usuario_app,
  u."BackgroundCheckN1"                      AS verificacao1,
  u."BackgroundCheckN2"                      AS verificacao2,
  u."CreateDate"                             AS importado_em
FROM "User" u
LEFT JOIN "Address" a ON a."Id" = u."IdAddress"
WHERE u."IsDeleted" = false
  AND u."Profile" = 3
  AND u."IsActive" = true
```

Mapeamento de colunas:

| PG (`User`) | SQLite (`bid_chapas`) | Tipo SQLite | Obs |
|---|---|---|---|
| `Id` | `id_usuario` | INTEGER | ID no sistema original |
| `FirstName + LastName` | `nome` | TEXT | |
| `Phone` | `telefone` | TEXT | |
| `Address.Latitude` | `lat` | REAL | |
| `Address.Longitude` | `lng` | REAL | |
| `Address.City` | `cidade` | TEXT | |
| `Address.State` | `estado` | TEXT | |
| `IsMobileAppUser` | `usuario_app` | INTEGER | 1=tem app |
| `BackgroundCheckN1` | `verificacao1` | TEXT | |
| `BackgroundCheckN2` | `verificacao2` | TEXT | |
| (gerado) | `id` | TEXT | UUID gerado no upsert |
| `CreateDate` | `importado_em` | TEXT | |

---

### 7.5 `carteira` ← `Business`

Não sincronizada automaticamente (dados mantidos manualmente no app). Pode ser feita uma importação inicial única.

```sql
SELECT
  "FantasyName"   AS nome_fantasia,
  "DocumentNumber" AS cnpj
FROM "Business"
WHERE "IsDeleted" = false AND "IsActive" = true
ORDER BY "FantasyName"
```

---

### 7.6 Pontos a Confirmar

| Item | Pergunta |
|---|---|
| `User.Profile` | Qual o valor numérico do perfil "chapa" (trabalhador)? |
| `WorkHeader.IdWorkStatus` | Quais os IDs e descrições de cada status? |
| `WorkItem.IdWorkStatus` | Mesma tabela de status ou outra? |
| Latitude/Longitude | Estão em `Address` ou em outra tabela? (o schema mostra ambas) |
| Filtro de datas | Quantos dias de histórico sincronizar em `WorkHeader`? |
| Acesso de rede | O banco PostgreSQL é acessível via IP público ou só via VPN/rede local? |

---

## 8. Considerações Para Migração Multi-Operador (MCM-42)

Se o objetivo é sincronizar dados entre múltiplos operadores via Supabase:

- **Conflito de PK**: `tarefas.id_tarefa` é `INTEGER PRIMARY KEY` autoincrement local. Em multi-operador, dois dispositivos podem gerar o mesmo `id_tarefa`. Seria necessário migrar para UUID ou usar `device_id + local_id` como chave composta.
- **Chapas**: PK já é UUID (`id TEXT PRIMARY KEY`) — seguro para multi-operador.
- **Timestamps**: todos usam ISO com timezone fixo SP (-03:00). Consistente entre operadores.
- **Conflito de dados**: sem campo `updated_at` em `tarefas` — impossível determinar qual versão é mais recente em caso de conflito. Precisaria adicionar coluna.
- **Carteira**: `nome_fantasia UNIQUE` — conflito se dois operadores cadastram a mesma empresa com grafia ligeiramente diferente.
