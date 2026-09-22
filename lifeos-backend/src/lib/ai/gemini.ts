import 'server-only';
import { GoogleGenAI, Type, type Schema } from '@google/genai';

/**
 * Single choke point for every Gemini call this backend makes (onboarding
 * chat + extraction now; the daily check-in and Sunday review will reuse
 * this same module later, per the lifeos-public-app-direction memory's
 * instruction to generalize the old reviewContext.ts/gemini.ts pattern
 * rather than re-invent it per feature).
 *
 * Deliberately narrow: callers never touch the `@google/genai` client
 * directly, so swapping providers/SDK versions later only means changing
 * this file. Model id comes from `GEMINI_MODEL` (never hardcoded — the env
 * example file explicitly calls this out as "override if the default model
 * id is retired"), and a missing `GEMINI_API_KEY` is a clean "AI disabled"
 * state, not a crash — matches `.env.local.example`'s own comment ("Leave
 * empty to disable AI features locally").
 */

let cached: GoogleGenAI | null | undefined;

function client(): GoogleGenAI | null {
  if (cached !== undefined) return cached;

  const apiKey = process.env.GEMINI_API_KEY;
  cached = apiKey ? new GoogleGenAI({ apiKey }) : null;
  return cached;
}

export function isAiEnabled(): boolean {
  return client() !== null;
}

function model(): string {
  // No hardcoded fallback model id — if GEMINI_MODEL isn't set, that's a
  // deploy misconfiguration to surface loudly, not paper over with a guess
  // at a model id that might not exist or might be the wrong tier.
  const m = process.env.GEMINI_MODEL;
  if (!m) throw new Error('GEMINI_MODEL must be set when GEMINI_API_KEY is set — see .env.local.example.');
  return m;
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

/** Plain conversational turn — no structured output, used for the back-and-forth chat itself. */
export async function chatReply(systemInstruction: string, history: ChatTurn[]): Promise<string> {
  const ai = client();
  if (!ai) throw new Error('ai_disabled');

  const response = await ai.models.generateContent({
    model: model(),
    contents: history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    config: { systemInstruction },
  });

  const text = response.text;
  if (!text) throw new Error('ai_empty_response');
  return text;
}

/**
 * Structured-extraction call: same conversation, but constrained to emit
 * JSON matching `schema`. Still parsed and re-validated by the caller with
 * Zod afterward — `responseSchema` shapes the model's output, it does not
 * make that output trusted input. A provider can drift from the schema it
 * was given; only our own Zod re-check is the actual gate.
 *
 * `schema` deliberately carries no `maxLength`/`maxItems` (see the long
 * comment in `onboardingPrompt.ts` — those numeric constraints trigger a
 * live, reproducible 400 from this API on schemas of this shape), so
 * `maxOutputTokens` is the backstop against a runaway response instead: a
 * real live test produced a 160KB+ JSON blob with no count guidance beyond
 * plain-English instructions. This caps worst-case cost/latency; Zod still
 * owns the actual per-field/per-array size limits on whatever comes back
 * under this cap.
 *
 * **`MAX_TOKENS` truncation flake (2026-09-22, twelfth session) — the real
 * cause was `thinkingConfig.thinkingBudget: 0`, NOT plain output verbosity,
 * CORRECTING the prior documented diagnosis, though the fix below REDUCES
 * rather than ELIMINATES the flake — see the numbers below before assuming
 * this is fully solved.** (The lifeos-public-app-direction memory's pointer
 * item 3 said this was "confirmed NOT a thinking-budget issue" — that
 * confirmation was real but was checking a DIFFERENT symptom, thinking
 * tokens alone exhausting the cap before any output token, on
 * `gemini-3.8-flash`; it did not rule out what's actually happening here on
 * `gemini-3.5-flash`.) Live-reproduced: at `maxOutputTokens` 8000, 16000,
 * AND 32000 (thinking off), a truncating call always consumed EXACTLY
 * `cap - 17` tokens (7983/15983/31983) — response size scaling linearly
 * with the cap it was given is the signature of a runaway/degenerate
 * generation, not a response that's merely long. Inspecting the actual
 * truncated text confirmed it: NOT an unbounded `diffs` array (the response
 * still had exactly one diff object, `"ref"`/`"kind"` each appearing once)
 * but a single STRING field (`tracker_name`) stuck in a repetition loop
 * ("Target 1.5. Target 1.5. ..." for thousands of tokens, never terminating
 * on its own) — the SAME loop was later observed landing inside a
 * `reason`/`tracker_name` field even WITH thinking back on, just caught by
 * Zod's 100-char field cap instead of the 16000-token output cap, so this
 * is a real, probabilistic-per-token failure mode of the model itself, not
 * something either knob fully closes off.
 *
 * A/B against the live API: 12 calls (simplified prompt) WITH
 * `thinkingBudget: 0` truncated 1 in 4 (matching the previously-documented
 * "3 of 8" rate); 12 calls with `thinkingConfig` removed (default thinking)
 * truncated 0 times on that SAME simplified prompt. But against the REAL
 * `CHECKIN_SYSTEM_INSTRUCTION`/`CHECKIN_RESPONSE_SCHEMA` — thinking on — a
 * further 14 calls still truncated 3 times (~21%), down from ~37% but not
 * zero. **Fix applied: `thinkingConfig` removed from this call entirely**
 * (not set to a specific positive budget — that was never tested, "default
 * thinking" is exactly what was verified against) — this is a real,
 * substantial reduction in the flake rate, not a full fix, and
 * `maxOutputTokens` raised from 8000 to 16000 alongside it as real headroom
 * (thinking tokens count against this same cap — ~700-1500 observed per
 * clean call), not because either change eliminates the failure mode.
 * Chosen under the model's real live-queried limit (`gemini-3.5-flash`'s
 * `outputTokenLimit` is 65536 as of this session, confirmed via `GET
 * /v1beta/models`, not assumed) — still meant as a backstop against a
 * genuinely pathological response (Zod owns real size gating, see the
 * paragraph above), not a blank check, so not raised all the way to the
 * model ceiling (also: raising the cap further does NOT help — the runaway
 * scales linearly with whatever cap it's given, so a higher cap just makes
 * a truncating call slower/costlier before still truncating).
 *
 * A second, independent bug was found while investigating this (NOT caused
 * by the thinking change — reproduced identically with `thinkingBudget: 0`
 * too, so it's pre-existing): the model frequently states a specific new
 * target number in a `lower_target` diff's prose `reason` field ("lowering
 * to 1.5 hours") while leaving the STRUCTURED `proposed_target` field
 * completely absent, which `checkinProposalSchema`'s `.superRefine` (Zod)
 * correctly rejects as `lower_target diffs require proposed_target` —
 * surfaced now because it's no longer being masked by the more-frequent
 * truncation failure. NOT fixed this session (see this session's
 * build-status report for why: it can't be forced at the `responseSchema`
 * level without making the field required across every diff kind sharing
 * this flat schema, including kinds that must NOT have it, and this
 * codebase's own precedent — `move_time_block`'s `proposed_end_time`
 * saga — is that stronger REQUIRED wording in the prompt alone has already
 * failed to reliably fix an identical-shaped omission once before).
 *
 * `generateStructured` is shared by onboarding's `/propose`, check-in, and
 * review — onboarding's extraction call is what `thinkingBudget: 0` was
 * ORIGINALLY added for (a much larger multi-branch schema), so removing it
 * here was re-verified end-to-end against a real `POST /api/onboarding`
 * chat turn + `POST /api/onboarding/propose` call before trusting this
 * change: both returned 200 with a real, valid, non-truncated proposal.
 */
export async function generateStructured(
  systemInstruction: string,
  history: ChatTurn[],
  schema: Schema
): Promise<unknown> {
  const ai = client();
  if (!ai) throw new Error('ai_disabled');

  const response = await ai.models.generateContent({
    model: model(),
    contents: history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: schema,
      maxOutputTokens: 16000,
      // `thinkingConfig` deliberately OMITTED (default thinking budget) —
      // see the long comment above this function for the live A/B evidence
      // this reverses an earlier `thinkingBudget: 0` choice. Thinking tokens
      // still count against `maxOutputTokens` above (confirmed via
      // `usageMetadata.thoughtsTokenCount` in every clean run, ~700-1500
      // tokens observed), which is exactly why that cap was raised alongside
      // this change rather than left at its old value.
    },
  });

  // Distinguished from a plain JSON.parse failure below: a MAX_TOKENS cutoff
  // means the response was truncated mid-object, so `response.text` is
  // guaranteed-invalid JSON by construction, not "the model emitted
  // garbage" — the caller (and its retry-on-invalid-JSON logic, if any)
  // should treat this differently, since retrying the identical request
  // will hit the same cap and truncate again.
  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    // Logged so a post-fix live check can show real headroom (e.g. "used
    // 5000 of 16000") rather than just "didn't truncate this run" — the
    // flake was intermittent (3 of 8 calls) before this fix, so absence of
    // truncation in a handful of calls alone isn't strong evidence.
    console.error('gemini.generateStructured.truncated', response.usageMetadata);
    throw new Error('ai_response_truncated');
  }

  const text = response.text;
  if (!text) throw new Error('ai_empty_response');

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('ai_invalid_json');
  }
}

// Re-exported so callers building a `responseSchema` don't need their own
// `@google/genai` import just for the `Type` enum.
export { Type };
export type { Schema };
