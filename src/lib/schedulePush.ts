import { currentWeekIndex, rowsForWeek, weekLetter } from './dates';
import { SchedRow, WeekSchedule } from './types';

/**
 * The timezone the timetable's "HH:MM" times are written in. The server runs
 * in UTC on Vercel (and TZ can't be overridden there), so wall-clock time is
 * derived explicitly rather than read off `new Date()`.
 */
export const SCHEDULE_TZ = process.env.LIFEOS_TIMEZONE || 'Asia/Kolkata';

/**
 * A block start older than this is never notified — after a scheduler outage
 * the next tick shouldn't dump an evening's worth of stale "starts now" pushes.
 */
export const MAX_LATENESS_MS = 10 * 60 * 1000;

export interface DueBlock {
  /** Block start as "wall ms": Date.UTC() of the local wall-clock time, not a real instant. */
  at: number;
  row: SchedRow;
}

/** `instant`'s wall-clock time in `tz`, encoded as Date.UTC() ms so arithmetic stays timezone-free. */
export function wallMs(instant: Date, tz: string = SCHEDULE_TZ): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((p) => [p.type, Number(p.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Every block start (as wall ms) for the schedule day that begins on the
 * calendar day at `dayStart` (wall ms of 00:00). Rows after a time goes
 * backwards (e.g. 23:45 → 00:00) belong to the following calendar day, the
 * same wrap rule currentSchedIndex uses.
 */
function blocksForDay(schedule: WeekSchedule, startDate: string, dayStart: number): DueBlock[] {
  const d = new Date(dayStart);
  const entry = schedule[d.getUTCDay()];
  if (!entry) return [];
  // currentWeekIndex works on local-calendar Dates; only the calendar date matters here.
  const wi = currentWeekIndex(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), startDate);
  const rows = rowsForWeek(entry[1], weekLetter(wi));

  const out: DueBlock[] = [];
  let dayOffset = 0;
  let prev = -1;
  for (const row of rows) {
    const mins = minutesOf(row[0]);
    if (mins < prev) dayOffset = 1;
    prev = mins;
    out.push({ at: dayStart + dayOffset * 864e5 + mins * 6e4, row });
  }
  return out;
}

/**
 * Blocks that started in (lastSent, now], and no earlier than MAX_LATENESS_MS
 * before now. Checks yesterday's schedule too, for its after-midnight rows.
 */
export function dueBlocks(schedule: WeekSchedule, startDate: string, now: number, lastSent: number | null): DueBlock[] {
  const today = now - (now % 864e5);
  const floor = Math.max(lastSent ?? -Infinity, now - MAX_LATENESS_MS - 1);
  return [...blocksForDay(schedule, startDate, today - 864e5), ...blocksForDay(schedule, startDate, today)]
    .filter((b) => b.at > floor && b.at <= now)
    .sort((a, b) => a.at - b.at);
}
