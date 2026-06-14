# Estudo "Nível Apple" — Princípios de Usabilidade e UX aplicados ao MCM
*Expansão do panorama_produto.md · pesquisa em fontes primárias (Apple HIG, WWDC) e leis clássicas de UX · junho/2026*

---

## PARTE 1 — Os fundamentos da Apple (HIG)

A Apple organiza todo o seu design em torno de poucos princípios. Os três clássicos:

### 1.1 Clarity (Clareza)
Interface limpa, precisa, sem ruído. Poucos elementos por superfície; texto legível em qualquer tamanho; ícones que não exigem legenda.

**Aplicação no MCM:**
- Auditoria de densidade nos TaskCards: cada card hoje carrega ~15 informações simultâneas. Regra Apple: **o que não muda decisão agora não aparece agora** (vai para o inspector/tooltip)
- Um número por badge — "3/5 ✓" diz mais que três badges separados
- Reduzir a paleta de badges coloridos por card a no máx. 3 cores semânticas visíveis simultaneamente

### 1.2 Deference (Deferência)
A UI serve o conteúdo, nunca compete com ele. Chrome (bordas, sombras, painéis) recua; dados avançam.

**Aplicação no MCM:**
- O dado-herói de cada tela deve ser inconfundível: no Dashboard é o **fill rate**; no BID é o **ranking de candidatos**. Tudo o mais é coadjuvante (menor, mais claro, mais neutro)
- Filtros e toolbars em tom neutro/transparente — cor só onde há significado (status)
- Bordas: trocar `border` por separação via espaçamento + fundo sutil onde possível (menos "caixas dentro de caixas")

### 1.3 Depth (Profundidade)
Camadas e movimento realista comunicam hierarquia. O usuário sempre sabe "onde está" porque a transição mostrou de onde veio.

**Aplicação no MCM:**
- Dialogs e o inspector lateral devem **emergir do ponto de origem** (scale a partir do card clicado), não aparecer secos no centro
- Overlay de tarefa na Timeline: animar do bloco clicado para o card (zoom contextual — padrão iOS de abrir apps)
- Sombras com 3 níveis definidos (resting / raised / overlay) e nada fora deles

### 1.4 A tríade nova (HIG 2025): Hierarchy · Harmony · Consistency
A Apple reformulou para: **Hierarquia** (o mais importante domina), **Harmonia** (o app parece extensão natural do sistema) e **Consistência** (controles padrão se comportam como o usuário espera).

**Aplicação no MCM:**
- Consistência interna é a mais quebrada hoje: existem 3 estilos de botão de cancelar, 2 de countdown e 4 de label de campo. Criar **inventário de padrões** (1 página no Figma ou MD): para cada situação, UM jeito canônico
- Harmonia com Windows: respeitar atalhos nativos (Ctrl+Z já vai para undo? Ctrl+F para busca?), scrollbars, comportamento de janela

---

## PARTE 2 — Fluid Interfaces (WWDC18): a alma do "prazer Apple"

A palestra mais importante que a Apple já deu sobre sensação de qualidade. Tese central: **"uma interface é fluida quando se comporta conforme as pessoas pensam, não conforme as máquinas funcionam"** — a interface como extensão da mente.

### 2.1 Resposta instantânea (< 100ms)
Pessoas são extremamente sensíveis a latência. O toque deve gerar resposta visual ANTES do trabalho terminar.

**Aplicação no MCM:**
- **UI otimista em tudo**: confirmar chapa marca ✓ na hora; o INSERT roda depois; se falhar, reverte com toast + undo. (O `useUndo` já existe — é a rede de segurança perfeita para isso)
- Botões com estado `:active` visível (scale 0.97) — feedback no press, não só no release
- Busca filtra a cada tecla sem debounce perceptível (dados são locais!)

### 2.2 Interrompível e redirecionável
Toda animação/processo pode ser cancelado ou mudar de rumo no meio. Nada "trava" o usuário esperando terminar.

**Aplicação no MCM:**
- ✅ Já temos: countdowns canceláveis, painel global de disparos — está alinhado
- Faltante: dialogs que fecham com Esc em todos os casos; transições que aceitam novo clique no meio (não enfileirar animações)
- Importação de chapas: poder cancelar no meio do chunk loop

### 2.3 Momentum e física crível
Movimento com massa, mola e atrito (spring: damping + frequency response, não duração fixa). Movimento contínuo em posição E velocidade — nada "teleporta".

**Aplicação no MCM:**
- Adotar **Framer Motion** com 2 springs nomeados: `snappy` (UI pequena: badges, chips) e `smooth` (painéis, dialogs)
- Números que mudam (contadores, fill rate, countdown) rolam como odômetro — nunca trocam seco
- Rubberbanding em listas que chegam ao fim (scroll elástico sutil via CSS overscroll)

### 2.4 Hints (dicas físicas)
O sistema "sugere" o que vai acontecer antes de acontecer — como o iPhone X mostrava o app encolhendo durante o swipe.

**Aplicação no MCM:**
- Hover em card mostra preview das ações (botões surgem com fade rápido) — o usuário "sente" o que é clicável
- Drag de endereço/atalho de mensagem para reordenar com o item levantando (shadow + scale) ao pegar

### 2.5 Calm interfaces (calma)
Apple evita alarme visual constante. Urgência é informação, não gritaria — um elemento pulsando vale mais que dez vermelhos.

**Aplicação no MCM:**
- Hoje há pulse + vermelho + banner + badge simultâneos para urgência. Regra: **no máximo UM elemento animado por viewport** — o mais crítico pulsa, o resto fica estático
- Sons: máx. 2 no sistema inteiro (sucesso/alerta), curtos (<200ms), com toggle. O beep atual de notificação deve seguir essa régua

---

## PARTE 3 — Motion: regras objetivas (HIG Motion)

| Regra Apple | Valor | Aplicação MCM |
|---|---|---|
| Feedback imediato | 100–200ms | hover, press, toggle, checkbox |
| Transição simples | 200–300ms | abrir painel, expandir card, toast |
| Transição complexa | 300–500ms | dialog, navegação de página, overlay Timeline |
| Nunca exceder | 500ms | nada no MCM justifica mais |
| Easing padrão | ease-out (entradas), ease-in-out (movimentos) | tokens CSS: `--ease-enter`, `--ease-move` |
| Linear | só rotação contínua | spinners apenas |
| **Reduce Motion** | obrigatório | `prefers-reduced-motion` → durações 0, confete/pulse desligados. Acessibilidade que a Apple trata como inegociável |
| Propósito | toda animação comunica algo | se remover a animação e nada de informação se perder → ela não devia existir |

**Implementação concreta:** criar `src/lib/motion.ts` com os tokens (durations, springs, easings) e proibir valores soltos em `className`/style. Um lugar, uma física.

---

## PARTE 4 — As leis clássicas de UX (e onde o MCM ganha com cada uma)

### 4.1 Doherty Threshold (< 400ms)
Produtividade dispara quando sistema e usuário interagem abaixo de 400ms — acima disso a atenção quebra.
**MCM:** o ciclo crítico é confirmar→próximo chapa. Medir esse loop; qualquer etapa > 400ms ganha skeleton/otimismo. A importação de chapas (que já travou WebView) é o caso extremo: progresso por chunk com % é obrigatório.

### 4.2 Lei de Fitts (alvos: tamanho × distância)
Tempo para atingir um alvo depende do tamanho e da distância.
**MCM:** ações de altíssima frequência (✓ confirmar, ✗ remover) precisam de alvos ≥ 32px e posição consistente em TODOS os cards (memória muscular). Hoje botões icon de 24px exigem mira — analista faz isso 200×/dia.

### 4.3 Lei de Hick (menos opções = decisão mais rápida)
**MCM:** o menu de canal de contato e os 3 modos de visão estão bons (≤5 opções). O formulário de cliente com 11 campos visíveis viola — agrupar em seções progressivas (básico → detalhes → exigências).

### 4.4 Lei de Miller (chunks de 5–7)
**MCM:** lista de 40 candidatos no BID → agrupar visualmente em blocos de 5 com micro-separadores; ranking fica escaneável em vez de "paredão".

### 4.5 Lei de Jakob (usuários esperam padrões que já conhecem)
**MCM:** o público vem de Excel/WhatsApp. Tabelas devem ordenar por clique no cabeçalho (Excel); conversas/históricos devem ler de baixo para cima com bolhas (WhatsApp). Quanto mais familiar, menor o treinamento.

### 4.6 Peak-End Rule (lembramos do pico e do fim)
A experiência é julgada pelo momento mais intenso e pelo final.
**MCM:** desenhar deliberadamente os dois: **pico** = tarefa 100% preenchida (micro-confete + anel fechando — recompensa); **fim** = fechamento do turno (resumo do dia bonito, "você confirmou 47 chapas hoje" — sensação de dever cumprido). É o que faz o analista GOSTAR do software.

### 4.7 Aesthetic-Usability Effect
Interfaces bonitas são percebidas como mais fáceis — e toleram melhor pequenos erros.
**MCM:** investir no polimento visual não é vaidade; reduz percepção de fricção e chamados de suporte.

### 4.8 Goal Gradient (aceleramos perto da meta)
**MCM:** mostrar "falta 1 para fechar!" em vez de "4/5" quando perto do fim — barras que destacam o que falta motivam mais que as que mostram o que foi.

### 4.9 Von Restorff (o diferente é lembrado)
**MCM:** UM destaque por tela. Se tudo é colorido, nada é. O CTA primário de cada tela (ex.: Disparar) é o único botão sólido; o resto é outline/ghost.

### 4.10 Zeigarnik (tarefas incompletas ocupam a mente)
**MCM:** o sistema deve "lembrar pelo analista": badge persistente de pendências (validações não recebidas, BIDs sem resposta > 2h) — a mente do analista descansa porque confia que o app guarda o aberto.

### 4.11 Lei de Tesler (complexidade não some, só muda de lugar)
Toda complexidade irredutível deve ficar com o sistema, não com o usuário.
**MCM:** é a justificativa-mestra da cascata automática de BID e dos lembretes D-1: a complexidade de "quem chamar, quando insistir" migra do analista para o software.

### 4.12 Nielsen #3 e #5: Controle/Liberdade e Prevenção de erro
**Forgiveness Apple**: prefira **desfazer** a **confirmar**. Confirmação interrompe 100% das ações para prevenir 1% de erro; undo não interrompe ninguém.
**MCM:** já temos undo global ✓ e countdowns ✓ — dobrar a aposta: remover chapa pode ser instantâneo + toast "Desfazer" (em vez de dialog), reservando dialogs só para o irreversível (excluir cliente, restaurar backup).

### 4.13 Nielsen #1: Visibilidade de status do sistema
**MCM:** ✅ painel global de disparos atende exatamente isso. Faltante: status de sincronização/última gravação ("salvo ✓" sutil), e a idade dos dados LEO/registry visível onde são usados (não só no header).

---

## PARTE 5 — Padrões Apple complementares

### 5.1 Progressive Disclosure
Mostrar o essencial; revelar o avançado sob demanda (estudos: 30–50% mais rápido no fluxo inicial).
**MCM:** painel de disparo do BID com 8 campos → mostrar 3 (Data, Local, Diária preenchidos/sugeridos) + "Opções avançadas" colapsado. Configurações: separar "Essencial" de "Avançado".

### 5.2 Smart Defaults
O melhor formulário é o que já vem respondido.
**MCM:** diária sugerida = última usada para aquela empresa; local = endereço ⭐ principal do cliente (já temos a estrela!); data = automática (já temos). Meta: disparar BID com **zero digitação** no caso comum.

### 5.3 Direct Manipulation
Agir SOBRE o objeto, não sobre formulários a respeito dele.
**MCM:** arrastar chapa entre tarefas para realocar; arrastar bloco na Timeline para reagendar (com confirmação); clicar no número do fill rate edita a quantidade. O dado é a interface.

### 5.4 Empty states como onboarding
Apple nunca mostra tela vazia "morta" — sempre ilustração leve + 1 frase + 1 botão de próxima ação.
**MCM:** mapear os ~8 empty states (sem tarefas, sem clientes, sem candidatos no raio, sem bloqueados...) e dar a cada um: o que significa + o que fazer agora.

### 5.5 Copywriting de interface (a voz Apple)
Verbos no botão ("Disparar para 5", nunca "OK"); sem jargão técnico em mensagens de erro; falar do ponto de vista do usuário ("Sua mensagem foi enviada", não "POST 200").
**MCM:** auditar toasts de erro: `errMsg(e)` cru às vezes vaza "Umbler 422: ...". Traduzir os 5 erros mais comuns para humano + ação ("Telefone inválido — corrija no card do chapa").

### 5.6 Haptics → equivalentes visuais/sonoros no desktop
iPhone confirma com tato; no desktop o equivalente é o **triplo sutil**: micro-escala + cor + (opcional) som curto, juntos e rápidos.
**MCM:** definir o "tap háptico visual" padrão (scale 1→1.06→1 em 150ms) e usar nas confirmações.

---

## PARTE 6 — Plano de adoção (ordem sugerida, sem código ainda)

| Fase | Entrega | Princípios cobertos |
|---|---|---|
| A | `motion.ts` (tokens) + reduce-motion + press states | Motion HIG, Doherty, Fluid 2.1 |
| B | UI otimista nas 5 ações mais frequentes (confirmar, remover, contato, FUP 1-clique, status) | Fluid 2.1, Forgiveness |
| C | Inventário de padrões (botões, countdowns, labels) + Fitts nos alvos de alta frequência | Consistency, Fitts |
| D | Peak-End: anel de fill + celebração 100% + resumo de fim de turno | Peak-End, Goal Gradient |
| E | Inspector lateral + zoom contextual da Timeline | Depth, Jakob |
| F | Progressive disclosure (painel BID, Configurações, form de cliente) + smart defaults | Hick, Tesler, 5.1/5.2 |
| G | Empty states + auditoria de copy de erros | Nielsen, 5.4/5.5 |
| H | Direct manipulation (drag na Timeline e entre tarefas) | 5.3 — a cereja |

---

## Fontes primárias
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [HIG — Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [WWDC18 — Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/) · [resumo prático (Nathan Gitter)](https://medium.com/@nathangitter/building-fluid-interfaces-ios-swift-9732bb934bf5) · [demos](https://github.com/nathangitter/fluid-interfaces)
- [WWDC23 — Animate with springs](https://developer.apple.com/videos/play/wwdc2023/10158/)
- [WWDC25 — Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)
- [NN/g — 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [Laws of UX (Fitts, Hick, Miller, Doherty, Peak-End, etc.)](https://helio.zurb.com/ux-research/laws-of-ux/nielsens-heuristics/)
- [Progressive Disclosure — IxDF](https://ixdf.org/literature/topics/progressive-disclosure) · [UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)
