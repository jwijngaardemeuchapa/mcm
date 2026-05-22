import { WorkerRow, FilterResult, F, norm } from './consultorFields';
import { parseDate, weekRange } from './consultorDate';

function inRange(row: WorkerRow, start: Date, end: Date): boolean {
  const d = parseDate(F.data(row));
  return d !== null && d >= start && d <= end;
}

export interface ModeConfig {
  label: string;
  inputs: Array<{
    id: string;
    label: string;
    type: 'text' | 'date' | 'select';
    placeholder?: string;
    options?: string[];
  }>;
  run: (values: Record<string, string>, data: WorkerRow[]) => FilterResult;
}

export const MODES: Record<string, ModeConfig> = {
  'worker-phone': {
    label: 'Buscar por telefone',
    inputs: [{ id: 'wphone', label: 'Telefone (parcial ok):', type: 'text', placeholder: 'Ex: 11999887766' }],
    run: (v, data) => {
      const digits = v.wphone.replace(/\D/g, '');
      if (!digits) return { data: [], label: '', zeroMsg: 'Digite um número de telefone.' };
      const rows = data.filter(r => F.telefone(r).replace(/\D/g, '').includes(digits));
      return { data: rows, label: `Telefone: ${v.wphone}`, zeroMsg: `Nenhum registro para o telefone "${v.wphone}".` };
    }
  },
  'worker-task': {
    label: 'Histórico do ajudante',
    inputs: [{ id: 'wname', label: 'Nome do ajudante (parcial ok):', type: 'text', placeholder: 'Ex: João Silva' }],
    run: (v, data) => {
      const n = norm(v.wname);
      if (!n) return { data: [], label: '', zeroMsg: 'Digite um nome.' };
      const rows = data.filter(r => norm(F.nome(r)).includes(n));
      return { data: rows, label: `Ajudante: "${v.wname}"`, zeroMsg: `Nenhum registro para "${v.wname}".` };
    }
  },
  'worker-validation': {
    label: 'Validação do ajudante',
    inputs: [{ id: 'wname2', label: 'Nome do ajudante:', type: 'text', placeholder: 'Ex: João Silva' }],
    run: (v, data) => {
      const n = norm(v.wname2);
      const rows = data.filter(r => norm(F.nome(r)).includes(n));
      return { data: rows, label: `Validação: "${v.wname2}"` };
    }
  },
  'worker-date': {
    label: 'Ajudante em data X',
    inputs: [
      { id: 'wname3', label: 'Nome do ajudante:', type: 'text', placeholder: 'Ex: João Silva' },
      { id: 'wdate', label: 'Data:', type: 'date' }
    ],
    run: (v, data) => {
      const n = norm(v.wname3);
      const d = new Date(v.wdate); d.setHours(0, 0, 0, 0);
      const de = new Date(d); de.setHours(23, 59, 59, 999);
      const rows = data.filter(r => norm(F.nome(r)).includes(n) && inRange(r, d, de));
      return { data: rows, label: `${v.wname3} em ${d.toLocaleDateString('pt-BR')}` };
    }
  },
  'task-id': {
    label: 'Tarefa por número',
    inputs: [{ id: 'tid', label: 'Número da tarefa:', type: 'text', placeholder: 'Ex: 428209' }],
    run: (v, data) => {
      const rows = data.filter(r => String(F.id(r)).trim() === v.tid.trim());
      return { data: rows, label: `Tarefa #${v.tid}`, zeroMsg: `Tarefa ${v.tid} não encontrada.` };
    }
  },
  'task-status': {
    label: 'Tarefas por status',
    inputs: [{
      id: 'tstatus', label: 'Status:', type: 'select',
      options: ['Aberto', 'Aguardando Início', 'Aguardando Aprovação', 'Em Andamento', 'Finalizado', 'Cancelado']
    }],
    run: (v, data) => ({
      data: data.filter(r => norm(F.status(r)) === norm(v.tstatus)),
      label: `Status: ${v.tstatus}`
    })
  },
  'task-not-validated': {
    label: 'Finalizadas sem validação',
    inputs: [],
    run: (_, data) => ({
      data: data.filter(r => {
        const st = norm(F.status(r));
        const vl = norm(F.valid(r));
        return st.includes('finaliz') && (!vl || vl === 'pendente');
      }),
      label: 'Finalizadas sem validação'
    })
  },
  'empresa-name': {
    label: 'Tarefas da empresa',
    inputs: [{ id: 'ename', label: 'Nome da empresa (parcial ok):', type: 'text', placeholder: 'Ex: Tragetta' }],
    run: (v, data) => ({
      data: data.filter(r => norm(F.empresa(r)).includes(norm(v.ename))),
      label: `Empresa: "${v.ename}"`
    })
  },
  'empresa-week': {
    label: 'Empresa esta semana',
    inputs: [
      { id: 'ename2', label: 'Nome da empresa:', type: 'text', placeholder: 'Ex: Tragetta' },
      { id: 'weeksel', label: 'Semana:', type: 'select', options: ['Esta semana', 'Semana passada', 'Próxima semana'] }
    ],
    run: (v, data) => {
      const off = v.weeksel === 'Semana passada' ? -1 : v.weeksel === 'Próxima semana' ? 1 : 0;
      const { start, end } = weekRange(off);
      return {
        data: data.filter(r => norm(F.empresa(r)).includes(norm(v.ename2)) && inRange(r, start, end)),
        label: `${v.ename2} · ${v.weeksel}`
      };
    }
  },
  'empresa-date': {
    label: 'Empresa em dia específico',
    inputs: [
      { id: 'ename3', label: 'Nome da empresa:', type: 'text', placeholder: 'Ex: Tragetta' },
      { id: 'edate', label: 'Data:', type: 'date' }
    ],
    run: (v, data) => {
      const d = new Date(v.edate); d.setHours(0, 0, 0, 0);
      const de = new Date(d); de.setHours(23, 59, 59, 999);
      return {
        data: data.filter(r => norm(F.empresa(r)).includes(norm(v.ename3)) && inRange(r, d, de)),
        label: `${v.ename3} em ${d.toLocaleDateString('pt-BR')}`
      };
    }
  },
  'date-exact': {
    label: 'Data exata',
    inputs: [{ id: 'dexact', label: 'Data:', type: 'date' }],
    run: (v, data) => {
      const d = new Date(v.dexact); d.setHours(0, 0, 0, 0);
      const de = new Date(d); de.setHours(23, 59, 59, 999);
      return {
        data: data.filter(r => inRange(r, d, de)),
        label: `Data: ${d.toLocaleDateString('pt-BR')}`
      };
    }
  },
  'date-week': {
    label: 'Por semana',
    inputs: [{
      id: 'weekoff', label: 'Semana:', type: 'select',
      options: ['Esta semana', 'Semana passada', 'Próxima semana']
    }],
    run: (v, data) => {
      const off = v.weekoff === 'Semana passada' ? -1 : v.weekoff === 'Próxima semana' ? 1 : 0;
      const { start, end } = weekRange(off);
      return { data: data.filter(r => inRange(r, start, end)), label: v.weekoff };
    }
  },
  'date-month': {
    label: 'Por mês',
    inputs: [
      { id: 'dmonth', label: 'Mês:', type: 'select', options: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'] },
      { id: 'dyear', label: 'Ano:', type: 'text', placeholder: String(new Date().getFullYear()) }
    ],
    run: (v, data) => {
      const monthMap: Record<string,number> = { janeiro:0,fevereiro:1,'março':2,marco:2,abril:3,maio:4,junho:5,julho:6,agosto:7,setembro:8,outubro:9,novembro:10,dezembro:11 };
      const mi = monthMap[norm(v.dmonth)] ?? 0;
      const yr = parseInt(v.dyear) || new Date().getFullYear();
      const start = new Date(yr, mi, 1);
      const end = new Date(yr, mi + 1, 0, 23, 59, 59, 999);
      return { data: data.filter(r => inRange(r, start, end)), label: `${v.dmonth} ${yr}` };
    }
  },
  'date-range': {
    label: 'Período personalizado',
    inputs: [
      { id: 'dstart', label: 'De:', type: 'date' },
      { id: 'dend', label: 'Até:', type: 'date' }
    ],
    run: (v, data) => {
      const s = new Date(v.dstart); s.setHours(0, 0, 0, 0);
      const e = new Date(v.dend); e.setHours(23, 59, 59, 999);
      return {
        data: data.filter(r => inRange(r, s, e)),
        label: `${s.toLocaleDateString('pt-BR')} → ${e.toLocaleDateString('pt-BR')}`
      };
    }
  },
};
