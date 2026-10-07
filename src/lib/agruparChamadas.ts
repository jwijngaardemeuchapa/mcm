/**
 * Executa `tarefa` no máximo uma vez por vez. Pedidos que chegam enquanto ela roda
 * não empilham: viram UMA execução extra no fim (com os dados mais novos).
 *
 * Por que existe: o Dashboard recarrega (centenas de ms de leitura + montagem dos
 * cards) a cada evento "fup:refresh", e esse evento sai de dezenas de lugares — cada
 * chapa de um FUP em massa, cada resposta que chega, cada confirmação reaberta... Uma
 * rajada de 50 eventos virava 50 recargas completas em fila e a tela travava por
 * muitos segundos. Com isto uma rajada vira no máximo 2 recargas.
 */
export function criarExecutorAgrupado(tarefa: () => Promise<void>): () => Promise<void> {
  let rodando = false;
  let pediuMais = false;

  async function executar(): Promise<void> {
    if (rodando) {
      pediuMais = true;
      return;
    }
    rodando = true;
    try {
      await tarefa();
    } catch (e) {
      console.error("tarefa agrupada falhou:", e);
    } finally {
      rodando = false;
      if (pediuMais) {
        pediuMais = false;
        void executar();
      }
    }
  }

  return executar;
}
