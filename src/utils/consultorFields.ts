export interface WorkerRow {
  [key: string]: string;
}

export interface FilterResult {
  data: WorkerRow[];
  label: string;
  zeroMsg?: string;
}

export const F = {
  id:       (r: WorkerRow) => r['ID Tarefa'] || r['id_tarefa'] || '',
  data:     (r: WorkerRow) => r['Data da Tarefa'] || r['data_tarefa'] || r['Data'] || '',
  empresa:  (r: WorkerRow) => r['Empresa'] || r['empresa'] || '',
  cidade:   (r: WorkerRow) => r['Cidade/UF'] || r['cidade_uf'] || '',
  status:   (r: WorkerRow) => r['Status da Tarefa'] || r['status_tarefa'] || '',
  nome:     (r: WorkerRow) => r['Nome do Chapa'] || r['nome_chapa'] || r['Nome'] || '',
  telefone: (r: WorkerRow) => r['Telefone Chapa'] || r['telefone_chapa'] || r['Telefone'] || '',
  qtd:      (r: WorkerRow) => r['Quantidade de Chapas'] || r['quantidade_chapas'] || '',
  contato:  (r: WorkerRow) => r['Status Contato'] || r['status_contato'] || '',
  valid:    (r: WorkerRow) => r['Validação Presença'] || r['Validacao Presenca'] || r['validacao_presenca'] || '',
  cpf:      (r: WorkerRow) => r['CPF'] || r['cpf'] || '',
  descricao: (r: WorkerRow) => r['Descrição'] || r['Obs'] || r['descricao'] || '',
  remessa: (r: WorkerRow) => r['Remessa'] || r['Shipping'] || r['remessa'] || '',
};

export function norm(s: string): string {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}
