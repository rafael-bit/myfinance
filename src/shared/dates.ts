import { addMonths, format, parseISO, startOfMonth, endOfMonth } from "date-fns";

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export function todayIsoDate(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function monthKey(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "yyyy-MM");
}

export function monthBounds(yearMonth: string): { start: string; end: string } {
  const d = parseISO(`${yearMonth}-01`);
  return {
    start: format(startOfMonth(d), "yyyy-MM-dd"),
    end: format(endOfMonth(d), "yyyy-MM-dd"),
  };
}

export function addMonthsIso(isoDate: string, months: number): string {
  return format(addMonths(parseISO(isoDate), months), "yyyy-MM-dd");
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = parseISO(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d, "yyyy-MM-dd");
}

export function daysInMonth(isoDate: string): number {
  const d = parseISO(isoDate);
  return endOfMonth(d).getDate();
}

export function clampDayOfMonth(yearMonthDay: string, day: number): string {
  const [year, month] = yearMonthDay.split("-").map(Number);
  const last = new Date(year, month, 0).getDate();
  const clamped = Math.min(day, last);
  return `${year}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}
