import { NextResponse } from 'next/server';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chatReply, isAiEnabled, type ChatTurn } from '@/lib/ai/gemini';
import { ONBOARDING_CHAT_SYSTEM_INSTRUCTION } from '@/lib/ai/onboardingPrompt';
import { chatMessageSchema, MAX_ONBOARDING_SESSIONS, MAX_TRANSCRIPT_TURNS } from '@/lib/validation/onboarding';

/**
 * The onboarding chat session, one per user (matching `onboarding_sessions`
 * having no unique constraint on `user_id` at the DB level, but this route
 * always operates on "the most recent unapplied session", creating one if
 * none exists — a user only ever has one *active* onboarding conversation
 * at a time, even though nothing stops a past applied session from staying
 * in the table as history).
 *
 * GET returns the current session (creating an empty one on first call) so
 * the RN chat screen has something to render immediately on mount.
 * POST appends a user message, gets a model reply, and persists both in the
 * same transcript array — extraction into a structured proposal is a
 * separate step (`/api/onboarding/propose`), not part of this route, so the
 * chat itself never has to think about the extraction schema.
 */

type Turn = { role: 'user' | 'model'; text: string };

type SessionResult = { session: Record<string, unknown> } | { error: NextResponse };

async function getOrCreateSession(userId: string): Promise<SessionResult> {
  const admin = supabaseAdmin();

  const { data: existing, error: findErr } = await admin
    .from('onboarding_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('applied', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) return { error: dbError('onboarding.find', findErr) };
  if (existing) return { session: existing };

  // Per-user lifetime cap on total sessions started (see migration 009 +
  // MAX_ONBOARDING_SESSIONS' doc comment in validation/onboarding.ts for the
  // abuse scenario this closes and the reasoning behind the chosen limit).
  // `start_onboarding_session` does the increment-and-check AND the insert
  // in one SQL statement/transaction — the increment is guarded by
  // `onboarding_sessions_started_count < p_limit` inside the UPDATE's own
  // WHERE clause (not a preceding SELECT), so row-level locking on the
  // single `profiles` row makes this race-free under concurrent requests
  // from the same user, not merely "acceptably racy": a second concurrent
  // call blocks until the first's transaction resolves, then re-evaluates
  // the WHERE clause against the now-current count. Returns null (not an
  // error) when the cap is already hit, distinguishing "at cap" from a
  // genuine DB failure.
  // `start_onboarding_session` is declared `returns public.onboarding_sessions`
  // (a single composite row), not `setof` — PostgREST returns that row as a
  // plain JSON object directly, no `.maybeSingle()` needed/applicable the
  // way a `setof`-returning function or table select would use it. No
  // generated Supabase types exist in this project (see the 2026-09-22
  // review session's `trackers.target`-comes-back-as-a-string landmine
  // note), so the RPC result is asserted, not inferred, matching that same
  // documented gap.
  //
  // Real live bug caught here, not just reasoned about: when the SQL
  // function's own `return null` fires (cap already hit), PostgREST does
  // NOT hand supabase-js a JS `null` for a non-setof composite return —
  // it row-to-jsons the NULL composite into `{id: null, user_id: null,
  // transcript: null, ...}`, a truthy object. A plain `if (!created)`
  // check never fired, so a capped user's GET returned 200 with an
  // all-null fake "session" (confirmed live), and POST 500'd downstream
  // when it tried to read `.applied`/`.transcript` off that null-shaped
  // object. Checking `created.id == null` (the primary key, always
  // non-null on a REAL row) instead of the object's own truthiness is what
  // actually distinguishes "capped" from "created" here.
  const { data: created, error: createErr } = await admin.rpc('start_onboarding_session', {
    p_user_id: userId,
    p_limit: MAX_ONBOARDING_SESSIONS,
  });
  if (createErr) return { error: dbError('onboarding.create', createErr) };
  if (!created || (created as { id: string | null }).id == null) {
    return {
      error: NextResponse.json({ error: 'onboarding_session_limit_reached' }, { status: 409 }),
    };
  }
  return { session: created as Record<string, unknown> };
}

export const GET = withApi(async (_req, { user }) => {
  const result = await getOrCreateSession(user.id);
  if ('error' in result) return result.error;
  return NextResponse.json({ session: result.session });
});

export const POST = withApi(async (req, { user }) => {
  const parsed = await parseBody(req, chatMessageSchema);
  if ('error' in parsed) return parsed.error;

  const admin = supabaseAdmin();

  const result = await getOrCreateSession(user.id);
  if ('error' in result) return result.error;
  const session = result.session;

  // No `session.applied` check here: `getOrCreateSession` only ever returns
  // a row it just selected with `.eq('applied', false)` or one it just
  // inserted (which defaults `applied` to `false` — see migration 004), so
  // `session.applied` can never be true at this point. A prior version of
  // this route had a dead `if (session.applied) return 409` branch here;
  // removed after independently re-confirming (2026-09-22) both the column
  // default and the query shape make it structurally unreachable.
  const transcript: Turn[] = Array.isArray(session.transcript) ? session.transcript : [];
  if (transcript.length >= MAX_TRANSCRIPT_TURNS) {
    return NextResponse.json({ error: 'transcript_turn_limit_reached' }, { status: 409 });
  }

  if (!isAiEnabled()) {
    return NextResponse.json({ error: 'ai_disabled' }, { status: 503 });
  }

  const nextTranscript: Turn[] = [...transcript, { role: 'user', text: parsed.data.message }];

  let reply: string;
  try {
    reply = await chatReply(
      ONBOARDING_CHAT_SYSTEM_INSTRUCTION,
      nextTranscript.map((t): ChatTurn => ({ role: t.role, text: t.text }))
    );
  } catch (err) {
    console.error('onboarding.chat.ai_error', err);
    return NextResponse.json({ error: 'ai_error' }, { status: 502 });
  }

  nextTranscript.push({ role: 'model', text: reply });

  const { data: updated, error: updateErr } = await admin
    .from('onboarding_sessions')
    .update({ transcript: nextTranscript })
    .eq('id', session.id)
    .eq('user_id', user.id)
    .select('*')
    .single();
  if (updateErr) return dbError('onboarding.update', updateErr);

  // Onboarding is now visibly underway — flips the flag the RN app (and any
  // future routing logic) uses to decide whether to route a user into the
  // onboarding flow vs. straight to the app shell. `not_started -> completed`
  // happens once, on commit (see commit/route.ts); `-> skipped` is the
  // escape-hatch path, not implemented by this route.
  if (transcript.length === 0) {
    await admin
      .from('profiles')
      .update({ onboarding_status: 'in_progress' })
      .eq('user_id', user.id)
      .eq('onboarding_status', 'not_started');
  }

  return NextResponse.json({ session: updated });
});
