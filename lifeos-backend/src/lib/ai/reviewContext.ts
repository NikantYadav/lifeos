import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { REVIEW_LOOKBACK_DAYS } from '@/lib/validation/review';
import { lookbackWindowInTimeZone, resolveTimeZone } from '@/lib/time';

/**
 * Read-only context builder for the weekly Sunday Review — the generalized
 * successor to the old pre-Supabase `reviewContext.ts` (deleted, but still
 * inspectable via `git show <pre-migration commit>:src/lib/reviewContext.ts`
 * in this repo's history; see `validation/review.ts`'s doc comment for what
 * that old pipeline covered and why this one deliberately doesn't port all
 * of it). This is built fresh against generic `tracker_entries`, following
 * `checkinContext.ts` as the direct template, generalized from "only
 * missed entries" to "every entry in the window" — a weekly review needs to
 * say "you hit 6 of 7 days" just as much as it needs to explain misses.
 *
 * Strictly scoped to `user_id = verifiedUserId` on every query — never
 * takes a client-supplied user id, same IDOR discipline as
 * `checkinContext.ts` and every other route in this codebase.
 *
 * Shape: aggregated per-tracker weekly stats, not a raw dump of every entry
 * row. A full week's entries across several trackers is a worse reasoning
 * input than a pre-aggregated summary (days logged/hit/missed, miss-category
 * tallies, a bounded sample of note text) — the model doesn't need to count
 * rows itself, it needs the counts. This also keeps the prompt payload
 * bounded regardless of how many trackers or entries a user has.
 *
 * Date window: rolling `REVIEW_LOOKBACK_DAYS` days ending on the user's
 * LOCAL calendar "today" (`profiles.timezone`, via `lib/time.ts`) — see
 * `validation/review.ts`'s comment on why this is intentionally NOT the
 * same span as the once-per-calendar-week generation guard (that guard
 * stays UTC-instant-based on purpose; see `lib/time.ts`'s module comment
 * for the full reasoning on why the two don't share a definition). Same
 * per-user-timezone choice as `checkinContext.ts`, for the same reason —
 * see that file's comment for why the "UTC-written rows" justification an
 * earlier version of this comment gave was stale (the client already
 * writes local-calendar `entry_date`s; only the POST fallback was UTC, and
 * that's fixed alongside this file).
 */

export interface TrackerWeekSummary {
  tracker_id: string;
  tracker_name: string;
  tracker_kind: string;
  unit: string | null;
  target: number | null;
  days_logged: number;
  days_hit: number; // entries with missed=false (or missed not applicable, e.g. log kind)
  days_missed: number; // entries with missed=true
  miss_categories: Partial<Record<string, number>>; // tally, e.g. { too_busy: 2, tired: 1 }
  // Bounded sample of free text actually written this week — capped small,
  // not every note, so the prompt stays a fixed size regardless of how much
  // a user wrote. `entry_date` alongside each note lets the model reference
  // "on Tuesday you said...".
  note_samples: Array<{ entry_date: string; miss_note: string | null; note: string | null }>;
}

// Added alongside `trackers` so the model has something concrete to propose
// a `move_time_block` diff against, identical shape and reasoning to
// `checkinContext.ts`'s `ScheduleBlockContext` — read-only, same ownership
// scoping (`user_id = verifiedUserId`, never a client-supplied id). Kept as
// its own type (not re-exported from checkinContext.ts) to avoid a
// cross-feature import for what's a coincidentally-identical shape today —
// if one diverges later (e.g. review needs `plan_id`), they were never
// meant to be structurally coupled.
export interface ScheduleBlockContext {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string | null;
  title: string;
}

export interface ReviewContext {
  window_start: string; // YYYY-MM-DD, inclusive
  window_end: string; // YYYY-MM-DD, inclusive ("today")
  trackers: TrackerWeekSummary[];
  schedule_blocks: ScheduleBlockContext[];
}

const NOTE_SAMPLE_CAP = 5; // per tracker — bounds prompt size; the aggregate counts above already carry the "how many" signal, samples just carry "what it felt like"

export async function buildReviewContext(verifiedUserId: string): Promise<ReviewContext> {
  const admin = supabaseAdmin();

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('timezone')
    .eq('user_id', verifiedUserId)
    .maybeSingle();
  if (profileErr) {
    console.error('review.context.profile_query_failed', profileErr);
    throw new Error('review_context_failed');
  }
  const timeZone = resolveTimeZone(profile?.timezone);

  const { windowStart, windowEnd } = lookbackWindowInTimeZone(REVIEW_LOOKBACK_DAYS, timeZone);

  // Same embedding pattern as `checkinContext.ts`: PostgREST FK embed for
  // tracker name/kind/unit/target in one round-trip, still filtered by
  // `.eq('user_id', verifiedUserId)` on the entries themselves (never
  // relying on the join alone) so a row can never surface without that
  // explicit ownership check. Archived trackers are intentionally NOT
  // excluded here — an entry logged before archival is still real history
  // for "how was your week", even if the tracker itself is no longer active
  // (a `lower_target`/`raise_target` diff against an archived tracker is
  // separately blocked at apply time in the generate/decide routes, same
  // pattern as `checkin/decide/route.ts`'s `archived_at` check).
  const { data, error } = await admin
    .from('tracker_entries')
    .select('tracker_id, entry_date, missed, miss_category, miss_note, note, trackers!inner(id, name, kind, unit, target, user_id)')
    .eq('user_id', verifiedUserId)
    .gte('entry_date', windowStart)
    .lte('entry_date', windowEnd)
    .order('entry_date', { ascending: true });

  if (error) {
    console.error('review.context.query_failed', error);
    throw new Error('review_context_failed');
  }

  type Row = {
    tracker_id: string;
    entry_date: string;
    missed: boolean;
    miss_category: string | null;
    miss_note: string | null;
    note: string | null;
    trackers: { id: string; name: string; kind: string; unit: string | null; target: number | null; user_id: string } | null;
  };

  const rows = ((data ?? []) as unknown as Row[])
    // Defense in depth, same reasoning as checkinContext.ts's identical filter.
    .filter((row) => row.trackers && row.trackers.user_id === verifiedUserId);

  // `days_logged`/`days_hit`/`days_missed` must count DISTINCT entry_dates,
  // not rows: migration 007's `tracker_entries_one_per_day_non_log` only
  // constrains non-log trackers to one entry/day — a `kind: 'log'` tracker
  // can legitimately have several entries on the same day (e.g. multiple
  // workout logs), and counting rows there would report more "days" than
  // exist in the 7-day window (e.g. "logged 9 of 7 days"), a real distortion
  // in the narrative, not just an off-by-one. Tracked per tracker via a
  // Set of entry_dates seen for each bucket.
  const byTracker = new Map<string, TrackerWeekSummary>();
  const hitDatesByTracker = new Map<string, Set<string>>();
  const missedDatesByTracker = new Map<string, Set<string>>();
  const loggedDatesByTracker = new Map<string, Set<string>>();

  for (const row of rows) {
    const t = row.trackers!;
    let summary = byTracker.get(t.id);
    if (!summary) {
      summary = {
        tracker_id: t.id,
        tracker_name: t.name,
        tracker_kind: t.kind,
        unit: t.unit,
        target: t.target,
        days_logged: 0,
        days_hit: 0,
        days_missed: 0,
        miss_categories: {},
        note_samples: [],
      };
      byTracker.set(t.id, summary);
      hitDatesByTracker.set(t.id, new Set());
      missedDatesByTracker.set(t.id, new Set());
      loggedDatesByTracker.set(t.id, new Set());
    }

    loggedDatesByTracker.get(t.id)!.add(row.entry_date);
    if (row.missed) {
      missedDatesByTracker.get(t.id)!.add(row.entry_date);
      if (row.miss_category) {
        summary.miss_categories[row.miss_category] = (summary.miss_categories[row.miss_category] ?? 0) + 1;
      }
    } else {
      hitDatesByTracker.get(t.id)!.add(row.entry_date);
    }

    // Most recent notes first (matches the old pipeline's `.slice(-N)`
    // "most recent" convention) — rows arrive ascending by entry_date from
    // the query above, so unshift keeps the sample newest-first while
    // still bounded to NOTE_SAMPLE_CAP.
    if (row.miss_note || row.note) {
      const samples = summary.note_samples;
      samples.unshift({ entry_date: row.entry_date, miss_note: row.miss_note, note: row.note });
      if (samples.length > NOTE_SAMPLE_CAP) samples.length = NOTE_SAMPLE_CAP;
    }
  }

  for (const summary of byTracker.values()) {
    summary.days_logged = loggedDatesByTracker.get(summary.tracker_id)!.size;
    summary.days_hit = hitDatesByTracker.get(summary.tracker_id)!.size;
    summary.days_missed = missedDatesByTracker.get(summary.tracker_id)!.size;
  }

  const { data: scheduleRows, error: scheduleErr } = await admin
    .from('schedule_blocks')
    .select('id, day_of_week, start_time, end_time, title')
    .eq('user_id', verifiedUserId)
    .order('day_of_week')
    .order('start_time');
  if (scheduleErr) {
    console.error('review.context.schedule_query_failed', scheduleErr);
    throw new Error('review_context_failed');
  }

  return {
    window_start: windowStart,
    window_end: windowEnd,
    trackers: [...byTracker.values()],
    schedule_blocks: (scheduleRows ?? []) as ScheduleBlockContext[],
  };
}
