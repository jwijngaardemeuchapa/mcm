const { execFileSync } = require('child_process');

const commentBody = `
h2. Planejamento: Autopilot de Cobertura (MV2-1)

Implementar a automação de disparos (Autopilot) para cobrir tarefas com base em parâmetros de tempo e gerenciar excedentes (reservas) e substituições automaticamente.

h3. Background e Requisitos
* *Variação de Tempo de Resposta:* Necessidade de definir parâmetros de tempo configuráveis para os disparos automáticos (ex: esperar X minutos antes de disparar para o próximo lote).
* *Lista de Reserva Automática:* Evitar fluxos complexos de resposta ("posso te chamar novamente?"). Se a tarefa atingir a capacidade máxima, o sistema automaticamente coloca os próximos interessados em um "batch de reserva".
* *Gestão de Vagas Abertas (Substituição):* Se houver uma desistência, o sistema notifica o operador na UI e pergunta ao chapa da reserva: "A vaga abriu, você pode ser alocado? Que horas chegaria ao local?".

---

h3. Decisões de Negócio Pendentes (Open Questions)
# *Execução do Autopilot:* Ele rodará apenas enquanto o Dashboard (aba do navegador) estiver aberto na máquina do operador, ou precisaremos de uma Cloud Function no Supabase rodando a cada 5 min? (O frontend é mais rápido de implementar e alinha com a arquitetura atual).
# *Notificação de Vaga e Reserva:* Quando uma vaga abrir, a mensagem de repescagem deve ser disparada de forma *automática* pelo Autopilot para a lista de reserva, ou o sistema só *sugere* (via alerta visual) e o operador clica para disparar?
# *Intervalo de Disparo:* Qual o intervalo padrão de espera antes de desistir do Lote 1 e acionar o Lote 2? (Ex: 15 minutos?).

---

h3. Proposta Técnica (Core Logic)

*1. Frontend Autopilot Manager (src/lib/autopilotManager.ts)*
* *Estado Persistente:* Usar localStorage ou SQLite para salvar o estado das "Campanhas de Autopilot" ativas, permitindo que a automação continue de onde parou caso a página recarregue.
* *Tick Engine:* Um setInterval processa a cada X segundos as campanhas ativas.
* *Lógica de Reserva:* O sistema verifica se a tarefa (Firestore sync) já atingiu o limite. Se sim, intercepta novas respostas positivas e as tagueia como reserva.

*2. UI do Autopilot*
* *Configurações:* Tela de integrações ganha campos para "Janela de Tolerância (Minutos)", "Mensagem de Reserva (Template)" e chave geral do Autopilot.
* *BID Dashboard:* Botão "🚀 Ativar Autopilot" substitui disparos passivos. Seleção de um lote total (ex: 50 chapas) para uma vaga de 10. O Autopilot dispara 10, aguarda, e aciona os próximos se necessário.
* *Dashboard Principal:* Exibir badge sinalizando quais tarefas estão com o Autopilot ativado.

*3. Firestore / Firebase Listeners*
* Quando um "Sim" entra para tarefa lotada, o frontend muda o status para 'reserva'.
* Quando um chapa desiste (cancela), a UI exibe um aviso de "Vaga Aberta" e repesca automaticamente os chapas da reserva dependendo da configuração escolhida.
`;

try {
  console.log("Comentando no Jira MCM-71...");
  const out = execFileSync('node', ['scripts/jira.cjs', 'comment', 'MCM-71', commentBody], { encoding: 'utf8' });
  console.log(out);
} catch (e) {
  console.error("Erro:", e.stderr || e.message);
}
