import { apiFetch } from './api';
import type { MissCategory } from './trackers';

/**
 * Types mirror lifeos-backend's actual weekly Sunday Review response shapes
 * exactly (see src/app/api/review/route.ts, review/generate/route.ts,
 * review/decide/route.ts, and lib/validation/review.ts there) — same
 * convention as lib/checkin.ts/lib/trackers.ts/lib/onboarding.ts. Read
 * directly off `reviewProposalSchema`/`proposedReviewDiffSchema`/
 * `reviewDecisionSchema` in `validation/review.ts`, not off check-in's
 * prose or this file's own sibling by pattern-matching — review's shapes
 * differ from check-in's in a few load-bearing ways, documented below.
 *
 * Differences from lib/checkin.ts, worth calling out because it's easy to
 * get wrong from memory/pattern-matching check-in:
 *  - `ReviewDiffKind` is `'lower_target' | 'raise_target' | 'no_change'` —
 *    an extra directional kind check-in doesn't have (`raise_target`: a
 *    full week of data is enough signal to justify raising a consistently-
 *    hit target). There is NO `move_time_block` kind here as of this
 *    writing — `reviewDiffKindSchema` in the backend was re-read fresh
 *    immediately before writing this file and does not include it. If a
 *    future backend change adds it, `ReviewDiffKind` and `DiffRow` in
 *    `ReviewCard.tsx` both need updating; `DiffRow`'s fallback rendering
 *    (reason + accept/reject, no target line) already renders an unknown
 *    kind safely in the meantime.
 *  - There is NO `'edit'` decision value, same as check-in.
 *    `reviewDecisionSchema` is `z.enum(['accept', 'reject'])`, `.strict()`.
 *    "Edit" = `decision: 'accept'` with a caller-supplied `edited_target`
 *    substituted for the AI's `proposed_target` — the backend's
 *    superRefine 400s if `edited_target` is set on a `reject`.
 *  - **`result.errors` on a successful `decide` is NOT retryable, same
 *    non-retryable semantics as check-in's documented behavior, but
 *    confirmed independently here rather than copied**: `review/decide/
 *    route.ts` writes `nextDecisions[decision.ref] = decision.decision`
 *    unconditionally before the tracker lookup/update that can fail (this
 *    ordering was fixed for check-in's decide route this session but NOT
 *    for review's — see this file's own build-status report). A ref that
 *    lands in `result.errors` is already burned; re-deciding it 409s
 *    (`diff_already_decided`). Callers must surface a non-empty
 *    `result.errors` visibly and must NOT offer a retry affordance on that
 *    row.
 *  - `pattern` defaults to `''` (empty string), never `null`, same as
 *    check-in (`generate/route.ts`'s `parsed.data.pattern ?? ''`) — typed
 *    defensively here regardless.
 *  - `diffs` on a proposal can be an empty array — and unlike check-in,
 *    where an empty array can mean either "nothing to flag" or "no misses",
 *    for review an empty array specifically means a GOOD week (every
 *    target was hit) — see `no_weekly_activity` below for the genuinely
 *    empty case, which is a different (404, no review stored) condition
 *    entirely. `week_index` is always `null` on this feature's rows
 *    (deliberately unpopulated server-side, see `validation/review.ts`).
 */

export type ReviewDiffKind = 'lower_target' | 'raise_target' | 'no_change';

export interface ProposedReviewDiff {
  ref: string;
  kind: ReviewDiffKind;
  tracker_id?: string;
  tracker_name?: string;
  current_target?: number;
  proposed_target?: number;
  reason: string;
}

export type ReviewDecisionValue = 'accept' | 'reject';

export interface Review {
  id: string;
  user_id: string;
  kind: 'daily_checkin' | 'weekly';
  week_index: number | null;
  generated_at: string;
  narrative: string;
  pattern: string;
  proposed_diffs: ProposedReviewDiff[];
  diff_decisions: Record<string, ReviewDecisionValue>;
  edited_values: Record<string, { target: number }> | null;
  created_at: string;
}

/** The body `POST /api/review/decide` accepts: `{ decisions: [...] }`, at most 6 per call, `.strict()`. */
export interface ReviewDecisionInput {
  ref: string;
  decision: ReviewDecisionValue;
  edited_target?: number;
}

export interface ReviewDecideResult {
  applied: { ref: string; tracker_id: string; new_target: number }[];
  rejected: string[];
  errors: string[];
}

export function getThisWeekReview(): Promise<{ review: Review | null }> {
  return apiFetch('/api/review');
}

/**
 * Builds this week's Sunday Review — a real Gemini call, so this must only
 * ever be fired by an explicit user action (a button tap), never
 * automatically on screen mount, matching check-in's identical cost-
 * consciousness constraint. Can reject with a documented `ApiError` whose
 * `.body.error` is one of: `review_already_generated_this_week` (409 — a
 * review already exists for this calendar week, caller should refetch
 * `getThisWeekReview()` rather than show this as an error), `no_weekly_activity`
 * (404 — NOT the same condition as check-in's `no_recent_misses`: this
 * fires when there are zero `tracker_entries` at all in the lookback
 * window, i.e. genuinely nothing to review yet, e.g. a brand-new user — a
 * week with entries and zero misses is a real, positive review and comes
 * back as a normal 201 with an empty `proposed_diffs`, not this 404),
 * `ai_disabled` (503), `ai_response_truncated` / `ai_error` /
 * `ai_produced_invalid_proposal` (502), `review_context_failed` (500 — note
 * this is `review_context_failed`, not check-in's `checkin_context_failed`).
 */
export function generateReview(): Promise<{ review: Review }> {
  return apiFetch('/api/review/generate', { method: 'POST' });
}

/**
 * Submits one or more diff decisions (accept/reject, optionally with
 * `edited_target` on an accept) in a single call. Can reject with
 * `unknown_diff_ref` (400), `diff_already_decided` (409 — caller should
 * refetch `getThisWeekReview()`, server state is authoritative), or
 * `no_review_this_week` (404 — note this is `no_review_this_week`, not
 * check-in's `no_checkin_today`).
 *
 * `result.errors` on a 200 response is NOT the same as a thrown error: the
 * decision itself was still recorded (`review/decide/route.ts` writes
 * `diff_decisions` unconditionally before the tracker update is attempted),
 * it just means the underlying tracker update failed (e.g. tracker archived
 * since generation) and — because the decision is now recorded — cannot be
 * retried. Callers must surface a non-empty `result.errors` visibly and must
 * not offer a retry on that specific ref.
 */
export function decideDiff(ref: string, decision: ReviewDecisionValue, editedTarget?: number): Promise<{ review: Review; result: ReviewDecideResult }> {
  const body: { decisions: ReviewDecisionInput[] } = {
    decisions: [{ ref, decision, ...(editedTarget !== undefined ? { edited_target: editedTarget } : {}) }],
  };
  return apiFetch('/api/review/decide', { method: 'POST', body: JSON.stringify(body) });
}

// Re-exported for screens that want to label a diff's implied miss category
// alongside its reason text, without a separate import — mirrors how
// lib/checkin.ts/lib/trackers.ts already export MissCategory for the same
// purpose.
export type { MissCategory };
