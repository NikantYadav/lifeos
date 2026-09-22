import { apiFetch } from './api';
import type { MissCategory } from './trackers';

/**
 * Types mirror lifeos-backend's actual check-in response shapes exactly
 * (see src/app/api/checkin/route.ts, checkin/generate/route.ts,
 * checkin/decide/route.ts, and lib/validation/checkin.ts there) — same
 * convention as lib/trackers.ts and lib/onboarding.ts. Read directly off the
 * real `reviews` table columns (confirmed via a live schema query, not
 * inferred from `select('*')` in the routes) and off
 * `proposedCheckinDiffSchema`/`checkinDecisionSchema`, not the memory file's
 * prose summary.
 *
 * Worth calling out because it's easy to get wrong from memory:
 *  - There is NO `'edit'` decision value. `checkinDecisionSchema` is
 *    `z.enum(['accept', 'reject'])`, `.strict()`. "Edit" = `decision:
 *    'accept'` with a caller-supplied `edited_target` substituted for the
 *    AI's `proposed_target` — the backend's superRefine 400s if
 *    `edited_target` is set on a `reject`.
 *  - `pattern` defaults to `''` (empty string), never `null`, per the
 *    `reviews` table's own default and `generate/route.ts`'s
 *    `parsed.data.pattern ?? ''` — but every field here is still typed
 *    defensively in case that ever changes.
 *  - `diffs` on a proposal can be an empty array (the prompt explicitly
 *    allows "nothing to flag") and any individual diff's `tracker_id`/
 *    `current_target`/`proposed_target` are optional — `no_change` diffs
 *    carry none of them.
 */

export type CheckinDiffKind = 'lower_target' | 'no_change';

export interface ProposedCheckinDiff {
  ref: string;
  kind: CheckinDiffKind;
  tracker_id?: string;
  tracker_name?: string;
  current_target?: number;
  proposed_target?: number;
  reason: string;
}

export type CheckinDecisionValue = 'accept' | 'reject';

export interface Checkin {
  id: string;
  user_id: string;
  kind: 'daily_checkin' | 'weekly';
  week_index: number | null;
  generated_at: string;
  narrative: string;
  pattern: string;
  proposed_diffs: ProposedCheckinDiff[];
  diff_decisions: Record<string, CheckinDecisionValue>;
  edited_values: Record<string, { target: number }> | null;
  created_at: string;
}

/** The body `POST /api/checkin/decide` accepts: `{ decisions: [...] }`, at most 5 per call, `.strict()`. */
export interface CheckinDecisionInput {
  ref: string;
  decision: CheckinDecisionValue;
  edited_target?: number;
}

export interface CheckinDecideResult {
  applied: { ref: string; tracker_id: string; new_target: number }[];
  rejected: string[];
  errors: string[];
}

export function getTodayCheckin(): Promise<{ checkin: Checkin | null }> {
  return apiFetch('/api/checkin');
}

/**
 * Builds today's check-in — a real Gemini call, so this must only ever be
 * fired by an explicit user action (a button tap), never automatically on
 * screen mount. Can reject with a documented `ApiError` whose `.body.error`
 * is one of: `checkin_already_generated_today` (409 — a check-in already
 * exists for today, caller should refetch `getTodayCheckin()` rather than
 * show this as an error), `no_recent_misses` (404 — nothing to flag, a
 * calm/positive state not an error), `ai_disabled` (503), `ai_response_truncated`
 * / `ai_error` / `ai_produced_invalid_proposal` (502), `checkin_context_failed` (500).
 */
export function generateCheckin(): Promise<{ checkin: Checkin }> {
  return apiFetch('/api/checkin/generate', { method: 'POST' });
}

/**
 * Submits one or more diff decisions (accept/reject, optionally with
 * `edited_target` on an accept) in a single call. Can reject with
 * `unknown_diff_ref` (400), `diff_already_decided` (409 — caller should
 * refetch `getTodayCheckin()`, server state is authoritative), or
 * `no_checkin_today` (404).
 *
 * `result.errors` on a 200 response is NOT the same as a thrown error: the
 * decision itself was still recorded (see decide/route.ts — `diff_decisions`
 * is written unconditionally before the tracker update is attempted), it
 * just means the underlying tracker update failed (e.g. tracker archived
 * since generation) and — because the decision is now recorded — cannot be
 * retried. Callers must surface a non-empty `result.errors` visibly.
 */
export function decideDiff(ref: string, decision: CheckinDecisionValue, editedTarget?: number): Promise<{ checkin: Checkin; result: CheckinDecideResult }> {
  const body: { decisions: CheckinDecisionInput[] } = {
    decisions: [{ ref, decision, ...(editedTarget !== undefined ? { edited_target: editedTarget } : {}) }],
  };
  return apiFetch('/api/checkin/decide', { method: 'POST', body: JSON.stringify(body) });
}

// Re-exported for screens that want to label a diff's implied miss category
// alongside its reason text, without a separate import — mirrors how
// lib/trackers.ts already exports MissCategory for the same purpose.
export type { MissCategory };
