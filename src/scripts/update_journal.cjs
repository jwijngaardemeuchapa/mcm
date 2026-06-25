const fs = require('fs');
let f = fs.readFileSync('.agents/JOURNAL.md','utf8');
const entry = `## 2026-06-25 — MCM — Sync Leads Saac + Otimizações BID Dashboard (MCM-84)
**Actor:** Jeremiah | **Agent:** claude
**Tickets:** MCM-84 (Feito)
**Summary:**
- **Integração Saac (Fase 1):** Ingestão de leads do webhook metabase-leads, adição de fonte ao chapa_registry e Mapeamento de colunas.
- **BID Dashboard Otimização:** Adicionado *Bônus Cidade* (+30pts) para lidar com leads sem CEP. cep_invalido reclassificado para não bloquear.
- **Virtual Scroll no BID:** Renderização da lista substituída por useVirtualizer do @tanstack/react-virtual garantindo extrema fluidez mesmo com +3000 candidatos.
- **Real Sorting:** Cabeçalhos de tabela agora permitem ordenação reversível por Nome, Distância, Tarefas e Situação.
- **UI Badge:** Criada badge LEAD SAAC nos cards de candidatos.

---

## 2026-06-25`;
f = f.replace('## 2026-06-25', entry);
fs.writeFileSync('.agents/JOURNAL.md', f);
