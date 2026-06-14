# Análise de Clientes — MCM
> Parâmetros, métricas e diretrizes da área `Análise de Base`

---

## 1. Visão Geral

A **Análise de Base** é o módulo de inteligência operacional do MCM. Ela processa o histórico de tarefas de um cliente e transforma dados brutos em diagnóstico acionável: quem são os pilares, quem está em risco de sair, onde está o gargalo de fill rate.

**Entrada:** exportação CSV do dashboard MeuChapa (histórico de FUP) + opcionalmente o CSV de fill rate e a planilha Leo (respostas BID).

**Saída:**
- KPIs do cliente (fill rate, churn, concentração)
- Classificação de cada chapa em 7 categorias
- 9 listas acionáveis prontas para uso
- Heatmap de turnos × dias da semana
- Inteligência BID cruzada com histórico de aceite

---

## 2. Entradas de Dados

### 2.1 CSV Principal (FUP)
Exportação obrigatória. Colunas detectadas automaticamente pelo importador:

| Coluna interna | O que representa |
|---|---|
| `id_tarefa` | Identificador único da tarefa |
| `data_tarefa` | Data/hora da tarefa (ISO ou BR) |
| `empresa` | Nome do cliente |
| `status_tarefa` | Status operacional da tarefa |
| `nome_chapa` | Nome do trabalhador |
| `telefone_chapa` | Telefone (usado para cruzar com BID) |
| `quantidade_chapas` | Vagas solicitadas na tarefa |
| `status_fup` | Status do follow-up de confirmação |

**Status considerados como "atendido"** (para cálculo de fill rate individual):
`finalizado`, `concluído`, `fup confirmado`, `chapa a caminho`, `confirmado`

### 2.2 CSV de Fill Rate (opcional)
Quando carregado, substitui o fill rate calculado individualmente pelo fill rate operacional real da tarefa (vagas solicitadas ÷ vagas preenchidas).

> **Prioridade:** fill rate via CSV > fill rate individual por chapa

### 2.3 Planilha Leo — Respostas BID (opcional)
Google Sheets com histórico de disparos BID. Colunas esperadas:

| Coluna | Descrição |
|---|---|
| `Número` | Telefone normalizado |
| `Resposta` | SIM / NÃO |
| `total de vezes que o número aparece` | Total de ofertas recebidas |
| `total de "SIM" por número` | Ofertas aceitas |
| `percentual de SIM` | Taxa de aceite (0–100%) |
| `marca se passa de 75%` | Flag de alto aceite |

Sincronizado em `Configurações > BID Leo`. Credencial: JSON de Service Account Google.

---

## 3. Janela de Análise

| Parâmetro | Padrão | Configurável |
|---|---|---|
| `janela_dias` | **90 dias** para trás a partir de hoje | Sim (Config.) |

A janela define o período de histórico ativo. Tarefas fora da janela ainda são usadas para calcular `era_pilar_60d` e `era_frequente_60d` (os 60 dias anteriores à janela).

---

## 4. Métricas por Chapa

Calculadas em `M3_metricas.ts` para cada trabalhador identificado no CSV.

### 4.1 Métricas de Volume
| Métrica | Cálculo |
|---|---|
| `total_tarefas` | Contagem de tarefas na janela ativa |
| `total_finalizado` | Tarefas com status "atendido" na janela |
| `total_cancelado` | `total_tarefas - total_finalizado` |

### 4.2 Métricas Temporais
| Métrica | Cálculo |
|---|---|
| `primeira_tarefa` | Data da tarefa mais antiga no histórico completo |
| `ultima_tarefa` | Data da tarefa mais recente |
| `recencia_dias` | Dias desde `ultima_tarefa` até hoje |

### 4.3 Fill Rate Individual
```
fill_rate_individual = total_finalizado / total_tarefas
```
> Representa a **confiabilidade do chapa**: quantas vezes ele compareceu e finalizou das tarefas em que aparece no histórico. *Não confundir com fill rate operacional da tarefa.*

### 4.4 Frequência Semanal
Mediana das contagens de tarefas por semana ao longo da janela ativa.

```
frequencia_semanal = mediana([tarefas por semana na janela])
```

### 4.5 Tendência (`tendencia`)
Regressão linear sobre contagem de tarefas finalizadas por semana nos últimos 60 dias:

| Valor | Critério |
|---|---|
| `subindo` | slope > 0.1 |
| `estavel` | -0.1 ≤ slope ≤ 0.1 |
| `caindo` | slope < -0.1 |

### 4.6 Perfil de Turno (`turno_perfil`)
| Valor | Critério |
|---|---|
| `mono` | Trabalha em apenas 1 turno (≥ 90% das tarefas) |
| `duo` | Distribui entre 2 turnos |
| `multi` | Atua em 3+ turnos |

Turnos definidos em `M2_turnos.ts`:

| Turno | Horário |
|---|---|
| Matinal | 04h–11h |
| Diurno | 11h–15h |
| Vespertino | 15h–20h |
| Noturno | 20h–00h |
| Madrugada | 00h–04h |

### 4.7 Dias Preferidos / Evitados
Dias da semana com maior / menor frequência de aparições nas tarefas da janela.

### 4.8 Histórico dos 60d Anteriores à Janela
Flags usadas exclusivamente para detectar chapas "Em Risco":

| Flag | Critério |
|---|---|
| `era_pilar_60d` | ≥ 10 tarefas · recência < 20 dias · fill ≥ 90% |
| `era_frequente_60d` | ≥ 4 tarefas · recência < 35 dias · fill ≥ 80% |

### 4.9 Concentração (`concentracao_pct`)
Percentual da operação total do cliente representado por aquele chapa. Calculado em `M5_concentracao.ts`.

### 4.10 Métricas Leo BID (`leo`)
Cruzamento com a planilha BID via telefone normalizado:

| Campo | Descrição |
|---|---|
| `total_ofertas` | Quantas vezes recebeu convite BID |
| `total_sim` | Quantas vezes aceitou |
| `pct_sim` | `total_sim / total_ofertas` |
| `passa_75pct` | `pct_sim ≥ 0.75` |
| `repete` | Flag de chapa recorrente |

---

## 5. Score do Chapa

Calculado em `M4_classificacao.ts`. Escala de **0 a 100**.

```
score = fill_rate_individual
      × min(1, frequencia_semanal / meta_semanal)
      × max(0, 1 - recencia_dias / 90)
      × 100
      + bonus_leo
```

**Bônus Leo BID:**

| Condição | Ajuste |
|---|---|
| `passa_75pct = true` | `+round(pct_sim × 15)` (máx +15) |
| `total_ofertas ≥ 3 AND pct_sim < 25%` | `-5` |

> O score é usado para ordenar listas acionáveis, não para classificação de categoria.

---

## 6. Classificação em Categorias

Calculada em `M4_classificacao.ts`. A ordem de prioridade é: **Novo → Pilar → Frequente → Casual → Em Risco → Dormente → Fantasma**.

| Categoria | Cor | Critérios |
|---|---|---|
| 🌱 **Novo** | Laranja primário | Primeira tarefa há ≤ 30 dias |
| 🏆 **Pilar** | Verde | tarefas ≥ 15 · recência < 14 dias · fill ≥ 95% |
| 📈 **Frequente** | Azul | tarefas 5–14 · recência < 30 dias · fill ≥ 85% |
| 🔁 **Casual** | Cinza | tarefas 2–4 · recência < 60 dias |
| ⚠️ **Em Risco** | Amarelo | era pilar/frequente nos 60d anteriores · recência 15–30 dias |
| 💤 **Dormente** | Laranja suave | recência 30–89 dias · histórico ≥ 3 tarefas |
| 👻 **Fantasma** | Cinza escuro | recência ≥ 90 dias *ou* nunca trabalhou de fato |

### 6.1 Limiares Padrão (DEFAULT_LIMIARES)

```
Pilar:
  pilar_min_tarefas    = 15
  pilar_max_recencia   = 14 dias
  pilar_min_fill       = 0.95 (95%)

Frequente:
  frequente_min_tarefas  = 5
  frequente_max_tarefas  = 14
  frequente_max_recencia = 30 dias
  frequente_min_fill     = 0.85 (85%)

Casual:
  casual_min_tarefas  = 2
  casual_max_tarefas  = 4
  casual_max_recencia = 60 dias

Em Risco:
  risco_min_recencia  = 15 dias
  risco_max_recencia  = 30 dias

Dormente:
  dormente_min_recencia  = 30 dias
  dormente_max_recencia  = 89 dias
  dormente_min_historico = 3 tarefas

Fantasma:
  fantasma_min_recencia  = 90 dias

Novo:
  novo_max_dias = 30 dias

Meta semanal (para score e bonificação):
  meta_semanal = 6 tarefas/semana
```

> Todos os limiares são ajustáveis em **Análise de Base → Configurações**.

---

## 7. KPIs do Dashboard

### 7.1 Fill Rate Operacional

```
fill_rate_geral = fill_rate_operacional_csv  (se carregado)
               OU (total_finalizado / total_tarefas_dos_chapas)
```

| Faixa | Severidade |
|---|---|
| ≥ 85% | ✅ Ok |
| 70%–84% | ⚠️ Atenção |
| < 70% | 🔴 Crítico |

> **Fonte preferida:** CSV de Fill Rate com vagas solicitadas × atendidas por tarefa. Sem ele, o MCM usa média individual (menos preciso).

### 7.2 Chapas Pilares
Contagem de chapas na categoria Pilar. Zero pilares = estado crítico.

### 7.3 Concentração Top 5
Percentual da operação nas mãos dos 5 chapas mais frequentes.

| Faixa | Severidade |
|---|---|
| < 40% | ✅ Distribuído |
| 40%–59% | ⚠️ Atenção |
| ≥ 60% | 🔴 Risco de SPOF |

### 7.4 Churn Mensal

```
churn_mensal = 1 - media(retencao_m1_por_cohort)
```

| Faixa | Severidade |
|---|---|
| < 15% | ✅ Ok |
| 15%–29% | ⚠️ Atenção |
| ≥ 30% | 🔴 Crítico |

---

## 8. Análise de Concentração

Calculada em `M5_concentracao.ts`.

### 8.1 Top N
Percentual acumulado da operação pelos N chapas com maior `concentracao_pct`:
- `top5_pct`, `top10_pct`, `top20_pct`

### 8.2 SPOF (Single Point of Failure)
Chapa que responde por mais de **50%** de um turno específico. Alerta vermelho no dashboard quando detectado.

```
spof = chapa que cobre > 50% das vagas de um turno
```

---

## 9. Análise de Cohort

Calculada em `M6_cohort.ts`. Agrupa chapas pelo mês da primeira tarefa.

### 9.1 Retenção por Cohort
Para cada cohort mensal, conta quantos chapas tiveram ao menos 1 tarefa no mês M+1, M+2, M+3.

### 9.2 Churn
```
churn_mensal     = 1 - media(retidos_m1 / novos)   # por todos os cohorts
churn_trimestral = 1 - media(retidos_m3 / novos)   # cohorts com dados M+3
```

### 9.3 Tempo Médio de Vida
```
tempo_medio_vida_dias = media(ultima_tarefa - primeira_tarefa)
                        para chapas com total_tarefas > 1
```

### 9.4 Curva de Aprendizado
| Métrica | Definição |
|---|---|
| `mediana_tarefas_para_casual` | Mediana de tarefas dos chapas Casual/Frequente/Pilar (capped 10) |
| `mediana_tarefas_para_frequente` | Mediana de tarefas dos chapas Frequente/Pilar |

---

## 10. Listas Acionáveis

Geradas em `M7_listas.ts`. São 9 listas, cada uma com um critério de entrada e ação recomendada.

| Lista | Emoji | Critério de Entrada | Ação Recomendada |
|---|---|---|---|
| **Pilares** | 🏆 | categoria = Pilar | Conversa 1:1 — reter |
| **Em Risco** | ⚠️ | categoria = Em Risco | Ligar hoje — janela aberta |
| **Dormentes Recuperáveis** | 💤 | categoria = Dormente **AND** recência ≤ 60 dias | Reativação ativa |
| **Novos** | 🌱 | categoria = Novo | Atribuir padrinho do mesmo turno |
| **Fantasmas** | 👻 | categoria = Fantasma | Limpeza de cadastro |
| **Mono-Turno Órfãos** | ⚡ | turno_perfil = mono **AND** ≤ 3 chapas no turno | Migrar para outro turno |
| **Candidatos à Bonificação** | 🎯 | frequencia 50%–99% da meta semanal | Incentivo pontual |
| **BID — Alto Aceite** | ✅ | `pct_sim ≥ 75%` **AND** `total_ofertas ≥ 2` | Priorizar no próximo BID |
| **BID — Sem Resposta** | 🔕 | `pct_sim < 25%` **AND** `total_ofertas ≥ 3` | Remover da lista BID |

### 10.1 Sugestão de Padrinho
Para chapas **Novos**: o MCM sugere automaticamente um chapa Pilar do mesmo turno principal.

### 10.2 Sugestão de Escala de Contato
Acessível via botão no Dashboard. Agrega os dias preferidos de todos os chapas **Em Risco** e **Dormentes** e ordena os dias da semana por quantidade de chapas disponíveis — indica quando ligar para maximizar contato.

---

## 11. Inteligência BID (Pool × BID × FUP)

Seção que cruza 3 fontes de dados para identificar chapas aprovados que estão fora do radar operacional:

| Grupo | Critério | Ação |
|---|---|---|
| ✅ **Prontos para Alocar** | Aprovados no pool · `pct_sim ≥ 75%` · **não fizeram tarefas no período** | Ligar para alocar |
| 🔕 **Ignorando BID** | Aprovados no pool · `pct_sim < 25%` · recebem convites mas não respondem | Remover da lista BID |
| 📭 **Nunca Contatados via BID** | Aprovados no pool · **sem registro na planilha Leo** | Adicionar à lista BID |

> Exibido apenas quando há dados do Pool de Aprovados (`chapa_registry` / CSV de pool) cruzados com a planilha Leo.

---

## 12. IA Local (Ollama)

O MCM integra um modelo de linguagem local via **Ollama** para dois recursos de texto na tela de Dashboard:

### 12.1 "Foco da Semana" (Âncora 03)
Gera um briefing executivo com base nos dados da análise atual. Estrutura:
- `[PANORAMA]` — situação geral da base (fill rate, categorias)
- `[PRIORIDADE]` — o que fazer esta semana (listas acionáveis principais)
- `[RISCOS]` — alertas críticos (SPOF, churn, Em Risco)

### 12.2 "Comparar com Snapshot Anterior" (Âncora 04)
Compara a análise atual com o snapshot mais recente do mesmo cliente. Gera texto descrevendo o que mudou (melhorou, piorou) entre os períodos.

**Requisitos de IA:**
- Ollama rodando localmente (porta 11434)
- Modelo: configurável em `Configurações → IA Local` (padrão: `llama3.2:3b` ou similar)

---

## 13. Snapshots (Histórico de Análises)

Cada análise pode ser salva como **snapshot** no SQLite local. Campos armazenados:

| Campo | Tipo |
|---|---|
| `id` | UUID |
| `cliente` | Nome do cliente |
| `periodo_inicio` / `periodo_fim` | Datas do CSV analisado |
| `total_tarefas` | Tarefas únicas no período |
| `total_chapas` | Chapas únicos identificados |
| `configuracoes` | JSON dos limiares usados na análise |
| `created_at` | Timestamp da criação |

Snapshots são listados em `Configurações` e na tela de importação. Carregá-los restaura o dashboard sem reprocessar o CSV.

---

## 14. Heatmap de Turnos × Dias

Visualização de volume de tarefas cruzando:
- **Eixo Y:** turnos (Matinal, Diurno, Vespertino, Noturno, Madrugada)
- **Eixo X:** dias da semana (Dom–Sáb)
- **Intensidade da cor:** quantidade de tarefas (mais escuro = mais tarefas)

Útil para identificar gargalos de cobertura por turno e dia.

---

## 15. Diretrizes de Uso

### 15.1 Frequência Recomendada
- **Análise semanal** por cliente ativo — compare com o snapshot da semana anterior.
- **Análise mensal** para revisão de limiares (os thresholds padrão foram calibrados para operações com 50–200 chapas ativos).

### 15.2 Quando Ajustar os Limiares
| Situação | Ajuste Sugerido |
|---|---|
| Operação pequena (< 30 chapas ativos) | Reduzir `pilar_min_tarefas` para 8–10 |
| Sazonalidade alta (cliente com picos) | Ampliar `janela_dias` para 120–180 |
| Cliente com muitos casuais | Aumentar `casual_max_tarefas` para 6–8 |
| Taxa de churn estruturalmente alta | Revisar `dormente_min_historico` |

### 15.3 Interpretação do Fill Rate
- **Fill via CSV** é o indicador oficial — usa vagas solicitadas reais da tarefa.
- **Fill individual** (fallback) superestima se o chapa costuma cancelar perto da hora.
- Se os dois divergirem muito (> 10 pp), verificar qualidade do CSV.

### 15.4 Priorização das Listas
Ordem de urgência operacional:

```
1. SPOF alerts → risco imediato de turno sem cobertura
2. Em Risco → janela de recuperação de 15–30 dias, depois fecha
3. Pilares → reter antes de surgirem problemas
4. Dormentes Recuperáveis → janela até 60 dias
5. Novos → padrinho nos primeiros 30 dias = retenção multiplicada
6. Candidatos à Bonificação → alavanca de engajamento de curto prazo
7. Fantasmas → limpeza de cadastro (não urgente, mas necessária)
```

### 15.5 BID Leo — Qualidade dos Dados
- O cruzamento Leo × FUP usa **telefone normalizado** (apenas dígitos, sem DDI).
- Chapas com telefone em branco no CSV não serão cruzados — garantir qualidade do dado de origem.
- Recomendado sincronizar a planilha Leo **antes** de rodar a análise para garantir dados frescos.

---

## 16. Referência Rápida

```
Janela padrão: 90 dias
Meta semanal padrão: 6 tarefas/semana
Fill rate OK: ≥ 85%
Concentração OK: Top 5 < 40%
Churn OK: < 15% ao mês
SPOF trigger: chapa > 50% de um turno
Leo alto aceite: pct_sim ≥ 75%
Leo sem resposta: pct_sim < 25% com 3+ ofertas
```

---

*Fonte: código `src/pages/AnaliseBase/` — gerado em 07/06/2026*
