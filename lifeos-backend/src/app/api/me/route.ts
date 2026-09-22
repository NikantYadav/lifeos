import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { checkEntitlement } from '@/lib/entitlement';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isValidTimeZone } from '@/lib/time';

/**
 * Reference implementation for every other route in this backend, now
 * built on `withApi` (see lib/apiRoute.ts):
 *   1. `withApi` verifies the Bearer token against Supabase Auth before the
 *      handler ever runs — never trust a client-supplied user id.
 *   2. `entitlement: false` here is the one deliberate opt-out: this route
 *      must keep working even for an expired trial, since it's what lets
 *      the client render the paywall/trial-countdown UI in the first place.
 *      Every other data route leaves entitlement gating on by default.
 *   3. Every query against the service-role client is still filtered by the
 *      verified user id explicitly, even though RLS would also block a
 *      cross-user read — belt and suspenders (see supabaseAdmin.ts).
 */
export const GET = withApi(async (_req, { user }) => {
  const admin = supabaseAdmin();

  const [{ data: profile, error: profileError }, entitlement] = await Promise.all([
    admin.from('profiles').select('*').eq('user_id', user.id).single(),
    checkEntitlement(user.id),
  ]);

  if (profileError || !profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 404 });
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile,
    entitlement,
  });
}, { entitlement: false });

// Inlined here rather than added to `lib/validation/*.ts`: this schema is
// small (one optional field), specific to this route, and other concurrent
// work is editing files under that directory for unrelated fixes — adding a
// new file there isn't worth the collision risk for one field.
const updateProfileSchema = z
  .object({
    // IANA identifier (e.g. "Asia/Kolkata"), the standard input RN's
    // `Intl.DateTimeFormat().resolvedOptions().timeZone` already gives on
    // both Android and iOS — no new client dependency needed to produce
    // this value. Validated by actually constructing a formatter with it
    // (`isValidTimeZone`) rather than a regex, so any zone ICU on this
    // server recognizes is accepted, and anything else is rejected before
    // it can ever reach `checkinContext.ts`/`reviewContext.ts`/
    // `tracker-entries/route.ts`'s timezone-aware date math.
    timezone: z.string().refine(isValidTimeZone, { message: 'not a recognized IANA timezone identifier' }).optional(),
  })
  .strict();

/**
 * Lets the authenticated user set `profiles.timezone` — this is the ONLY
 * write path for that column anywhere in this codebase (`handle_new_user`
 * only inserts `user_id`, relying on the column's `DEFAULT 'UTC'`). Without
 * this route, `profiles.timezone` would stay stuck at 'UTC' forever for
 * every user, which is exactly the bug this whole fix is about — the column
 * existing unused. `entitlement: false` matches GET: a user mid-paywall
 * should still be able to correct their timezone so `/api/checkin`,
 * `/api/review`, and tracker-entry writes reason about the right calendar
 * day the moment entitlement is restored, not after.
 *
 * NOTE: the RN client does not call this yet as of this fix — wiring
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` into onboarding/
 * settings on the client is separate frontend work, out of scope here
 * (this task is backend-only). Until the client calls this, every profile
 * stays at the DB default 'UTC', so the day-boundary fix in
 * `checkinContext.ts`/`reviewContext.ts`/`tracker-entries/route.ts` is
 * live-correct today but has no live-nonUTC user to observe it working
 * without a manual DB write — see this task's verification notes.
 */
export const PATCH = withApi(async (req, { user }) => {
  const parsed = await parseBody(req, updateProfileSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  if (body.timezone === undefined) {
    return NextResponse.json({ error: 'no_fields_to_update' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('profiles')
    .update({ timezone: body.timezone, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (error) return dbError('me.update', error);

  return NextResponse.json({ profile: data });
}, { entitlement: false });
