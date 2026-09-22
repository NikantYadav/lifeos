import 'server-only';

/**
 * User-local calendar-date helpers, built on `profiles.timezone`.
 *
 * Context: `entry_date` rows are written in the CLIENT's local calendar date
 * already — the RN `TrackerCard` component computes `entry_date` from
 * device-local time before it ever sends a POST (see
 * `lifeos-frontend/src/lib/trackers.ts`'s `todayDateString()`). So stored
 * `tracker_entries.entry_date` values are local-calendar semantics, NOT
 * UTC — the only UTC writer was `tracker-entries/route.ts`'s fallback for a
 * POST that omits `entry_date` (fixed alongside this file to use the same
 * timezone this module derives, so every writer agrees).
 *
 * Given that, a context-builder window boundary computed from *server* UTC
 * "today" (`new Date().toISOString().slice(0, 10)`) was the actual bug: near
 * a user's local midnight, server-UTC "today" and the user's local "today"
 * disagree, so the window's start/end dates don't line up with the
 * local-calendar dates the rows are actually keyed by — entries from
 * "today" (local) can be silently excluded (still in the future from UTC's
 * point of view) or "yesterday" (local) can wrongly still be included.
 * (An earlier version of this file's callers reasoned the opposite —
 * that using `profiles.timezone` would create a mismatch against
 * UTC-written rows — but that was never actually true once you check what
 * the client writes; see the two context builders' own comments, corrected
 * alongside this file.)
 *
 * Deliberately kept OUT of `lib/validation/*.ts`: this is calendar-date
 * arithmetic, not input validation, and other concurrent work is touching
 * files in that directory for unrelated fixes.
 *
 * NOT used for the once-per-day/week AI-generation guards
 * (`checkin/generate`, `review/generate`, migration 008's partial unique
 * indexes on `reviews`) — those are a DIFFERENT concern that deliberately
 * stays UTC-instant-based. A partial unique index expression is baked in at
 * migration time and can't reference a per-row/per-user `profiles.timezone`
 * lookup, so the DB-level guard can only ever enforce "one per UTC
 * day/week". The app-level check-then-insert in both `/generate` routes
 * already matches that UTC boundary exactly (`todayStart` /
 * `currentWeekStartIso()`) — making the app-level check timezone-aware
 * while the unique index stays UTC would create a NEW mismatch (the app
 * could think "not generated yet today" while the index still rejects the
 * insert as a UTC-day dupe, or vice versa), which is exactly the trap this
 * bug has resisted fixing across four prior sessions. Both GET routes
 * (`checkin/route.ts`, `review/route.ts`) already read back against the
 * same UTC boundary as their guard, so all three routes per feature agree.
 * UPDATE (2026-09-22, twelfth session): the residual gap described above is
 * now closed. Migration `011_reviews_local_day_week_generation_guards`
 * added `reviews.local_day`/`reviews.local_week` (plain `date` columns) and
 * replaced migration 008's UTC-instant-keyed partial unique indexes with
 * new ones keyed on these columns instead
 * (`reviews_one_daily_checkin_per_user_per_local_day` on
 * `(user_id, local_day) WHERE kind = 'daily_checkin'`,
 * `reviews_one_weekly_review_per_user_per_local_week` on
 * `(user_id, local_week) WHERE kind = 'weekly'`) — the old UTC-expression
 * indexes no longer exist. `checkin/generate`, `checkin/route.ts`,
 * `review/generate`, and `review/route.ts` all now compute/filter on
 * `todayInTimeZone`/`weekStartInTimeZone` (below) instead of a UTC
 * boundary, so the guard and its GET-readback finally agree with each
 * other AND roll over at the user's local midnight, not UTC's.
 */

const DEFAULT_TIMEZONE = 'UTC';

/** Validates an IANA timezone identifier by attempting to construct a formatter with it — accepts anything the runtime's ICU data recognizes, not just `Intl.supportedValuesOf('timeZone')`'s canonical-only list (which can omit legacy/`Etc/*` aliases some devices still report). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a possibly-null/invalid stored timezone to a safe value to
 * actually use. `profiles.timezone` is `NOT NULL DEFAULT 'UTC'` at the DB
 * level (confirmed live — every existing and future row already has a
 * value, `handle_new_user` never needed a backfill), so `null` shouldn't
 * occur in practice — this is defense against that invariant ever being
 * violated (a manually-edited row, a future migration that relaxes the
 * constraint) and against a stored value that's no longer a recognized zone
 * (e.g. an old alias ICU has since dropped), not a "normal" path.
 */
export function resolveTimeZone(tz: string | null | undefined): string {
  if (isValidTimeZone(tz)) return tz;
  return DEFAULT_TIMEZONE;
}

/** Y/M/D of `instant` as observed in `timeZone`, via `Intl.DateTimeFormat` — the standard non-string-hacky way to ask "what calendar date is it right now in this zone." */
function localYmd(instant: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

function ymdToIso({ y, m, d }: { y: number; m: number; d: number }): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Today's calendar date (YYYY-MM-DD) as observed in `timeZone` — the timezone-aware analog of `new Date().toISOString().slice(0, 10)`. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return ymdToIso(localYmd(now, timeZone));
}

/**
 * A date `daysAgo` days before `now`'s local calendar date in `timeZone`,
 * as YYYY-MM-DD. Arithmetic is done on the DERIVED calendar date (via
 * `Date.UTC` in a "fake UTC" calendar space, not on the real instant) —
 * subtracting via `setUTCDate` on the actual instant and only THEN
 * formatting into the target zone would double-apply the zone offset and
 * can be off by a day around a DST transition in `timeZone`. This function
 * never touches the real instant's clock time at all, only its already-
 * resolved local Y/M/D.
 */
export function daysAgoInTimeZone(daysAgo: number, timeZone: string, now: Date = new Date()): string {
  const { y, m, d } = localYmd(now, timeZone);
  // Date.UTC here is just integer calendar arithmetic (no real timezone
  // involved) — using UTC internally avoids the JS Date engine applying the
  // HOST's local timezone to the subtraction, which would reintroduce the
  // exact class of bug this module exists to fix.
  const shifted = new Date(Date.UTC(y, m - 1, d - daysAgo));
  return ymdToIso({ y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() });
}

/** A `[windowStart, windowEnd]` pair (both YYYY-MM-DD, inclusive) covering `lookbackDays` days ending on `timeZone`'s current local calendar date. */
export function lookbackWindowInTimeZone(
  lookbackDays: number,
  timeZone: string,
  now: Date = new Date()
): { windowStart: string; windowEnd: string } {
  return {
    windowEnd: todayInTimeZone(timeZone, now),
    windowStart: daysAgoInTimeZone(lookbackDays - 1, timeZone, now),
  };
}

/**
 * The Monday-start date (YYYY-MM-DD) of the calendar week containing
 * `now`'s local date in `timeZone` — the timezone-aware analog of
 * `validation/review.ts`'s `currentWeekStartIso()`, but returning a plain
 * `date`-shaped string (no `T00:00:00.000Z` suffix) since this feeds
 * `reviews.local_week`, a `date` column, not a `.gte()` filter against a
 * `timestamptz` column the way `currentWeekStartIso()`'s return value does.
 * Same calendar-space-only arithmetic discipline as `daysAgoInTimeZone`
 * (via `Date.UTC` on the already-resolved local Y/M/D, never the real
 * instant) — and the identical Monday-start weekday math
 * `currentWeekStartIso()` uses (`day === 0 ? 6 : day - 1` days back from
 * Sunday=0..Saturday=6), just anchored to `timeZone`'s local date instead
 * of UTC's.
 */
export function weekStartInTimeZone(timeZone: string, now: Date = new Date()): string {
  const { y, m, d } = localYmd(now, timeZone);
  const asUtc = new Date(Date.UTC(y, m - 1, d));
  const day = asUtc.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = day === 0 ? 6 : day - 1;
  asUtc.setUTCDate(asUtc.getUTCDate() - diffToMonday);
  return ymdToIso({ y: asUtc.getUTCFullYear(), m: asUtc.getUTCMonth() + 1, d: asUtc.getUTCDate() });
}

export { DEFAULT_TIMEZONE };
