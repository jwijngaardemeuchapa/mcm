# Plano de Implementação — Nível Apple (fases A–H)
*Derivado de `estudo_nivel_apple.md` · ajustado com as decisões de produto de junho/2026*

---

## Ajustes de escopo decididos (não esquecer)

| Item do estudo | Decisão |
|---|---|
| **4.10 Zeigarnik** | Implementar badge de pendências **somente para validações não recebidas**. A parte "BIDs sem resposta > 2h" fica **fora** até o webhook Umbler estar operacional (MCM-5). |
| **4.12 Forgiveness** | Remover chapa **pode perder o dialog** (ação instantânea + Desfazer). **Obrigatório**: manter a opção de **copiar a mensagem de remoção** — vai junto no toast pós-remoção ("Desfazer · Copiar mensagem"). |
| **5.3 Direct Manipulation** | **Não** mover chapas entre tarefas (drag) por enquanto. Permanece no plano apenas o reagendamento por drag na Timeline (com confirmação). |
| **Regra transversal** | Toda fase deve ser **compatível com dados salvos de versões anteriores** (settings com defaults via spread, migrações SQLite aditivas, localStorage com fallback). Nada de renomear/remover chave existente sem migração. |

---

## Fase A — Fundação de movimento *(1 versão)*

**Entrega:** `src/lib/motion.ts` + tokens CSS em `index.css` + press states + reduce-motion.

1. Tokens: 3 durações (`--dur-fast: 120ms`, `--dur-base: 200ms`, `--dur-slow: 320ms`) e 2 curvas (`--ease-enter: cubic-bezier(0.16,1,0.3,1)`, `--ease-move: cubic-bezier(0.45,0,0.25,1)`); proibir valores soltos novos em `className`.
2. Press state global no `ui/button.tsx`: `active:scale-[0.97]` com `--dur-fast` (feedback no press, não no release).
3. `@media (prefers-reduced-motion: reduce)`: zera durações, desliga `animate-pulse`/`animate-ping`/confete.
4. Regra "1 elemento animado por viewport": auditar pulses simultâneos (header staleness + urgência + NOVO) e manter só o mais crítico por tela.

**Aceite:** nenhuma animação > 500ms; app inteiro utilizável com reduce-motion; botões respondem visualmente < 100ms.

## Fase B — UI otimista nas 5 ações de alta frequência *(1–2 versões)*

**Entrega:** confirmar, remover, marcar contato, status e FUP 1-clique refletem na UI **antes** do INSERT/UPDATE; rollback + toast em falha (o `useUndo` já é a rede de segurança).

1. `updateChapaWithUndo` já existe — garantir que o setState local acontece antes do `await` em todos os 5 fluxos.
2. **Remover chapa sem dialog** (ajuste 4.12): clique remove na hora; toast de 6s com ações **Desfazer** e **Copiar mensagem** (a mesma mensagem de remoção que o dialog atual oferece). Dialogs permanecem apenas no irreversível (excluir cliente, restaurar backup, excluir da carteira).
3. Busca sem debounce perceptível (dados locais) — medir o loop confirmar→próximo (meta Doherty < 400ms).

**Aceite:** loop confirmar→próximo < 400ms medido; remoção é 1 clique + undo; mensagem de remoção copiável no toast.

## Fase C — Consistência + Fitts *(1 versão)*

**Entrega:** inventário de padrões (`docs/inventario_padroes.md`) + alvos ≥ 32px nas ações frequentes.

1. Inventário: 1 estilo canônico de botão-cancelar, 1 de countdown, 1 de label de campo, 2 tamanhos de ícone (16/20).
2. ✓ confirmar e ✗ remover nos cards: hit area mínima 32×32 (padding invisível se preciso) e **posição idêntica em todos os cards** (memória muscular).
3. Atalhos nativos Windows: Ctrl+Z → undo global; Ctrl+F → busca da página.

**Aceite:** zero variações fora do inventário em Dashboard/BID; alvos medidos ≥ 32px.

## Fase D — Peak-End *(1 versão)*

**Entrega:** pico e fim desenhados.

1. **Pico:** anel de progresso (estilo Apple Watch) por tarefa no lugar da barra; ao fechar 100% → anel completa com spring + micro-confete de 1s (1 vez por tarefa, respeitando reduce-motion).
2. **Fim:** "Resumo do turno" às 18h (card): chapas confirmados, fill rate do dia, tarefas críticas resolvidas, com botão "Copiar p/ Teams".
3. Goal Gradient: barra/anel muda o rótulo perto da meta — "falta 1!" em vez de "4/5".

**Aceite:** confete dispara 1× por tarefa 100%; resumo gerado automaticamente com copy de 1 clique.

## Fase E — Profundidade e navegação *(1–2 versões)*

**Entrega:** inspector lateral + zoom contextual.

1. Inspector (padrão Apple Mail): clicar numa tarefa abre painel à direita (Sheet) em vez de expandir no meio da lista — a lista nunca "salta". Manter expansão inline como opção.
2. Timeline: overlay da tarefa emerge do bloco clicado (scale a partir da origem), não do centro.
3. Dialogs fecham com Esc em 100% dos casos.

**Aceite:** abrir/fechar inspector não rola a lista; todas as transições interrompíveis.

## Fase F — Progressive disclosure + smart defaults *(1 versão)*

**Entrega:** formulários que "já vêm respondidos".

1. Painel de disparo BID: mostrar 3 campos (Data, Local, Diária — todos pré-preenchidos) + "Opções avançadas" colapsado.
2. Smart defaults: diária = última usada na empresa; local = endereço ⭐ principal; data = automática. Meta: BID com **zero digitação** no caso comum.
3. Form de cliente: 11 campos → seções progressivas (básico → detalhes → exigências). Configurações: separar "Essencial" de "Avançado".

**Aceite:** disparo BID comum sem digitar nada; form de cliente abre com ≤ 5 campos visíveis.

## Fase G — Empty states + voz da interface *(1 versão)*

**Entrega:** zero becos sem saída.

1. Mapear os ~8 empty states (sem tarefas, sem clientes, sem candidatos no raio, sem bloqueados…) → cada um com: o que significa + 1 botão de próxima ação.
2. Auditoria de toasts de erro: traduzir os 5 erros mais comuns de `errMsg(e)` cru para humano + ação ("Telefone inválido — corrija no card do chapa"). Verbos nos botões ("Disparar para 5", nunca "OK").
3. Badge persistente de pendências (Zeigarnik): **somente validações não recebidas** (parte de BIDs sem resposta adiada — ver ajustes).

**Aceite:** nenhum estado vazio sem ação; nenhum toast com erro técnico cru nos fluxos principais.

## Fase H — Direct manipulation (a cereja) *(1 versão)*

**Entrega:** arrastar bloco na Timeline para reagendar (com dialog de confirmação — reagendar é grande demais para só-undo).
**Fora de escopo** (decisão): arrastar chapa entre tarefas.

**Aceite:** drag na Timeline atualiza `data_tarefa` após confirmação; Esc/soltar fora cancela.

---

## Já entregue (não refazer)

- ✅ Painel global de disparos com countdowns canceláveis (Nielsen #1) — v0.9.82
- ✅ Empilhamento dos painéis flutuantes + minimizar em pílula — v0.9.84
- ✅ Score de confiabilidade (15 dias) no painel FUP — v0.9.84
- ✅ Alerta de vencimento de ASO 15/7/1 dias — v0.9.84
- ✅ Undo global, paleta Ctrl+K, fontes 10px mínimas

## Ordem sugerida e dependências

```
A (fundação) → B (otimismo) → C (consistência)
                    ↓
              D (peak-end)  — pode rodar em paralelo com E
E (inspector) → F (disclosure) → G (empty/copy) → H (drag)
```

Uma fase por versão, sempre com: type-check limpo → build → commit → push → ticket Jira fechado.
