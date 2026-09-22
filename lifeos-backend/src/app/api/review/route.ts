import { NextResponse } from 'next/server';
import { dbError, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { weekStartInTimeZone, resolveTimeZone } from '@/lib/time';

/**
 * Returns this week's Sunday Review (`reviews` row, `kind: 'weekly'`) for
 * the authenticated user, or `{ review: null }` if none has been generated
 * this calendar week yet — mirrors `checkin/route.ts`'s GET-returns-current-
 * state shape exactly, including never creating a row as a side effect:
 * generation is a deliberate, explicit action with its own AI cost (see
 * /generate), not something a plain GET should trigger.
 *
 * "This week" is scoped by `reviews.local_week` (Monday-start, the user's
 * own local calendar week via `profiles.timezone` and `lib/time.ts`'s
 * `weekStartInTimeZone` — migration
 * `011_reviews_local_day_week_generation_guards`), matching exactly what
 * `/generate` writes and its own once-per-local-week guard checks against,
 * so this route can never disagree with `/generate` about what "this week"
 * means for this user. See `reviewContext.ts`'s comment for why this is
 * still a different boundary than the context builder's rolling 7-day
 * window (unrelated concern, not affected by this change).
 */
export const GET = withApi(async (_req, { user }) => {
  const admin = supabaseAdmin();

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileErr) return dbError('review.get.profile', profileErr);
  const timeZone = resolveTimeZone(profile?.timezone);
  const localWeek = weekStartInTimeZone(timeZone);

  const { data, error } = await admin
    .from('reviews')
    .select('*')
    .eq('user_id', user.id)
    .eq('kind', 'weekly')
    .eq('local_week', localWeek)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return dbError('review.get', error);

  return NextResponse.json({ review: data ?? null });
});
