import { START } from './data';
import { SchedRow } from './types';

/**
 * Local-calendar date key (YYYY-MM-DD).
 *
 * Deliberately not `toISOString()`: that converts to UTC, so east-of-UTC zones
 * (IST is +05:30) roll the key back a day for anything logged between midnight
 * and the offset. Day keys are calendar days as the user experiences them.
 */
export function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a `YYYY-MM-DD` key back into a local-midnight Date. */
export function fromIso(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole local days from `a` to `b`, ignoring the time of day on either. */
export function daysBetween(a: Date, b: Date): number {
  const from = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const to = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((to.getTime() - from.getTime()) / 864e5);
}

export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday of the week containing START — the anchor every week index counts from. */
const WEEK_ONE_MONDAY = mondayOf(START);

export const TOTAL_WEEKS = 24;

/**
 * Which plan week `today` falls in, as a 0-based index.
 *
 * Counts Monday-aligned weeks from WEEK_ONE_MONDAY so that this agrees with
 * `weekDates` about where a week starts. Adding days rather than dividing by
 * 7×864e5 keeps it correct across any DST transition.
 */
export function currentWeekIndex(today: Date): number {
  const days = daysBetween(WEEK_ONE_MONDAY, today);
  return Math.max(0, Math.min(TOTAL_WEEKS - 1, Math.floor(days / 7)));
}

/** The seven local date keys of plan week `wi`, Monday first. */
export function weekDates(wi: number): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(WEEK_ONE_MONDAY);
    d.setDate(d.getDate() + wi * 7 + i);
    return iso(d);
  });
}

function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Which row's block contains `now`. A row's block runs from its own time up to
 * the next row's time, wrapping past midnight for the last row (e.g. Friday's
 * "Out" block runs 20:00 to the next row's 02:00, i.e. into the next day).
 */
export function currentSchedIndex(rows: SchedRow[], now: Date): number {
  const mins = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < rows.length; i++) {
    const start = minutesOf(rows[i][0]);
    const end = i + 1 < rows.length ? minutesOf(rows[i + 1][0]) : Infinity;
    if (end > start) {
      if (mins >= start && mins < end) return i;
    } else {
      // this block wraps past midnight
      if (mins >= start || mins < end) return i;
    }
  }
  return -1;
}
