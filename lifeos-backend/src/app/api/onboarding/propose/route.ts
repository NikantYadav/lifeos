import { NextResponse } from 'next/server';
import { dbError, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateStructured, isAiEnabled, type ChatTurn } from '@/lib/ai/gemini';
import { ONBOARDING_EXTRACTION_SYSTEM_INSTRUCTION, ONBOARDING_PROPOSAL_RESPONSE_SCHEMA } from '@/lib/ai/onboardingPrompt';
import { onboardingProposalSchema } from '@/lib/validation/onboarding';

/**
 * Runs the structured-extraction step against the session's transcript so
 * far and stores the result as `proposed_plan` — a separate step from the
 * chat itself (see route.ts) so the conversational turns never have to
 * think about the extraction schema, and so the user can re-run this
 * (calling it again just re-extracts and overwrites `proposed_plan`, which
 * is intentional — nothing is committed yet at this stage) after a couple
 * more chat turns if the first proposal missed something.
 *
 * The model's JSON is Zod-validated here (Phase 0 discipline: AI output is
 * untrusted input) — this is the FIRST validation pass; `commit/route.ts`
 * re-validates independently on whatever body the client actually submits,
 * since the user is allowed to hand-edit the proposal before accepting it.
 */
export const POST = withApi(async (_req, { user }) => {
  if (!isAiEnabled()) {
    return NextResponse.json({ error: 'ai_disabled' }, { status: 503 });
  }

  const admin = supabaseAdmin();

  const { data: session, error: findErr } = await admin
    .from('onboarding_sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('applied', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) return dbError('onboarding.propose.find', findErr);
  if (!session) return NextResponse.json({ error: 'no_active_session' }, { status: 404 });

  const transcript: ChatTurn[] = Array.isArray(session.transcript) ? session.transcript : [];
  if (transcript.length === 0) {
    return NextResponse.json({ error: 'transcript_empty' }, { status: 400 });
  }

  // The Gemini API rejects a `generateContent` call whose final turn has
  // role "model" ("Requests ending with a model turn are not supported") —
  // found by actually running this against the live API, not something the
  // SDK's types surface. The chat transcript naturally ends on a model
  // reply (the assistant's last message), so the extraction call appends
  // its own trailing user-role instruction turn requesting the structured
  // plan now. This turn is local to this call only — never persisted back
  // onto `session.transcript`, since it isn't part of the actual
  // conversation the user had.
  const extractionRequest: ChatTurn[] = [
    ...transcript,
    { role: 'user', text: 'Please produce the structured plan now, based on our conversation above.' },
  ];

  // The Gemini `responseSchema` given here carries no numeric constraints
  // at all (see the long comment in onboardingPrompt.ts on why — they
  // trigger a live, reproducible 400 on this API), so it's a much looser
  // guardrail than it looks: the model can and does occasionally emit a
  // value Zod rejects (a real run produced `day_of_week: 7`). One retry
  // with the validation error fed back is worth it before failing the
  // whole call — Zod stays the actual gate either way, this is purely to
  // save the user from having to re-chat over what's usually a one-field
  // slip.
  let raw: unknown;
  let parsed: ReturnType<typeof onboardingProposalSchema.safeParse> | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const request =
      attempt === 0
        ? extractionRequest
        : [
            ...extractionRequest,
            { role: 'model' as const, text: JSON.stringify(raw) },
            {
              role: 'user' as const,
              text: `That JSON was invalid: ${parsed?.success === false ? parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : ''}. Please correct it and return valid JSON matching the schema.`,
            },
          ];

    try {
      raw = await generateStructured(ONBOARDING_EXTRACTION_SYSTEM_INSTRUCTION, request, ONBOARDING_PROPOSAL_RESPONSE_SCHEMA);
    } catch (err) {
      // Truncation isn't worth retrying here: the retry-with-correction
      // path above appends the (already-truncated) bad JSON back into the
      // conversation and asks for a fix, which only grows the prompt and
      // hits the same maxOutputTokens cap again. Surfaced distinctly so the
      // client can react differently than to a generic upstream failure
      // (e.g. "try a shorter conversation" vs "try again").
      if (err instanceof Error && err.message === 'ai_response_truncated') {
        console.error('onboarding.propose.truncated');
        return NextResponse.json({ error: 'ai_response_truncated' }, { status: 502 });
      }
      console.error('onboarding.propose.ai_error', err);
      return NextResponse.json({ error: 'ai_error' }, { status: 502 });
    }

    parsed = onboardingProposalSchema.safeParse(raw);
    if (parsed.success) break;
    console.error(`onboarding.propose.invalid_shape (attempt ${attempt})`, parsed.error.issues);
  }

  if (!parsed?.success) {
    // The model produced JSON that doesn't satisfy our own schema even with
    // responseSchema constraining it and one corrective retry — a provider
    // can drift from the shape it was given, so this is a real (if
    // hopefully rare) path, not dead code. Surfaced as a 502 (upstream
    // produced something we can't use), never persisted, and never exposes
    // the raw model output or Zod's internal issue paths to the client.
    return NextResponse.json({ error: 'ai_produced_invalid_proposal' }, { status: 502 });
  }

  const { data: updated, error: updateErr } = await admin
    .from('onboarding_sessions')
    .update({ proposed_plan: parsed.data })
    .eq('id', session.id)
    .eq('user_id', user.id)
    .select('*')
    .single();
  if (updateErr) return dbError('onboarding.propose.update', updateErr);

  return NextResponse.json({ session: updated });
});
