import { TZDate } from "@date-fns/tz";
import { addMinutes, format, isBefore } from "date-fns";

/** Wall-clock date + time in the business zone -> ISO instant (UTC). */
export function zonedToIso(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new TZDate(y, m - 1, d, hh, mm, 0, tz).toISOString();
}

/** ISO instant -> { date: "YYYY-MM-DD", time: "HH:mm" } in the business zone, for form inputs. */
export function isoToZonedParts(iso: string | null, tz: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const z = new TZDate(iso, tz);
  return { date: format(z, "yyyy-MM-dd"), time: format(z, "HH:mm") };
}

export function fmtTime(iso: string, tz: string): string {
  return format(new TZDate(iso, tz), "h:mm a");
}

export function fmtDate(iso: string, tz: string, pattern = "EEE, MMM d"): string {
  return format(new TZDate(iso, tz), pattern);
}

export function fmtDateTime(iso: string, tz: string): string {
  return format(new TZDate(iso, tz), "EEE, MMM d 'at' h:mm a");
}

/** "2026-11-14" (a date column) -> "Saturday, November 14". */
export function fmtDateOnly(date: string, pattern = "EEEE, MMMM d"): string {
  const [y, m, d] = date.split("-").map(Number);
  return format(new Date(y, m - 1, d), pattern);
}

/** Builds [start, end) slots of `minutes` between two instants. */
export function buildSlots(startIso: string, endIso: string, minutes: number): { slot_start: string; slot_end: string }[] {
  const out: { slot_start: string; slot_end: string }[] = [];
  let cursor = new Date(startIso);
  const end = new Date(endIso);
  while (isBefore(cursor, end)) {
    const next = addMinutes(cursor, minutes);
    out.push({ slot_start: cursor.toISOString(), slot_end: (next > end ? end : next).toISOString() });
    cursor = next;
  }
  return out;
}
