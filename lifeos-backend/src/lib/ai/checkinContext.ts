import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CHECKIN_LOOKBACK_DAYS } from '@/lib/validation/checkin';
import { lookbackWindowInTimeZone, resolveTimeZone } from '@/lib/time';

/**
 * Read-only context builder for the daily check-in — the generalized
 * successor to the old pre-Supabase `reviewContext.ts`'s `skipReasons`
 * array, now sourced from generic `tracker_entries` rows (`missed`/
 * `miss_category`/`miss_note`) instead of one hardcoded check list, per
 * ROADMAP.md's Phase 3 note.
 *
 * Strictly scoped to `user_id = verifiedUserId` on every query — never
 * takes a client-supplied user id, same IDOR discipline as every other
 * route in this codebase (see tracker-entries/route.ts's ownership-lookup
 * comments for the pattern this mirrors).
 *
 * Date window: last `CHECKIN_LOOKBACK_DAYS` days, ending on the user's
 * LOCAL calendar "today" (`profiles.timezone`, via `lib/time.ts`), not
 * server/UTC "today". An earlier version of this comment argued the
 * opposite — that using the user's timezone would filter UTC-written rows
 * with a local-tz boundary — but that reasoning was stale: the RN client's
 * `TrackerCard` already computes `entry_date` from device-local time before
 * every POST (`lifeos-frontend/src/lib/trackers.ts`'s `todayDateString()`),
 * so stored `entry_date` values are ALREADY local-calendar dates, not UTC.
 * The only UTC writer was `tracker-entries/route.ts`'s fallback for a POST
 * that omits `entry_date`, which now also uses this same per-user timezone
 * (see that route's comment) — so every writer and this reader now agree on
 * what "today" means for a given user. `profiles.timezone` is `NOT NULL
 * DEFAULT 'UTC'` at the DB level and `handle_new_user` never overrides it,
 * so every profile already has a value; `resolveTimeZone` is defense
 * against a corrupted/unrecognized value, not a normal fallback path.
 *
 * Deliberately NOT used for the once-per-day generation guard in
 * `checkin/generate/route.ts` — that guard's semantics stay UTC-instant-
 * based, a separate concern; see `lib/time.ts`'s module comment for why
 * mixing the two would trade this bug for a new guard/window mismatch.
 */

export interface MissedEntryContext {
  tracker_id: string;
  tracker_name: string;
  tracker_kind: string;
  target: number | null;
  entry_date: string;
  miss_category: string | null;
  miss_note: string | null;
}

// Added alongside `missed_entries` so the model has something concrete to
// propose a `move_time_block` diff against — without this, the AI has no
// way to know a schedule_block's id/day/time at all, and could only ever
// hallucinate one. Read-only, same ownership scoping as everything else in
// this builder (`user_id = verifiedUserId`, never a client-supplied id).
// Deliberately excludes `note`/`is_key_block`/`plan_id` — not needed for
// the model to propose a time move, keeps the context payload smaller.
export interface ScheduleBlockContext {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string | null;
  title: string;
}

export interface CheckinContext {
  missed_entries: MissedEntryContext[];
  schedule_blocks: ScheduleBlockContext[];
  window_start: string; // YYYY-MM-DD, inclusive
  window_end: string; // YYYY-MM-DD, inclusive ("today")
}

export async function buildCheckinContext(verifiedUserId: string): Promise<CheckinContext> {
  const admin = supabaseAdmin();

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('timezone')
    .eq('user_id', verifiedUserId)
    .maybeSingle();
  if (profileErr) {
    console.error('checkin.context.profile_query_failed', profileErr);
    throw new Error('checkin_context_failed');
  }
  const timeZone = resolveTimeZone(profile?.timezone);

  const { windowStart, windowEnd } = lookbackWindowInTimeZone(CHECKIN_LOOKBACK_DAYS, timeZone);

  // `tracker_entries` has no direct `name`/`kind` columns (those live on
  // `trackers`) — PostgREST embedding via the FK gets both in one
  // round-trip, still filtered by `.eq('user_id', verifiedUserId)` on the
  // entries themselves (not just relying on the join) so a row can never
  // surface without that explicit ownership check.
  const { data, error } = await admin
    .from('tracker_entries')
    .select('tracker_id, entry_date, miss_category, miss_note, trackers!inner(id, name, kind, target, user_id)')
    .eq('user_id', verifiedUserId)
    .eq('missed', true)
    .gte('entry_date', windowStart)
    .lte('entry_date', windowEnd)
    .order('entry_date', { ascending: false });

  if (error) {
    console.error('checkin.context.query_failed', error);
    throw new Error('checkin_context_failed');
  }

  type Row = {
    tracker_id: string;
    entry_date: string;
    miss_category: string | null;
    miss_note: string | null;
    trackers: { id: string; name: string; kind: string; target: number | null; user_id: string } | null;
  };

  const missed_entries: MissedEntryContext[] = ((data ?? []) as unknown as Row[])
    // Defense in depth: the embedded tracker row is also filtered to this
    // user via the FK + RLS-bypass-aware `.eq` above being on the entry, not
    // the tracker — this extra guard means a row whose tracker
    // somehow doesn't match (shouldn't be reachable, entries can only be
    // created against the owner's own tracker per tracker-entries/route.ts)
    // is dropped rather than surfaced with a mismatched owner's tracker name.
    .filter((row) => row.trackers && row.trackers.user_id === verifiedUserId)
    .map((row) => ({
      tracker_id: row.tracker_id,
      tracker_name: row.trackers!.name,
      tracker_kind: row.trackers!.kind,
      target: row.trackers!.target,
      entry_date: row.entry_date,
      miss_category: row.miss_category,
      miss_note: row.miss_note,
    }));

  const { data: scheduleRows, error: scheduleErr } = await admin
    .from('schedule_blocks')
    .select('id, day_of_week, start_time, end_time, title')
    .eq('user_id', verifiedUserId)
    .order('day_of_week')
    .order('start_time');
  if (scheduleErr) {
    console.error('checkin.context.schedule_query_failed', scheduleErr);
    throw new Error('checkin_context_failed');
  }

  return {
    missed_entries,
    schedule_blocks: (scheduleRows ?? []) as ScheduleBlockContext[],
    window_start: windowStart,
    window_end: windowEnd,
  };
}
