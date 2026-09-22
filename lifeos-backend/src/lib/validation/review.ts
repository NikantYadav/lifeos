import { z } from 'zod';
import { isEndAfterStart } from '@/lib/validation/scheduleBlocks';

/**
 * Validation for the weekly Sunday Review — ROADMAP.md Phase 3's heavier
 * weekly counterpart to the daily check-in (`validation/checkin.ts`). Same
 * `reviews` table (migration 004), `kind: 'weekly'` — already in the `kind`
 * CHECK constraint alongside `'daily_checkin'` (confirmed live via
 * `pg_constraint` before writing this file, not assumed from the memory
 * file's claim), so no migration was needed for storage.
 *
 * This is a fresh build, not a port: the old pre-Supabase pipeline
 * (`git show <pre-migration commit>:src/lib/reviewContext.ts`, still in this
 * repo's git history though the files themselves are deleted) proposed a
 * much wider variety of diffs — plan-field edits (aim/when/where/how/quota/
 * warn/milestones), schedule-day relabels, weekGoals changes, and task/habit
 * add/drop/retime — against a completely different single-user `AppState`
 * shape. None of that ports directly: the new schema has no `weekGoals`,
 * `plans`' fields aren't the same set, and task/habit add/drop is a much
 * larger surface than this pass is scoped to build. This module follows
 * `validation/checkin.ts`'s narrower pattern instead (a couple of concrete,
 * appliable diff kinds against `trackers.target`, plus an advisory
 * "no_change" kind), deliberately NOT resurrecting the old pipeline's wider
 * diff vocabulary. If a future session wants plan/task/habit diffs back,
 * that is new scope, not a bug in this file.
 *
 * Same discipline as `validation/checkin.ts`: this is the SECOND validation
 * pass on AI output (`generateStructured`'s `responseSchema` shapes the
 * model's first draft, this is the actual gate), `.strict()` everywhere, and
 * every free-text field capped even though `reviews.narrative`/`pattern` are
 * unbounded `text` columns.
 *
 * **Diff-kind scope decision (documented per the task's instruction to
 * reason inline, not just in the report):** the daily check-in narrowed to
 * `lower_target` + `no_change` only. For the weekly review, `raise_target`
 * is ADDED as a second appliable kind — a full week of data is enough
 * signal to justify raising a target the user has been consistently hitting
 * (the check-in's daily window is too short/noisy for that call, this one
 * isn't). `move_time_block` is now ALSO wired in here (previously deferred
 * — the shared `lib/validation/scheduleBlockOverlap.ts` surface was built
 * specifically so check-in and review could each adopt it without rework;
 * check-in adopted it first, this module mirrors that shape exactly — see
 * `validation/checkin.ts`'s identical fields/superRefine structure for the
 * fuller rationale, not re-explained here to avoid drift between the two
 * comments).
 *
 * `raise_target` and `lower_target` share `updateTrackerSchema`'s exact
 * numeric bounds (min 0, max 1_000_000) and both ultimately call the same
 * `trackers.update({ target })` in the decide route — the `kind` field is
 * otherwise just a display/copy hint ("raise" vs "lower" in the UI), so this
 * schema enforces that `proposed_target` actually sits on the correct side
 * of `current_target` for whichever kind was chosen, rather than trusting
 * the model's own labeling. Getting this backwards would silently apply a
 * target change in the wrong direction with an accept-looking label.
 */

const MISS_CATEGORIES = ['tired', 'too_busy', 'no_motivation', 'no_plan', 'sick', 'forgot', 'other'] as const;
export type MissCategory = (typeof MISS_CATEGORIES)[number];

const shortText = z.string().max(300);

// HH:MM or HH:MM:SS — matches `validation/checkin.ts`'s own `TIME_RE`
// exactly (kept as a separate literal there too; a regex isn't worth a
// shared import here any more than it was between checkin.ts and
// scheduleBlocks.ts).
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export const reviewDiffKindSchema = z.enum(['lower_target', 'raise_target', 'move_time_block', 'no_change']);

// `tracker_id`/`schedule_block_id` are validated as well-formed uuids here
// (cheap, structural) but are NEVER trusted as "this user owns this row"
// until the generate route's ownership pre-filter and the decide route's
// own re-lookup — same IDOR discipline as `validation/checkin.ts`'s
// identical comment.
export const proposedReviewDiffSchema = z
  .object({
    ref: z.string().min(1).max(40), // proposal-local id, referenced by decide's decisions map
    kind: reviewDiffKindSchema,
    tracker_id: z.string().uuid().optional(),
    tracker_name: z.string().max(100).optional(), // display-only, never trusted for lookups
    current_target: z.number().finite().min(0).max(1_000_000).optional(),
    proposed_target: z.number().finite().min(0).max(1_000_000).optional(),
    // move_time_block fields — structural shape only; the actual overlap
    // check runs async at decide time via `validateScheduleBlockMove`, same
    // split as `validation/checkin.ts`. Note the documented cross-kind
    // bleed: the model may also emit a stray `tracker_id`/`proposed_target`
    // on a `move_time_block` diff (habit bleed from the lower/raise_target
    // shape) — `.strict()` allows it since these are valid properties on
    // this shared flat object, and the generate/decide routes must dispatch
    // on `kind` explicitly, never on "has a tracker_id", to avoid
    // mis-routing a move diff into the tracker branch.
    schedule_block_id: z.string().uuid().optional(),
    block_title: z.string().max(100).optional(), // display-only, never trusted for lookups
    // DELIBERATELY OPTIONAL, not required — same live-verified reasoning as
    // `validation/checkin.ts`'s identical fields (a model proposing "move
    // this block" naturally omits day/end-time, treating them as unchanged;
    // requiring them 502'd real, well-formed responses there). Not
    // re-bisected against the live API for review specifically — reusing
    // check-in's already-hard-won finding rather than re-discovering it.
    proposed_day_of_week: z.number().int().min(0).max(6).optional(),
    proposed_start_time: z.string().regex(TIME_RE, 'proposed_start_time must be HH:MM').optional(),
    proposed_end_time: z.string().regex(TIME_RE, 'proposed_end_time must be HH:MM').optional(),
    reason: shortText, // shown next to the diff, e.g. "hit Study Hours 6/7 days this week — consider raising the target"
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.kind === 'lower_target' || val.kind === 'raise_target') {
      if (!val.tracker_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${val.kind} diffs require tracker_id`, path: ['tracker_id'] });
      }
      if (val.proposed_target === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${val.kind} diffs require proposed_target`, path: ['proposed_target'] });
      }
      if (val.current_target === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${val.kind} diffs require current_target`, path: ['current_target'] });
      }
      // Direction check: catches a diff whose `kind` label contradicts its
      // own numbers (e.g. "raise_target" with proposed < current) before it
      // is ever stored — the decide route trusts `proposed_target` blindly,
      // so this is the only place that actually enforces direction.
      if (val.current_target !== undefined && val.proposed_target !== undefined) {
        if (val.kind === 'lower_target' && !(val.proposed_target < val.current_target)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'lower_target requires proposed_target < current_target',
            path: ['proposed_target'],
          });
        }
        if (val.kind === 'raise_target' && !(val.proposed_target > val.current_target)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'raise_target requires proposed_target > current_target',
            path: ['proposed_target'],
          });
        }
      }
    }
    if (val.kind === 'move_time_block') {
      if (!val.schedule_block_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'move_time_block diffs require schedule_block_id', path: ['schedule_block_id'] });
      }
      if (!val.proposed_start_time) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'move_time_block diffs require proposed_start_time', path: ['proposed_start_time'] });
      }
      // `proposed_end_time` deliberately optional — see the field comment
      // above and `validation/checkin.ts`'s fuller writeup.
      if (
        val.proposed_start_time &&
        val.proposed_end_time &&
        !isEndAfterStart(val.proposed_start_time, val.proposed_end_time)
      ) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'proposed_end_time must be after proposed_start_time', path: ['proposed_end_time'] });
      }
    }
  });

export const reviewProposalSchema = z
  .object({
    narrative: z.string().min(1).max(1500), // the weekly review message, shown to the user — longer ceiling than check-in's 1000, matching a weekly vs daily moment
    pattern: z.string().max(500).optional(), // one-line "what we noticed" summary across the week
    diffs: z.array(proposedReviewDiffSchema).max(6), // one more than check-in's 5, since raise_target adds a second directional kind that can co-occur with lower_target diffs across different trackers
  })
  .strict();

export type ReviewProposal = z.infer<typeof reviewProposalSchema>;

// The decide-route body: one decision per diff `ref` from the stored
// proposal — identical shape and superRefine rules to
// `checkinDecisionSchema`, just against this feature's own proposal
// storage (see that schema's comments for the fuller per-field rationale).
export const reviewDecisionSchema = z
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

export const decideReviewSchema = z
  .object({
    decisions: z.array(reviewDecisionSchema).max(6),
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

export type DecideReviewBody = z.infer<typeof decideReviewSchema>;

// Context-builder window: a rolling 7 days ending today, the direct analog
// of `CHECKIN_LOOKBACK_DAYS`. Deliberately NOT a Monday-start calendar week:
// the once-per-week GENERATION GUARD (see review/generate/route.ts) is
// calendar-week-based (so "already reviewed this week" means the actual
// Mon–Sun week), but the CONTEXT window is this rolling 7-day span — using a
// calendar week for context too would mean a review generated early in the
// week (e.g. Monday) sees only 1 day of data, which is a real bug for a
// "how was your week" narrative, not just a testing inconvenience. On the
// intended use day (Sunday) the two spans nearly coincide, so this split
// only matters off-Sunday.
export const REVIEW_LOOKBACK_DAYS = 7;

/**
 * Once-per-CALENDAR-WEEK generation guard boundary, deliberately separate
 * from `REVIEW_LOOKBACK_DAYS` above (see that constant's comment for why).
 * Week starts Monday (ISO-ish, matches how most calendar UIs and this app's
 * own `schedule_blocks.day_of_week` 0-6 convention read a week — Monday is
 * treated as the first day here purely for "has this week's review already
 * been generated", it is NOT used to derive `schedule_blocks.day_of_week`
 * or anything else). Computed from server/UTC "now", same as every other
 * date boundary in this codebase (`entry_date` writes, check-in's "today").
 *
 * Exported as one function so all three review routes (GET/generate/decide)
 * compute the exact same boundary the exact same way — check-in's three
 * routes each inline `new Date().toISOString().slice(0, 10)` themselves
 * (fine there, it's one expression); this feature's guard is a multi-step
 * calculation (find Monday, not just "today"), so it gets a single exported
 * helper instead of being re-derived three times and risking drift.
 *
 * `reviews.week_index` (nullable int, present on the table from the old
 * single-user schema) is deliberately left NULL by this feature rather than
 * populated: the old codebase derived it from `currentWeekIndex(now)`,
 * itself relative to a plan-start date. The new schema's closest analog,
 * `profiles.plan_start_date`, is nullable and unused by any write path in
 * this codebase (confirmed by grep) — deriving a week index from it here
 * would be the first thing to depend on that column, and would silently
 * break for any user who never had it set. The guard below uses
 * `generated_at >= weekStart` instead, the same comparison shape
 * `daily_checkin`'s guard already uses successfully, just with a Monday
 * boundary instead of a midnight one.
 */
export function currentWeekStartIso(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = day === 0 ? 6 : day - 1; // days since the most recent Monday
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return `${d.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

export { MISS_CATEGORIES };
