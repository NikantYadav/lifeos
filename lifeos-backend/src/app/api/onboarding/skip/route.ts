import { NextResponse } from 'next/server';
import { dbError, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * The escape hatch ROADMAP.md Phase 2 requires: "always let the user skip
 * the chat and start blank." Marks the active session applied (so it stops
 * being the target of further chat/propose calls — same CAS-by-predicate
 * shape as commit, since a stale "in progress" onboarding session should
 * never silently keep accepting messages after the user has moved on) and
 * sets `onboarding_status: 'skipped'`, distinct from `'completed'` so
 * anything that later branches on this column (an AI review, an analytics
 * query, a future "resume onboarding" prompt) can tell the difference
 * between "built a real plan" and "chose not to."
 *
 * Idempotent by design: skipping twice, or skipping when there was never an
 * active session, both just return the current profile status rather than
 * erroring — there's no state this could corrupt by running twice.
 */
export const POST = withApi(async (_req, { user }) => {
  const admin = supabaseAdmin();

  const { error: sessionErr } = await admin
    .from('onboarding_sessions')
    .update({ applied: true, applied_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('applied', false);
  if (sessionErr) return dbError('onboarding.skip.session', sessionErr);

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .update({ onboarding_status: 'skipped' })
    .eq('user_id', user.id)
    .select('onboarding_status')
    .single();
  if (profileErr) return dbError('onboarding.skip.profile', profileErr);

  return NextResponse.json({ onboarding_status: profile.onboarding_status });
});
