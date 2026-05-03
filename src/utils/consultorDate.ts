export function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  return null;
}

export function fmtDate(s: string): string {
  const d = parseDate(s);
  if (!d) return s || '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function weekRange(offset = 0): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day + offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function parseNLDate(q: string): { start: Date; end: Date } | null {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (/\bhoje\b/.test(q)) return { start: today, end: new Date(today.getTime() + 86400000 - 1) };
  if (/\bontem\b/.test(q)) {
    const d = new Date(today); d.setDate(d.getDate() - 1);
    return { start: d, end: new Date(d.getTime() + 86400000 - 1) };
  }
  if (/semana passada/.test(q)) return weekRange(-1);
  if (/essa semana|esta semana/.test(q)) return weekRange(0);
  const months = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto',
                  'setembro','outubro','novembro','dezembro'];
  for (let i = 0; i < months.length; i++) {
    if (q.includes(months[i])) {
      const yr = new Date().getFullYear();
      return { start: new Date(yr, i, 1), end: new Date(yr, i + 1, 0, 23, 59, 59, 999) };
    }
  }
  const dm = q.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
  if (dm) {
    const yr = dm[3] ? parseInt(dm[3]) : new Date().getFullYear();
    const d = new Date(yr, parseInt(dm[2]) - 1, parseInt(dm[1]));
    return { start: new Date(d), end: new Date(d.getTime() + 86400000 - 1) };
  }
  return null;
}
