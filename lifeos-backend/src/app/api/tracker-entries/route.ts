import { NextResponse } from 'next/server';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createTrackerEntrySchema, validateEntryDataAgainstFields } from '@/lib/validation/trackers';
import { resolveTimeZone, todayInTimeZone } from '@/lib/time';

export const GET = withApi(async (req, { user }) => {
  const admin = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const trackerId = searchParams.get('tracker_id');
  const from = searchParams.get('from'); // YYYY-MM-DD
  const to = searchParams.get('to');

  let query = admin
    .from('tracker_entries')
    .select('*')
    .eq('user_id', user.id)
    .order('entry_date', { ascending: false })
    .limit(500);

  // tracker_id is an optional filter here, not an ownership grant — it's
  // combined with .eq('user_id', user.id) above, so filtering by someone
  // else's tracker id just returns an empty list, never their entries.
  if (trackerId) query = query.eq('tracker_id', trackerId);
  if (from) query = query.gte('entry_date', from);
  if (to) query = query.lte('entry_date', to);

  const { data, error } = await query;
  if (error) return dbError('tracker_entries.list', error);

  return NextResponse.json({ entries: data });
});

export const POST = withApi(async (req, { user }) => {
  const parsed = await parseBody(req, createTrackerEntrySchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const admin = supabaseAdmin();

  // The critical ownership check (see advisor note): tracker_id is
  // client-supplied and the service-role client bypasses RLS, so without
  // this lookup a caller could log an entry against any guessed/enumerated
  // tracker id, including another user's — an IDOR that would also run
  // their `data` payload through a stranger's field schema below.
  const { data: tracker, error: trackerErr } = await admin
    .from('trackers')
    .select('id, kind, fields, target, archived_at')
    .eq('id', body.tracker_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (trackerErr) return dbError('tracker_entries.create.tracker_lookup', trackerErr);
  if (!tracker) return NextResponse.json({ error: 'tracker_not_found' }, { status: 404 });
  if (tracker.archived_at) return NextResponse.json({ error: 'tracker_archived' }, { status: 400 });

  if (tracker.kind === 'log') {
    const check = validateEntryDataAgainstFields(body.data, tracker.fields ?? []);
    if (!check.ok) return NextResponse.json({ error: 'invalid_data', message: check.message }, { status: 400 });
  } else if (body.data && Object.keys(body.data).length > 0) {
    return NextResponse.json({ error: 'data_only_allowed_on_log_kind' }, { status: 400 });
  }

  if (body.missed && !body.miss_category) {
    return NextResponse.json({ error: 'miss_category_required_when_missed' }, { status: 400 });
  }

  // Fallback only — the RN client's `TrackerCard` always sends `entry_date`
  // explicitly, computed from device-local time (see
  // `lifeos-frontend/src/lib/trackers.ts`'s `todayDateString()`), so this
  // branch only matters for a caller that omits it. Previously fell back to
  // bare server/UTC "today" (`new Date().toISOString().slice(0, 10)`), which
  // could write a date up to a day off from the user's actual local day near
  // midnight in either direction — now uses the same `profiles.timezone`
  // the AI context builders read the window in, so a caller that omits
  // `entry_date` still lands on the same calendar day everything else
  // agrees "today" means for this user.
  let timeZone = 'UTC';
  if (!body.entry_date) {
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('timezone')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileErr) return dbError('tracker_entries.create.profile_lookup', profileErr);
    timeZone = resolveTimeZone(profile?.timezone);
  }

  const isLogEntry = tracker.kind === 'log';
  const row = {
    tracker_id: tracker.id,
    user_id: user.id,
    entry_date: body.entry_date ?? todayInTimeZone(timeZone),
    value: body.value ?? null,
    data: isLogEntry ? (body.data ?? {}) : {},
    note: body.note ?? null,
    missed: body.missed ?? false,
    miss_category: body.missed ? body.miss_category : null,
    miss_note: body.missed ? (body.miss_note ?? null) : null,
    // Set from the server-verified tracker row, never from the client —
    // this is what migration 006's partial unique index keys off of to
    // enforce one-entry-per-day for every kind except 'log'.
    is_log_entry: isLogEntry,
  };

  // Non-log kinds: logging the same tracker+date twice updates today's
  // entry instead of creating a duplicate — matches the "one value per
  // tracker per day" model the Today view / missed-target rollover / review
  // context all assume. Log kind has no such constraint (multiple
  // structured notes per day are expected, e.g. several workout entries),
  // so it always inserts and never hits the conflict branch below.
  //
  // This is insert-then-update-on-conflict, not `.upsert()`: PostgREST's
  // `on_conflict=` (and supabase-js's `onConflict` option) only accepts a
  // column list, but migration 006's uniqueness is a *partial* index
  // (`WHERE is_log_entry = false`) — Postgres can only use ON CONFLICT
  // against a partial index if the statement itself repeats that exact
  // predicate, which neither PostgREST nor supabase-js exposes a way to
  // pass. Attempting `.upsert(row, { onConflict: 'tracker_id,entry_date' })`
  // fails at the DB with `42P10: no unique or exclusion constraint matching
  // the ON CONFLICT specification`. Doing it by hand (insert, catch 23505,
  // update) is the documented workaround and is race-safe: the unique index
  // is still the thing enforcing "one row", this code just decides what to
  // do when it's hit, same as the DB would via a real ON CONFLICT.
  const insertRes = await admin.from('tracker_entries').insert(row).select('*').single();

  if (!insertRes.error) {
    return NextResponse.json({ entry: insertRes.data }, { status: 201 });
  }

  if (insertRes.error.code !== '23505' || isLogEntry) {
    return dbError('tracker_entries.create', insertRes.error);
  }

  const { data, error } = await admin
    .from('tracker_entries')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('tracker_id', tracker.id)
    .eq('entry_date', row.entry_date)
    .eq('user_id', user.id) // redundant given `row` is server-built, but the same belt-and-suspenders applied everywhere else
    .select('*')
    .single();

  if (error) return dbError('tracker_entries.create.merge', error);

  return NextResponse.json({ entry: data }, { status: 200 });
});
