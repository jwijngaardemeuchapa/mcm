/** Gravações das ações do painel de alarme que mexem no chapa (a confirmação reaproveita fasesConfirmacao.ts). */

type Banco = {
  select<T>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<unknown>;
};

export type EstadoAnterior = { status: string; dataRemocao: string | null; motivo: string | null };

/** Remove o chapa da tarefa (igual à remoção do card) e devolve o que havia antes, pra desfazer. */
export async function removerChapaDoAlarme(db: Banco, chapaId: string, agora: string): Promise<EstadoAnterior | null> {
  const antes = await db.select<{ status_contato: string; data_remocao: string | null; motivo_remocao: string | null }[]>(
    "SELECT status_contato, data_remocao, motivo_remocao FROM chapas WHERE id = ?",
    [chapaId],
  );
  if (antes.length === 0) return null;
  await db.execute(
    "UPDATE chapas SET status_contato = 'removido', data_remocao = ?, motivo_remocao = NULL WHERE id = ?",
    [agora, chapaId],
  );
  return { status: antes[0].status_contato, dataRemocao: antes[0].data_remocao, motivo: antes[0].motivo_remocao };
}

export async function restaurarChapa(db: Banco, chapaId: string, antes: EstadoAnterior): Promise<void> {
  await db.execute(
    "UPDATE chapas SET status_contato = ?, data_remocao = ?, motivo_remocao = ? WHERE id = ?",
    [antes.status, antes.dataRemocao, antes.motivo, chapaId],
  );
}

/** A mensagem pronta pra pedir um substituto (a mesma que o card oferece ao remover). */
export function mensagemDeSubstituicao(t: { id_tarefa: number; empresa: string; horario: string }, c: { nome: string; telefone: string | null }): string {
  return `⚠️ Remoção sinalizada — Tarefa #${t.id_tarefa} | ${t.empresa} | ${t.horario}
Chapa removido: ${c.nome} | Tel: ${c.telefone ?? "-"}
Precisamos de 1 substituto para esta tarefa.`;
}
