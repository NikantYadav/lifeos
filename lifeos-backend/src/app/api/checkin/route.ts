import { NextResponse } from 'next/server';
import { dbError, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { todayInTimeZone, resolveTimeZone } from '@/lib/time';

/**
 * Returns today's daily check-in (`reviews` row, `kind: 'daily_checkin'`)
 * for the authenticated user, or `{ checkin: null }` if none has been
 * generated yet today — mirrors onboarding/route.ts's GET-returns-current-
 * state shape, except this route never CREATES a row (unlike
 * `getOrCreateSession` in onboarding): generation is a deliberate, explicit
 * action with its own AI cost (see /generate), not something a plain GET
 * should trigger as a side effect.
 *
 * "Today" is scoped by `reviews.local_day` (the user's own local calendar
 * day, via `profiles.timezone` and `lib/time.ts`'s `todayInTimeZone` —
 * migration `011_reviews_local_day_week_generation_guards`), matching
 * exactly what `/generate` writes and its own once-per-local-day guard
 * checks against, so this route can never disagree with `/generate` about
 * what "today" means for this user.
 */
export const GET = withApi(async (_req, { user }) => {
  const admin = supabaseAdmin();

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileErr) return dbError('checkin.get.profile', profileErr);
  const timeZone = resolveTimeZone(profile?.timezone);
  const localDay = todayInTimeZone(timeZone);

  const { data, error } = await admin
    .from('reviews')
    .select('*')
    .eq('user_id', user.id)
    .eq('kind', 'daily_checkin')
    .eq('local_day', localDay)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return dbError('checkin.get', error);

  return NextResponse.json({ checkin: data ?? null });
});
