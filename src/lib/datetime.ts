import { format, differenceInMinutes, differenceInHours } from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";

export const TZ = "America/Sao_Paulo";

// States that are NOT in America/Sao_Paulo (UTC-3)
const STATE_TZ: Record<string, string> = {
  AC: "America/Rio_Branco",   // UTC-5
  AM: "America/Manaus",       // UTC-4
  MT: "America/Cuiaba",       // UTC-4
  MS: "America/Campo_Grande", // UTC-4
  RO: "America/Porto_Velho",  // UTC-4
  RR: "America/Boa_Vista",    // UTC-4
};

// "CUIABÁ/MT" or "RIO DOS BOIS/TO" → IANA timezone
export function tzFromCidade(cidade_uf: string | null | undefined): string {
  if (!cidade_uf) return TZ;
  const slash = cidade_uf.lastIndexOf("/");
  if (slash === -1) return TZ;
  const state = cidade_uf.slice(slash + 1).trim().toUpperCase().slice(0, 2);
  return STATE_TZ[state] ?? TZ;
}

// Returns a short timezone label for cities outside SP (UTC-3), e.g. "−1h" for UTC-4.
// Returns null when the city is in the same timezone as SP.
export function taskTzLabel(cidade_uf: string | null | undefined): string | null {
  const tz = tzFromCidade(cidade_uf);
  if (tz === TZ) return null;
  if (tz === "America/Rio_Branco") return "−2h";
  return "−1h";
}

// data_tarefa is always stored with -03:00 but the HH:mm represents local task time.
// This function strips the offset and re-parses as the task city's local time,
// returning the correct UTC moment for time-based calculations.
export function parseTaskDate(isoDate: string, cidade_uf: string | null | undefined): Date {
  const tz = tzFromCidade(cidade_uf);
  if (tz === TZ) return new Date(isoDate);
  const localPart = isoDate.replace(/([+-]\d{2}:\d{2}|Z)$/, "");
  return fromZonedTime(localPart, tz);
}

export function nowSP(): Date {
  return toZonedTime(new Date(), TZ);
}

export function toSP(d: Date | string): Date {
  return toZonedTime(typeof d === "string" ? new Date(d) : d, TZ);
}

export function fmtSP(d: Date | string, pattern: string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, pattern, { locale: ptBR });
}

export function fmtDateLong(d: Date = new Date()): string {
  const s = formatInTimeZone(d, TZ, "EEEE', 'dd 'de' MMMM", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtTime(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "HH:mm");
}

export function fmtDateTime(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "dd/MM/yyyy HH:mm");
}

export function todayDateISO_SP(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
}

export function isSameDaySP(d: Date | string): boolean {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "yyyy-MM-dd") === todayDateISO_SP();
}

export function minutesUntil(target: Date | string): number {
  const t = typeof target === "string" ? new Date(target) : target;
  return Math.round((t.getTime() - Date.now()) / 60000);
}

export function hoursUntil(target: Date | string): number {
  const t = typeof target === "string" ? new Date(target) : target;
  return (t.getTime() - Date.now()) / 3600000;
}

export function timeAgo(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const mins = Math.abs(differenceInMinutes(new Date(), date));
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.abs(differenceInHours(new Date(), date));
  if (hrs < 24) return `há ${hrs}h`;
  return format(date, "dd/MM HH:mm");
}
