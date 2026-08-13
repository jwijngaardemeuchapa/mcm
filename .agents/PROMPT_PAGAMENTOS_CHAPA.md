# Prompt — pra levar no outro sistema, sobre pagamentos por tarefa

> Copiar a partir daqui e colar na conversa com a outra IA/sistema que já
> mapeou isso (a que gerou a query de referência "análise_pagamentos_suporte"
> mencionada no guia de schema do Meu Chapa).

---

Estou construindo uma tela na MeuChapa Central que mostra, por tarefa,
quanto cada ajudante (chapa) recebeu e quando foi pago. Já tenho um
mapeamento parcial da tabela `FinancialTransaction` (schema `core_api`,
Postgres via Metabase) documentado assim:

```
FinancialTransaction
- Id (PK)
- IdWorkHeader (FK WorkHeader, nullable — só preenchido na linha "tarefa")
- IdParent (auto-referência — liga a linha de tarefa à linha "envelope" de remessa bancária)
- IdTransactionTed (Id da transferência bancária/TED — aparece na linha envelope)
- IdRequestPayment (Id da solicitação de pagamento)
- DateSentToBank (quando foi enviado ao banco)
- SentToBank (bool — sempre true nas amostras vistas, não confirmado se existe false pendente)
- FullName (nome de quem recebe — chapa ou, às vezes, empresa/CNPJ)
- DocumentNumber (CPF/CNPJ, mascarado no export)
- IdWorkItem (FK WorkItem, nullable — só preenchido junto com IdWorkHeader)
- IdUser (FK User — o chapa/empresa que recebe)
- TaskPrice (valor com fator de escala 100 — ex: 22000 no export = R$ 220,00)
- CreatedDate
```

**Já confirmado (query local, 22.143 linhas exportadas, fora do Metabase):**
cada remessa bancária gera uma linha "envelope" (`IdTransactionTed`/
`IdRequestPayment` preenchidos, `IdWorkHeader` nulo) e uma ou mais linhas
"filhas" (`IdParent` apontando pro envelope, `IdWorkHeader`/`IdWorkItem`
preenchidos). Testei somar só as linhas com `IdWorkHeader IS NOT NULL`
(sem nem tocar no valor do envelope) e bateu ~97% com os envelopes na
mesma janela de 30 dias — os 3% de diferença eram só filhos fora da janela
de data, não erro estrutural.

## O que preciso confirmar/entender melhor com vocês

1. **Vocês já têm uma tela/query pronta que mostra "quanto esse chapa
   recebeu" ou "quanto vai receber" por tarefa específica?** Se sim, qual é
   a lógica exata — usam a mesma abordagem de somar só `IdWorkHeader IS NOT
   NULL`, ou fazem diferente?
2. **Como vocês distinguem "já pago" de "pendente de pagamento"?** A coluna
   `SentToBank` nas minhas amostras sempre veio `true` — vocês já viram
   `false`? Existe outro campo que indica status de pagamento (pago,
   processando, pendente, erro)?
3. **`IdRequestPayment`** — é uma tabela separada (`RequestPayment` ou
   similar) que dá mais contexto de quem solicitou o pagamento e quando?
   Temos interesse nisso especificamente porque queremos criar, no nosso
   sistema (MCM), uma tela de **solicitação de pagamento por tarefa**
   (selecionar 1 ou todos os ajudantes de uma tarefa, gerar uma solicitação
   com nome/telefone/valor) — se `IdRequestPayment` já é o conceito formal
   disso no banco principal, queremos alinhar com ele em vez de criar algo
   paralelo.
4. **O fator de escala 100 em `TaskPrice`** — ainda vale? Já vimos que
   `WorkHeader.TaskPrice` (tabela diferente, mesmo nome de coluna) **não**
   tem esse fator, só `FinancialTransaction.TaskPrice` tem — confirmam que
   isso continua assim?
5. Existe alguma tela/painel de vocês que já faz exatamente o que queremos
   (valor por chapa por tarefa, pago/pendente) que a gente possa usar como
   referência visual, mesmo que não copiemos o código?
