import { todayDateISO_SP } from "./datetime";

// Vencimento de ASO — o campo chega cru da planilha (dd/mm/aaaa, aaaa-mm-dd ou
// serial Excel). Formato não reconhecido → null, e a UI mantém o badge verde
// neutro de antes (compatibilidade com dados já importados).

export type AsoLevel = "ok" | "warn15" | "warn7" | "critical" | "expired";

export type AsoInfo = {
  level: AsoLevel;
  days: number;       // dias até vencer (negativo = vencido)
  dateLabel: string;  // dd/mm/aaaa
};

export function parseAsoDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const dt = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const num = Number(s);
  if (Number.isFinite(num) && num > 25000 && num < 60000) {
    // serial Excel: dias desde 30/12/1899
    const dt = new Date(Date.UTC(1899, 11, 30) + num * 86_400_000);
    return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  }

  return null;
}

export function asoInfo(raw: string | null | undefined): AsoInfo | null {
  if (!raw) return null;
  const d = parseAsoDate(raw);
  if (!d) return null;

  const [y, m, dd] = todayDateISO_SP().split("-").map(Number);
  const today = new Date(y, m - 1, dd);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);

  const level: AsoLevel =
    days < 0 ? "expired" :
    days <= 1 ? "critical" :
    days <= 7 ? "warn7" :
    days <= 15 ? "warn15" : "ok";

  const dateLabel = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return { level, days, dateLabel };
}
