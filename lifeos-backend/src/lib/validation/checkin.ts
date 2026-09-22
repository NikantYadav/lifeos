import { z } from 'zod';
import { isEndAfterStart } from '@/lib/validation/scheduleBlocks';

/**
 * Validation for the daily AI check-in/nudge — ROADMAP.md Phase 3's
 * "lighter-weight sibling to the weekly Sunday Review". Stored on the
 * `reviews` table (`kind: 'daily_checkin'`), the same table the (not yet
 * built) Sunday Review will use — migration 004 already shaped this table
 * with exactly this pair of features in mind (`kind` CHECK already includes
 * both values, and the `proposed_diffs`/`diff_decisions`/`edited_values`
 * trio is a generic per-diff accept/edit/reject ledger, not something
 * specific to one feature), so this module fits into that shape rather than
 * inventing a parallel one.
 *
 * Same discipline as `validation/onboarding.ts`: this is the SECOND
 * validation pass on AI output (`generateStructured`'s `responseSchema`
 * shapes the model's first draft, this is the actual gate), and every
 * free-text field is capped even though `reviews.narrative`/`pattern` are
 * unbounded `text` columns — this content is shown back to the user and
 * never re-fed into another prompt, but capping it anyway keeps it in the
 * same size class as every other AI-authored field in this codebase.
 *
 * Two kinds of concrete, appliable diff are supported: `lower_target`
 * (adjust a tracker's numeric target) and `move_time_block` (change a
 * schedule_block's day/start/end), plus advisory-only `no_change`.
 * `move_time_block` was originally scoped OUT of the first cut (see the
 * daily-checkin build-status report) pending its own ownership/overlap
 * validation surface for AI-*proposed* diffs — that surface now exists at
 * `lib/validation/scheduleBlockOverlap.ts` (`validateScheduleBlockMove`),
 * which this schema's `.superRefine` structurally requires every
 * `move_time_block` diff to be resolvable by (a concrete, non-null
 * `end_time` — see that file's header comment on why open-ended proposed
 * moves aren't supported). The overlap check itself is NOT run here (Zod is
 * sync, the check needs a DB read scoped to the verified user — see that
 * module's own comment) — this schema only enforces the STRUCTURAL
 * shape every `move_time_block` diff must have before the async check ever
 * runs. A `no_change` diff kind exists so the model has a valid way to say
 * "nothing concrete to propose" without inventing a fake change just to
 * fill the array.
 */

const MISS_CATEGORIES = ['tired', 'too_busy', 'no_motivation', 'no_plan', 'sick', 'forgot', 'other'] as const;
export type MissCategory = (typeof MISS_CATEGORIES)[number];

const shortText = z.string().max(300);

// HH:MM or HH:MM:SS — matches `validation/scheduleBlocks.ts`'s own `TIME_RE`
// exactly (kept as a separate literal since it's a regex, not comparison
// logic; the actual time-ORDERING check below reuses `isEndAfterStart`
// directly from that module rather than re-deriving the HH:MM-vs-HH:MM:SS
// normalization it already got right once).
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export const checkinDiffKindSchema = z.enum(['lower_target', 'move_time_block', 'no_change']);

// `tracker_id`/`schedule_block_id` are validated as well-formed uuids here
// (cheap, structural) but are NEVER trusted as "this user owns this row"
// until the decide route re-looks them up scoped to `user_id` — same IDOR
// discipline as `tracker-entries/route.ts`'s tracker_id lookup. The model
// produced these ids from context we handed it, but a provider drifting or
// a hand-edited-by-the-client diff before decide is still untrusted input.
export const proposedCheckinDiffSchema = z
  .object({
    ref: z.string().min(1).max(40), // proposal-local id, referenced by decide's decisions map — mirrors onboarding's plan `ref` pattern
    kind: checkinDiffKindSchema,
    tracker_id: z.string().uuid().optional(),
    tracker_name: z.string().max(100).optional(), // display-only, never trusted for lookups
    current_target: z.number().finite().min(0).max(1_000_000).optional(),
    proposed_target: z.number().finite().min(0).max(1_000_000).optional(),
    // move_time_block fields — structural shape only; the actual overlap
    // check runs async at decide time via `validateScheduleBlockMove`
    // (see this file's header comment and scheduleBlockOverlap.ts).
    schedule_block_id: z.string().uuid().optional(),
    block_title: z.string().max(100).optional(), // display-only, never trusted for lookups
    // DELIBERATELY OPTIONAL, not required — same reasoning and same live
    // finding as `proposed_end_time` below: a model proposing "move this
    // block to 10:30" is implicitly keeping it on the SAME day unless it
    // says otherwise, and an earlier draft REQUIRING this field reproduced
    // the same class of live 502 the `proposed_end_time` fix addresses (a
    // real Gemini run omitted both `proposed_day_of_week` AND
    // `proposed_start_time` together — see the 2026-09-22 build-status
    // report). `validateScheduleBlockMove` defaults a missing day to the
    // stored block's own current `day_of_week`, symmetric with how it
    // derives a missing `proposed_end_time` from the stored duration.
    proposed_day_of_week: z.number().int().min(0).max(6).optional(),
    proposed_start_time: z.string().regex(TIME_RE, 'proposed_start_time must be HH:MM').optional(),
    proposed_end_time: z.string().regex(TIME_RE, 'proposed_end_time must be HH:MM').optional(),
    reason: shortText, // shown next to the diff, e.g. "missed 3 of the last 5 days, mostly 'too_busy'"
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.kind === 'lower_target') {
      if (!val.tracker_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'lower_target diffs require tracker_id', path: ['tracker_id'] });
      }
      if (val.proposed_target === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'lower_target diffs require proposed_target', path: ['proposed_target'] });
      }
    }
    if (val.kind === 'move_time_block') {
      if (!val.schedule_block_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'move_time_block diffs require schedule_block_id', path: ['schedule_block_id'] });
      }
      if (!val.proposed_start_time) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'move_time_block diffs require proposed_start_time', path: ['proposed_start_time'] });
      }
      // `proposed_end_time` is DELIBERATELY OPTIONAL here, not required —
      // this was tightened from an earlier draft after live-verifying
      // against the real Gemini API: given "move this block" (relocate,
      // don't reshape it), the model naturally emits only a new start time
      // and treats the length as implicitly preserved, and reproduced this
      // twice even after an explicit corrective retry naming the exact
      // missing field (see the 2026-09-22 build-status report for the full
      // finding). Requiring it outright meant a real, common, well-formed
      // model response 502'd the ENTIRE check-in — narrative included — a
      // regression this schema itself caused by adding `move_time_block` to
      // a context the model previously never saw. The route now derives a
      // missing `proposed_end_time` server-side from the stored block's own
      // current duration (see decide/route.ts's `move_time_block` branch) —
      // still fully overlap-checked afterward via `validateScheduleBlockMove`,
      // never trusted as-is. An explicitly model-supplied
      // `proposed_end_time` still wins when present (the "shorten this
      // block" case), this only relaxes the REQUIREDNESS.
      if (
        val.proposed_start_time &&
        val.proposed_end_time &&
        !isEndAfterStart(val.proposed_start_time, val.proposed_end_time)
      ) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'proposed_end_time must be after proposed_start_time', path: ['proposed_end_time'] });
      }
    }
  });

export const checkinProposalSchema = z
  .object({
    narrative: z.string().min(1).max(1000), // the short nudge message itself, shown to the user
    pattern: z.string().max(500).optional(), // one-line "what we noticed" summary, e.g. "study hours missed 3x this week, mostly 'too_busy'"
    diffs: z.array(proposedCheckinDiffSchema).max(5),
  })
  .strict();

export type CheckinProposal = z.infer<typeof checkinProposalSchema>;

// The decide-route body: one decision per diff `ref` from the stored
// proposal, keyed the same way onboarding's `plan_ref` keys child resources
// to a plan that doesn't have a real id yet. `edited_target` lets the user
// accept a `lower_target` diff with a different number than the model
// proposed (the "edit" half of accept/edit/reject) — re-validated against
// the same numeric bounds as everywhere else a tracker target is set.
// `edited_start_time`/`edited_end_time` are the `move_time_block` analog —
// accept the diff's INTENT (move this block) but substitute your own times,
// still run through the exact same `validateScheduleBlockMove` overlap gate
// as the model's own proposed times (the route never trusts a client-edited
// time pair any more than a model-proposed one).
//
// Which fields are VALID for a given ref's kind (e.g. rejecting
// `edited_target` on a `move_time_block` diff, or vice versa) can't be
// checked here — Zod has no visibility into the stored diff this `ref`
// points at, only the route does once it looks up `diffByRef`. This schema
// only enforces the kind-agnostic rule both share: any "edited_*" field
// requires `decision === 'accept'`.
export const checkinDecisionSchema = z
  .object({
    ref: z.string().min(1).max(40),
    decision: z.enum(['accept', 'reject']),
    edited_target: z.number().finite().min(0).max(1_000_000).optional(),
    edited_day_of_week: z.number().int().min(0).max(6).optional(),
    edited_start_time: z.string().regex(TIME_RE, 'edited_start_time must be HH:MM').optional(),
    edited_end_time: z.string().regex(TIME_RE, 'edited_end_time must be HH:MM').optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const editedFields: Array<[unknown, string]> = [
      [val.edited_target, 'edited_target'],
      [val.edited_day_of_week, 'edited_day_of_week'],
      [val.edited_start_time, 'edited_start_time'],
      [val.edited_end_time, 'edited_end_time'],
    ];
    for (const [value, path] of editedFields) {
      if (value !== undefined && val.decision !== 'accept') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${path} can only be set when decision is "accept"`,
          path: [path],
        });
      }
    }
    // A lone `edited_end_time` with no `edited_start_time` has no anchor to
    // measure from and is rejected. A lone `edited_start_time` with no
    // `edited_end_time` is ALLOWED — mirrors `proposedCheckinDiffSchema`'s
    // now-optional `proposed_end_time` (see that schema's comment): the
    // route derives a missing end time from the block's current stored
    // duration via `validateScheduleBlockMove`, same as it does for a
    // model-proposed move. An explicit `edited_end_time` still always wins
    // when supplied (the "and also shorten/lengthen it" case).
    if (val.edited_end_time !== undefined && val.edited_start_time === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'edited_end_time requires edited_start_time to also be set',
        path: ['edited_end_time'],
      });
    }
    if (
      val.edited_start_time &&
      val.edited_end_time &&
      !isEndAfterStart(val.edited_start_time, val.edited_end_time)
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'edited_end_time must be after edited_start_time', path: ['edited_end_time'] });
    }
  });

export const decideCheckinSchema = z
  .object({
    decisions: z.array(checkinDecisionSchema).max(5),
  })
  .strict()
  .superRefine((val, ctx) => {
    const refs = new Set<string>();
    val.decisions.forEach((d, i) => {
      if (refs.has(d.ref)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate decision ref "${d.ref}"`, path: ['decisions', i, 'ref'] });
      }
      refs.add(d.ref);
    });
  });

export type DecideCheckinBody = z.infer<typeof decideCheckinSchema>;

// Context-builder window: how far back to look for missed entries. No
// existing convention elsewhere in the codebase sets this (checked
// tracker-entries/route.ts and the onboarding modules — nothing else reads
// a rolling window), so this picks the "last ~7 days" the task description
// itself suggests as reasonable, matching a week of daily tracking.
export const CHECKIN_LOOKBACK_DAYS = 7;

export { MISS_CATEGORIES };
