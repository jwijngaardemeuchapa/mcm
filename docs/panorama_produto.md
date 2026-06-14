# MCM — Panorama Estratégico de Produto
*Análise de código, intenção e oportunidades · junho/2026*

---

## 1. Leitura do produto hoje (o que o código revela)

O MCM já deixou de ser um "substituto de planilha" — é um **centro de operações de alocação de mão de obra avulsa** com:

- Ciclo completo: importação → FUP → confirmação → validação → histórico
- Comunicação integrada (Umbler/WhatsApp: templates, bot, texto livre, webhook de respostas)
- Inteligência embrionária: ranking por distância (haversine + geocoding), score com métricas LEO, matchmaker, radar no mapa
- Qualidade de vida real: undo global, paleta Ctrl+K, painel global de disparos, snapshot de backup

**A limitação estrutural número 1**: cada analista roda um SQLite local isolado. Não existe visão única da operação — dois analistas podem disparar BID para o mesmo chapa, e o dono não enxerga o todo sem pedir prints.

**A intenção implícita no código** (e que deve virar explícita): transformar o analista de "digitador de FUP" em **gestor de exceções** — o sistema faz o trivial sozinho e o humano só decide o que é ambíguo.

---

## 2. Norte estratégico

> **De ferramenta reativa → para plataforma que preenche vagas sozinha.**

Métricas-norte (medir antes de construir qualquer coisa):
| Métrica | O que diz |
|---|---|
| ⏱️ Time-to-fill | Minutos entre tarefa importada e 100% confirmada |
| 📉 No-show rate | % de confirmados que não apareceram (validação) |
| 🤖 Taxa de automação | % de vagas preenchidas sem toque humano |
| 💰 Margem por cliente | Receita − custo de chapa, por empresa |

---

## 3. Funcionalidades — por horizonte

### 🟢 Horizonte 1 — Quick wins (semanas)

**Inteligência leve**
1. **Score de confiabilidade do chapa** (☆☆☆☆☆): calculado de dados que JÁ existem — taxa de comparecimento (validacao_presenca), velocidade de resposta, recência. Exibir como estrelas no BID Dashboard e ChapaBook. É o que Wonolo/Instawork têm como núcleo do produto.
2. **Alerta de ASO vencendo**: o campo `aso` já existe no registry — avisar 15/7/1 dias antes, com disparo de mensagem pronto ("seu ASO vence dia X").
3. **Janela de 24h visível**: badge no chapa mostrando quanto tempo resta de janela WhatsApp aberta (última resposta + 24h). Hoje o analista chuta.
4. **Lembrete automático D-1 e H-2**: mensagem de véspera ("amanhã 07h na Seara") e de 2h antes ("já está a caminho?") para confirmados — opt-in por tarefa. Reduz no-show com custo zero de operação.

**Operação**
5. **Disparo agendado**: "disparar BID às 18h" — fila com data/hora, visível no painel global. (A infraestrutura de queue já existe.)
6. **Multi-seleção com ações em massa no Dashboard**: confirmar/remover/FUP em N chapas de uma vez com checkboxes (padrão Gmail).
7. **Telefone normalizado e dedupe na importação**: relatório de "possíveis duplicados" (mesmo telefone, nomes diferentes) com merge em 1 clique.

**Gestão**
8. **Resumo do dia automático** (fechamento de turno): card gerado às 18h — fill rate, tarefas críticas, no-shows, top chapas — com botão "copiar para Teams" (formato que já criamos em docs/atualizacoes_teams.txt, mas gerado sozinho).

### 🟡 Horizonte 2 — Estruturais (1–3 meses)

9. **Sincronização multi-analista** ⭐ *a mudança mais valiosa do roadmap*
   - Supabase já está no .env e no CSP — usar como espinha: SQLite local continua (offline-first), sincroniza via fila de eventos
   - Resolve: visão única, lock de tarefa ("Maria está atuando nesta tarefa"), histórico por operador (operadorNome já existe!), dashboard do dono em tempo real
   - Subproduto: **versão web read-only para o dono** (sem instalar nada)

10. **Cascata automática de BID** (o "piloto automático")
    - Analista define a régua uma vez: "para vagas abertas, convide top-5 por score → espere 20 min → próximos 5 → se 2h sem preencher, me alerte"
    - O sistema executa a cascata sozinho; o humano só entra na exceção
    - É exatamente o modelo Instawork/Jobandtalent — e o motor (queue + score + bot) já está 70% construído

11. **Check-in do chapa por link**: mensagem H-1 com link "Cheguei 📍" que captura geolocalização e marca presença sozinho. Mata a ligação de portaria e alimenta o score de confiabilidade com dado real.

12. **Painel executivo (visão dono)**
    - Margem por cliente (diária paga × cobrada — exigirá campo de valores)
    - Tendência de fill rate, ranking de clientes problemáticos (cancelam tarde, validam devagar)
    - Relatório semanal automático por e-mail/Teams

13. **Gestão de templates na UI**: hoje os IDs de template são strings em Integrações. Tela com preview do texto real, variáveis destacadas, teste de envio — sem precisar abrir o painel da Umbler.

### 🔵 Horizonte 3 — Visão (3–12 meses)

14. **Autoaprendizado de no-show**: modelo simples (regressão logística sobre o histórico) prevendo risco por chapa×tarefa: "⚠️ 40% de risco de furo — convide 1 reserva". Overbooking inteligente, como companhias aéreas.
15. **Copiloto de operação** (evoluir o Consultor): "preenche a tarefa da Seara de amanhã" → o agente monta a cascata, mostra o plano, pede um OK. Linguagem natural sobre os dados locais.
16. **Mini-app do chapa** (PWA via link, sem loja): minhas tarefas, confirmar, mapa, histórico de diárias, documentos. Aumenta retenção do pool — o ativo mais valioso do negócio.
17. **Pagamentos/recibos**: registrar diária paga, gerar recibo PDF, exportar para contabilidade. Fecha o ciclo financeiro e gera o dado de margem do item 12.

---

## 4. UX/UI — o "nível Apple"

O prazer Apple vem de quatro coisas: **resposta instantânea, física crível, hierarquia impecável e zero becos sem saída**. Traduzindo para o MCM:

### Princípios
- **Nada congela**: toda ação > 100ms mostra skeleton/spinner local (nunca a tela toda); otimismo de UI (marca confirmado na hora, reverte se falhar — o undo já existe, usar como rede)
- **Física de movimento**: transições spring (200–300ms, ease-out) em painéis, dialogs e no widget de disparos — Framer Motion entra bem no stack atual
- **Uma hierarquia, três tamanhos**: hoje há ~6 tamanhos de fonte por card. Apple usa 3 níveis por superfície: título, corpo, legenda. Auditar cards com essa régua
- **Beco sem saída zero**: todo empty state diz o que fazer a seguir com botão ("Nenhum cliente ainda → Importar carteira"); todo erro diz como se recuperar

### Microinterações que mudam a percepção
- ✅ Confirmar chapa: o badge "pula" (scale 1 → 1.15 → 1) + som sutil opcional — o "clack" do iPhone
- 📊 Fill rate: anel de progresso animado estilo Apple Watch por tarefa (em vez de barra), fechando o anel quando 100%
- ⏱️ Countdown: número que rola (odometer) em vez de trocar seco
- 🎉 Tarefa 100% validada: micro-confete discreto de 1s — recompensa que vicia no bom sentido
- 🔴 Pull de urgência: card emergente com glow pulsante sutil, não banner gritando

### Navegação e fluxo
- **Ctrl+K como Spotlight de verdade**: além de navegar, executar — "fup seara", "msg confirmados tragetta", "bid 1234". O analista power nunca toca o mouse
- **Modo Foco / War Room**: tecla F esconde sidebar + filtros e mostra só os cards críticos ordenados por urgência — para as 2h de pico da manhã
- **Inspector lateral** (padrão Apple Mail): clicar numa tarefa abre painel à direita em vez de expandir o card no meio da lista — a lista nunca "salta"
- **Onboarding por coach marks**: primeira vez em cada tela, 3 dicas posicionadas (não tour de 20 passos). Essencial para escalar para novos analistas

### Design system (consolidar antes de crescer)
- **Grade de 4pt** para todo espaçamento; raios unificados (8/12/16)
- **Tipografia**: Inter ou Geist com tabular-nums em todos os números (contadores não "dançam")
- **Tokens de movimento**: 3 durações padrão (120/200/320ms) e 2 curvas — usados em tudo, sem exceção
- **Dark mode como cidadão de primeira classe**: revisar contrastes dos badges coloridos sobre fundo escuro (alguns warning/10 ficam ilegíveis)
- **Iconografia**: já é 100% Lucide ✓ — manter, definindo 2 tamanhos canônicos (16/20)

---

## 5. Matriz de priorização (impacto × esforço)

| # | Item | Impacto | Esforço | Quando |
|---|---|---|---|---|
| 1 | Score de confiabilidade | 🔥🔥🔥 | Baixo | Já |
| 4 | Lembretes D-1/H-2 | 🔥🔥🔥 | Baixo | Já |
| 8 | Resumo do dia p/ Teams | 🔥🔥 | Baixo | Já |
| 3 | Janela 24h visível | 🔥🔥 | Baixo | Já |
| 5 | Disparo agendado | 🔥🔥 | Médio | Próximo |
| 10 | Cascata automática de BID | 🔥🔥🔥🔥 | Médio | Próximo |
| 9 | Sync multi-analista | 🔥🔥🔥🔥 | Alto | Planejar agora, fazer em 2 fases |
| 11 | Check-in por link | 🔥🔥🔥 | Médio | Após sync |
| 12 | Painel executivo | 🔥🔥🔥 | Médio | Após sync |
| UX | Inspector + Spotlight + motion | 🔥🔥 | Médio | Contínuo, 1 item por versão |
| 16 | Mini-app do chapa | 🔥🔥🔥🔥 | Alto | Visão |

## 6. O que NÃO fazer (anti-roadmap)

- ❌ App mobile nativo agora — o mini-app do chapa via link resolve 90% sem loja/manutenção dupla
- ❌ Gamificação pesada para analistas (pontos/ranking entre colegas) — gera atrito em time pequeno
- ❌ Disparos em massa sem rate limit/throttle — risco de ban do número WhatsApp (manter os 7–10s atuais sempre)
- ❌ IA gerando mensagem livre automaticamente para chapa sem revisão — tom errado custa relacionamento; IA sugere, humano envia
- ❌ Trocar SQLite por banco remoto puro — offline-first é uma vantagem real da operação atual; sync é camada, não substituição

---

*Documento vivo — revisar a cada trimestre contra as métricas-norte da seção 2.*
