import 'server-only';
import { normalizeTime } from '@/lib/validation/scheduleBlocks';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Overlap-detection surface for schedule_blocks — the infrastructure both
 * the daily check-in decide route and the (future) onboarding hand-edit
 * surface need before either can safely apply an AI-proposed "move this
 * time block" diff. See the 2026-09-22 memory-file pointer item 4: this was
 * deferred by two features for the same reason ("needs its own
 * overlap/ordering validation surface... doesn't exist yet for
 * AI-*proposed* diffs, not just user-PATCHed ones") — this file is that
 * surface, built once, reused by both.
 *
 * `isEndAfterStart`/`normalizeTime` (validation/scheduleBlocks.ts) only ever
 * validated ONE block in isolation — this module is additive, not a
 * replacement: it checks a proposed block against its SIBLINGS on the same
 * day, using the identical normalize-then-compare discipline so the two
 * modules can't disagree on the same HH:MM-vs-HH:MM:SS edge case.
 *
 * **`end_time` is nullable on the DB row and optional on
 * `createScheduleBlockSchema`, and this is a genuinely under-specified
 * corner this module has to make an explicit call on**: an open-ended
 * sibling block (no `end_time`) has no provable extent, so it is EXCLUDED
 * from the sibling set entirely (can't be proven to overlap, and treating a
 * null end as "runs until midnight" or "zero-width" would both be invented
 * behavior, not something the schema says). A PROPOSED move's end time is
 * resolved to a concrete value before any overlap check ever runs — either
 * the caller supplies one explicitly, or `validateScheduleBlockMove`
 * derives one from the block's OWN current stored duration (see
 * `deriveEndTime`) — but it can never resolve to null/open-ended itself, so
 * `findOverlappingBlock` (which takes the already-resolved
 * `ProposedBlockTime`, always concrete) never has to reason about an
 * open-ended proposal. **This end-time-optional-with-derivation design was
 * added after an earlier draft REQUIRED an explicit `proposed_end_time` and
 * broke live against the real Gemini API** — see `checkin.ts`'s own comment
 * on `proposed_end_time` and the 2026-09-22 build-status report for the
 * full finding; "move this block" naturally omits an end time (relocate,
 * don't reshape), and requiring one outright made a common, well-formed
 * model response fail the entire check-in generation.
 */

export interface ExistingBlock {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string | null;
}

export interface ProposedBlockTime {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

// `day_of_week`/`end_time` are both optional here (unlike `ProposedBlockTime`,
// which `findOverlappingBlock` requires concrete) — `validateScheduleBlockMove`
// defaults a missing day to the block's own stored `day_of_week` and derives
// a missing end time from its own stored duration, before ever calling
// `findOverlappingBlock`. See that function's own comment for why:
// live-verified against the real Gemini API, "move this block" naturally
// omits a day (implicitly same day) and/or an end time (relocate, don't
// reshape), and requiring either outright made a common, well-formed model
// response fail the entire check-in generation. A caller that already knows
// the full triple (e.g. a user-hand-edited time pair) can still pass all
// three explicitly — this only makes day/end optional, it never overrides
// an explicit value.
export interface ProposedBlockMove {
  day_of_week?: number;
  start_time: string;
  end_time?: string;
}

/**
 * Derives a proposed move's end time from the block's CURRENT stored
 * duration when the caller didn't supply one — `newStart + (storedEnd -
 * storedStart)`. Pure, minute-arithmetic only (no Date/timezone
 * involvement, `time` has no date component to begin with).
 *
 * Two failure modes, both returned as `null` (caller decides how to
 * report): (1) the stored block has a null `end_time` itself — no known
 * duration to preserve, can't derive anything, consistent with this
 * module's existing stance that an open-ended block has no provable extent;
 * (2) the derived end would cross midnight (>= 24:00), which is not a valid
 * same-day Postgres `time` value and would otherwise silently produce an
 * end time that sorts BEFORE the start after normalization, inverting
 * `isEndAfterStart`'s own check rather than tripping it — rejected here
 * before that can happen, not left for the caller to discover downstream.
 */
export function deriveEndTime(storedStart: string, storedEnd: string | null, newStart: string): string | null {
  if (storedEnd === null) return null;

  const toMinutes = (t: string): number => {
    const [h, m] = normalizeTime(t).split(':').map(Number);
    return h * 60 + m;
  };
  const fromMinutes = (mins: number): string => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  };

  const durationMinutes = toMinutes(storedEnd) - toMinutes(storedStart);
  if (durationMinutes <= 0) return null; // stored block itself is zero/negative-length — shouldn't be reachable given isEndAfterStart guards writes, but never derive from a nonsensical duration

  const newStartMinutes = toMinutes(newStart);
  const derivedEndMinutes = newStartMinutes + durationMinutes;
  if (derivedEndMinutes >= 24 * 60) return null; // would cross midnight — not a valid same-day `time` value

  return fromMinutes(derivedEndMinutes);
}

/**
 * Pure, DB-free predicate — unit-testable and reusable by any future caller
 * (e.g. the onboarding hand-edit surface, which has no `schedule_block_id`
 * yet to exclude). `excludeBlockId` lets a caller check a block's proposed
 * NEW time against everything except itself (a "move block A" diff must not
 * false-positive against block A's own current/pre-move row).
 *
 * Overlap test (both sides normalized to HH:MM:SS first, same reasoning as
 * `isEndAfterStart`): two half-open intervals [start, end) on the same day
 * overlap iff `newStart < existingEnd && existingStart < newEnd`. Using
 * strict `<` (not `<=`) on both sides is what makes back-to-back blocks
 * (one ends exactly when the other starts) NOT count as overlapping —
 * exactly the boundary case `isEndAfterStart`'s own bug history warns about
 * getting wrong in the other direction (a zero-length block wrongly
 * ACCEPTED); here the risk is the opposite (a legitimate back-to-back pair
 * wrongly REJECTED), which is why every value — proposed AND sibling,
 * read back from Postgres as HH:MM:SS — is normalized before comparing.
 */
export function findOverlappingBlock(
  existingBlocks: ExistingBlock[],
  proposed: ProposedBlockTime,
  excludeBlockId?: string
): ExistingBlock | null {
  const newStart = normalizeTime(proposed.start_time);
  const newEnd = normalizeTime(proposed.end_time);

  for (const block of existingBlocks) {
    if (excludeBlockId && block.id === excludeBlockId) continue;
    if (block.day_of_week !== proposed.day_of_week) continue;
    if (block.end_time === null) continue; // open-ended sibling: no provable extent, can't be checked — see file header

    const existingStart = normalizeTime(block.start_time);
    const existingEnd = normalizeTime(block.end_time);

    if (newStart < existingEnd && existingStart < newEnd) {
      return block;
    }
  }

  return null;
}

export type ValidateBlockMoveResult =
  | { ok: true; block: ExistingBlock; resolved: ProposedBlockTime } // `resolved` carries the end time actually used (model-supplied or derived) — the caller's UPDATE patch must use THIS, not its own local variable, so it can never drift from what was actually validated
  | { ok: false; code: 'not_found' }
  | { ok: false; code: 'lookup_failed' } // a real DB error, not "row doesn't exist/isn't yours" — kept distinct so a transient Postgres failure never gets reported to the user as if the block simply didn't exist
  | { ok: false; code: 'end_before_start' }
  | { ok: false; code: 'cannot_derive_end_time' } // no explicit end_time given AND none could be derived (stored block has a null end, or deriving would cross midnight) — see `deriveEndTime`'s own doc comment
  | { ok: false; code: 'overlap'; conflict: ExistingBlock };

/**
 * The single async entry point a route should call to validate an
 * AI-proposed schedule_block move — bundles ownership verification (IDOR
 * discipline: `.eq('id', x).eq('user_id', verifiedUserId)`, same pattern as
 * every other route in this codebase), end-time derivation when the caller
 * didn't supply one (see `deriveEndTime`), the single-block
 * `isEndAfterStart` check, and the sibling-overlap check into one call, so
 * a caller has no path to "I validated structurally but forgot the DB
 * check" — there is no lower-level DB-touching helper exported for a route
 * to call instead of this one.
 *
 * Returns the verified current row AND the fully-resolved proposed time on
 * success (`ok: true`) so the caller can build its own UPDATE patch from
 * `resolved` — this function never writes.
 */
export async function validateScheduleBlockMove(
  verifiedUserId: string,
  scheduleBlockId: string,
  proposed: ProposedBlockMove
): Promise<ValidateBlockMoveResult> {
  const admin = supabaseAdmin();

  const { data: block, error: blockErr } = await admin
    .from('schedule_blocks')
    .select('id, day_of_week, start_time, end_time')
    .eq('id', scheduleBlockId)
    .eq('user_id', verifiedUserId)
    .maybeSingle();
  if (blockErr) {
    console.error('scheduleBlockOverlap.validateMove.lookup_failed', scheduleBlockId, blockErr);
    return { ok: false, code: 'lookup_failed' };
  }
  if (!block) return { ok: false, code: 'not_found' };

  const resolvedDayOfWeek = proposed.day_of_week ?? block.day_of_week;

  const resolvedEndTime = proposed.end_time ?? deriveEndTime(block.start_time, block.end_time, proposed.start_time);
  if (!resolvedEndTime) {
    return { ok: false, code: 'cannot_derive_end_time' };
  }
  const resolved: ProposedBlockTime = { day_of_week: resolvedDayOfWeek, start_time: proposed.start_time, end_time: resolvedEndTime };

  if (normalizeTime(resolved.end_time) <= normalizeTime(resolved.start_time)) {
    return { ok: false, code: 'end_before_start' };
  }

  const { data: siblings, error: siblingsErr } = await admin
    .from('schedule_blocks')
    .select('id, day_of_week, start_time, end_time')
    .eq('user_id', verifiedUserId)
    .eq('day_of_week', resolved.day_of_week);
  if (siblingsErr) {
    console.error('scheduleBlockOverlap.validateMove.siblings_failed', scheduleBlockId, siblingsErr);
    return { ok: false, code: 'lookup_failed' };
  }

  const conflict = findOverlappingBlock((siblings ?? []) as ExistingBlock[], resolved, scheduleBlockId);
  if (conflict) {
    return { ok: false, code: 'overlap', conflict };
  }

  return { ok: true, block: block as ExistingBlock, resolved };
}
