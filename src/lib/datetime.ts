import { format, differenceInMinutes, differenceInHours } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";

export const TZ = "America/Sao_Paulo";

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
