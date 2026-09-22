import { NextResponse } from 'next/server';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { decideReviewSchema, type DecideReviewBody } from '@/lib/validation/review';
import { validateScheduleBlockMove } from '@/lib/validation/scheduleBlockOverlap';
import { weekStartInTimeZone, resolveTimeZone } from '@/lib/time';

/**
 * Applies the user's accept/edit/reject decisions to this week's review —
 * the only route that writes to `trackers`/`schedule_blocks` from this
 * feature, mirroring `checkin/decide/route.ts`'s "propose never commits, a
 * separate route does" split exactly. A diff with no concrete state change
 * (`no_change`, or one the user rejects) never reaches a table write; an
 * ACCEPTED `lower_target` OR `raise_target` diff calls `trackers.update`
 * (both kinds share this single apply path since both are, mechanically,
 * the same "set trackers.target to this number" operation; `kind` only
 * affected which direction was validated as legitimate back in
 * `/generate`), and an ACCEPTED `move_time_block` diff calls
 * `schedule_blocks.update` (via `validateScheduleBlockMove`, the same
 * overlap/ownership gate `checkin/decide/route.ts` uses — see
 * `lib/validation/scheduleBlockOverlap.ts`).
 *
 * Body is `{ decisions: [{ ref, decision, edited_target? }] }` — identical
 * shape and semantics to `checkin/decide/route.ts`'s body, including the
 * "edit" half of accept/edit/reject (`edited_target` substitutes the user's
 * own number for the model's suggestion, re-validated against the same
 * numeric bounds `updateTrackerSchema` uses). Note `edited_target` is NOT
 * re-checked against the diff's `kind` direction (lower vs raise) — editing
 * is a deliberate override of the model's specific number, and the user may
 * reasonably want a different number than either the model's suggestion or
 * a same-direction-only edit would allow (e.g. accepting a "raise_target"
 * diff's intent but only raising it slightly, or even keeping it the same
 * if they just want to acknowledge the suggestion without much change) —
 * matching `checkin/decide/route.ts`'s identical choice not to re-constrain
 * `edited_target` by the diff's own kind. This same "don't over-constrain
 * an edit" choice extends to `edited_start_time`/`edited_end_time`/
 * `edited_day_of_week` for `move_time_block` diffs.
 *
 * A decision naming a `ref` that isn't in this review's `proposed_diffs` is
 * rejected outright (400). Re-deciding an already-decided ref is 409, same
 * convention as check-in. Undecided diffs are left undecided, not implicitly
 * rejected — this route can be called more than once as the user works
 * through a list of suggestions.
 *
 * No cross-table transaction (same caveat `checkin/decide/route.ts`/
 * `onboarding/commit/route.ts` document): the decision batch is recorded
 * first via the `reviews` update below being the LAST write, with tracker/
 * schedule_block updates applied best-effort before it, per-diff failures
 * reported in the response rather than aborting the whole batch.
 */

interface DecideResult {
  applied: Array<
    | { ref: string; kind: 'lower_target' | 'raise_target'; tracker_id: string; new_target: number }
    | {
        ref: string;
        kind: 'move_time_block';
        schedule_block_id: string;
        new_day_of_week: number;
        new_start_time: string;
        new_end_time: string;
      }
  >;
  rejected: string[];
  errors: string[];
}

export const POST = withApi(async (req, { user }) => {
  const parsed = await parseBody(req, decideReviewSchema);
  if ('error' in parsed) return parsed.error;
  const body: DecideReviewBody = parsed.data;

  const admin = supabaseAdmin();

  // Same `local_week` boundary `review/generate/route.ts` writes and
  // `review/route.ts`'s GET reads back against (migration
  // `011_reviews_local_day_week_generation_guards`) — this route must agree
  // with both, same reasoning as `checkin/decide/route.ts`'s identical
  // change.
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileErr) return dbError('review.decide.profile', profileErr);
  const timeZone = resolveTimeZone(profile?.timezone);
  const localWeek = weekStartInTimeZone(timeZone);

  const { data: review, error: findErr } = await admin
    .from('reviews')
    .select('*')
    .eq('user_id', user.id)
    .eq('kind', 'weekly')
    .eq('local_week', localWeek)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) return dbError('review.decide.find', findErr);
  if (!review) return NextResponse.json({ error: 'no_review_this_week' }, { status: 404 });

  type StoredDiff = {
    ref: string;
    kind: 'lower_target' | 'raise_target' | 'move_time_block' | 'no_change';
    tracker_id?: string;
    proposed_target?: number;
    schedule_block_id?: string;
    proposed_day_of_week?: number;
    proposed_start_time?: string;
    proposed_end_time?: string;
    [key: string]: unknown;
  };
  const proposedDiffs: StoredDiff[] = Array.isArray(review.proposed_diffs) ? review.proposed_diffs : [];
  const diffByRef = new Map(proposedDiffs.map((d) => [d.ref, d]));

  const existingDecisions: Record<string, unknown> =
    review.diff_decisions && typeof review.diff_decisions === 'object' ? review.diff_decisions : {};

  for (const decision of body.decisions) {
    if (!diffByRef.has(decision.ref)) {
      return NextResponse.json({ error: 'unknown_diff_ref', ref: decision.ref }, { status: 400 });
    }
    if (decision.ref in existingDecisions) {
      return NextResponse.json({ error: 'diff_already_decided', ref: decision.ref }, { status: 409 });
    }
  }

  const result: DecideResult = { applied: [], rejected: [], errors: [] };
  const nextDecisions: Record<string, unknown> = { ...existingDecisions };
  const nextEditedValues: Record<string, unknown> =
    review.edited_values && typeof review.edited_values === 'object' ? { ...review.edited_values } : {};

  for (const decision of body.decisions) {
    const diff = diffByRef.get(decision.ref)!;

    if (decision.decision === 'reject') {
      // Reject can't fail, so recording it immediately is safe — same as
      // checkin/decide/route.ts's identical split.
      nextDecisions[decision.ref] = decision.decision;
      result.rejected.push(decision.ref);
      continue;
    }

    // NOTE: for an 'accept', `nextDecisions[decision.ref]` is set ONLY on a
    // successful apply (each branch below sets it right before recording
    // the result), NOT unconditionally up front. This mirrors
    // checkin/decide/route.ts's identical fix (see that file's comment) —
    // an earlier version of this route recorded the decision before
    // attempting the apply, which meant a stale-direction rejection (added
    // below) or any other apply failure would permanently burn the ref: the
    // user's retry would hit 409 `diff_already_decided` with nothing ever
    // having been applied.

    // decision.decision === 'accept' — dispatch by the STORED diff's kind,
    // same "server is the sole authority on what this ref actually is"
    // discipline as checkin/decide/route.ts's identical switch (a switch,
    // not an `if (kind !== X) continue`, so a future kind can't silently
    // fall through this gate as advisory-only).
    switch (diff.kind) {
      case 'no_change': {
        // Accepting a `no_change` diff is a valid, meaningful choice (the
        // user is acknowledging the observation) — it just has nothing to
        // apply, and nothing here can fail, so it's recorded unconditionally.
        nextDecisions[decision.ref] = 'accept';
        break;
      }

      case 'lower_target':
      case 'raise_target': {
        const targetValue = decision.edited_target ?? diff.proposed_target;
        if (!diff.tracker_id || targetValue === undefined) {
          result.errors.push(`diff "${decision.ref}" is missing tracker_id/target and could not be applied`);
          break;
        }

        // Ownership re-check at apply time, not just at generate time — same
        // IDOR discipline as `checkin/decide/route.ts`'s identical comment:
        // the proposal was already scoped to this user's own trackers when
        // stored, but this is the actual write path, so it re-derives
        // ownership from `user.id` directly rather than trusting that
        // earlier filter held.
        //
        // `target` is also fetched here (not just `id, archived_at`) for the
        // TOCTOU check below — same gap and same fix as
        // checkin/decide/route.ts's `lower_target` branch: `/generate`
        // validated this diff's direction against the tracker's target AT
        // GENERATION TIME, but nothing previously re-checked that at DECIDE
        // time. A PATCH to /api/trackers/[id] in between could move the
        // target such that the diff's own kind-implied direction (lower ⇒
        // target should still be decreasing, raise ⇒ still increasing) no
        // longer holds against the CURRENT value. `target` returns as a
        // JSON string from supabase-js even though the column is numeric
        // (documented landmine) — use `Number(...)` and `<`/`>`, never
        // `===`/`typeof`.
        const { data: tracker, error: trackerErr } = await admin
          .from('trackers')
          .select('id, archived_at, target')
          .eq('id', diff.tracker_id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (trackerErr) {
          console.error('review.decide.tracker_lookup_failed', decision.ref, trackerErr);
          result.errors.push(`diff "${decision.ref}": tracker lookup failed`);
          break;
        }
        if (!tracker) {
          result.errors.push(`diff "${decision.ref}": tracker not found`);
          break;
        }
        if (tracker.archived_at) {
          result.errors.push(`diff "${decision.ref}": tracker is archived`);
          break;
        }

        // Direction gate keyed on the diff's OWN kind, checked against the
        // CURRENT target — not a re-derivation of "was this edit good" (the
        // route's own header comment already documents that `edited_target`
        // is deliberately NOT constrained to the same direction as the
        // model's original suggestion; that's an intentional, separate
        // design choice). This only catches the case where the target moved
        // since generation such that the diff's kind-implied direction no
        // longer holds at all.
        const currentTarget = tracker.target === null ? null : Number(tracker.target);
        const directionHolds =
          currentTarget !== null &&
          (diff.kind === 'lower_target' ? targetValue < currentTarget : targetValue > currentTarget);
        if (!directionHolds) {
          // Left UNDECIDED (not recorded in nextDecisions), same as every
          // other failed accept attempt in this route, so the client can
          // re-fetch the current target and retry with a corrected
          // edited_target.
          result.errors.push(
            `diff "${decision.ref}": tracker target has changed since this suggestion was generated and no longer supports a ${diff.kind === 'lower_target' ? 'lower' : 'higher'} value — refresh and retry`
          );
          break;
        }

        if (decision.edited_target !== undefined) {
          nextEditedValues[decision.ref] = { target: decision.edited_target };
        }

        const { error: updateErr } = await admin
          .from('trackers')
          .update({ target: targetValue })
          .eq('id', tracker.id)
          .eq('user_id', user.id);
        if (updateErr) {
          console.error('review.decide.tracker_update_failed', decision.ref, updateErr);
          result.errors.push(`diff "${decision.ref}": failed to update tracker target`);
          break;
        }

        nextDecisions[decision.ref] = 'accept';
        result.applied.push({ ref: decision.ref, kind: diff.kind, tracker_id: tracker.id, new_target: targetValue });
        break;
      }

      case 'move_time_block': {
        // Identical shape to checkin/decide/route.ts's `move_time_block`
        // branch — see that file's comments for the fuller rationale on
        // optional day/end-time, deriving missing values, and why overlap
        // is re-verified here (not cached from generate time).
        const dayOfWeek = decision.edited_day_of_week ?? diff.proposed_day_of_week;
        const startTime = decision.edited_start_time ?? diff.proposed_start_time;
        const endTime = decision.edited_end_time ?? diff.proposed_end_time;

        if (!diff.schedule_block_id || !startTime) {
          result.errors.push(`diff "${decision.ref}" is missing schedule_block_id/start_time and could not be applied`);
          break;
        }

        const moveResult = await validateScheduleBlockMove(user.id, diff.schedule_block_id, {
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
        });

        if (!moveResult.ok) {
          if (moveResult.code === 'not_found') {
            result.errors.push(`diff "${decision.ref}": schedule block not found`);
          } else if (moveResult.code === 'lookup_failed') {
            result.errors.push(`diff "${decision.ref}": schedule block lookup failed, try again`);
          } else if (moveResult.code === 'cannot_derive_end_time') {
            result.errors.push(
              `diff "${decision.ref}": no end_time was proposed and one could not be derived (block has no stored duration, or the derived end would cross midnight) — resubmit with an explicit edited_end_time`
            );
          } else if (moveResult.code === 'end_before_start') {
            result.errors.push(`diff "${decision.ref}": end_time must be after start_time`);
          } else {
            result.errors.push(
              `diff "${decision.ref}": proposed time overlaps existing block "${moveResult.conflict.id}"`
            );
          }
          break;
        }

        const { resolved } = moveResult;

        if (
          decision.edited_start_time !== undefined ||
          decision.edited_end_time !== undefined ||
          decision.edited_day_of_week !== undefined
        ) {
          nextEditedValues[decision.ref] = { day_of_week: resolved.day_of_week, start_time: resolved.start_time, end_time: resolved.end_time };
        }

        const { error: updateErr } = await admin
          .from('schedule_blocks')
          .update({
            day_of_week: resolved.day_of_week,
            start_time: resolved.start_time,
            end_time: resolved.end_time,
            updated_at: new Date().toISOString(),
          })
          .eq('id', diff.schedule_block_id)
          .eq('user_id', user.id);
        if (updateErr) {
          console.error('review.decide.schedule_block_update_failed', decision.ref, updateErr);
          result.errors.push(`diff "${decision.ref}": failed to update schedule block`);
          break;
        }

        nextDecisions[decision.ref] = 'accept';
        result.applied.push({
          ref: decision.ref,
          kind: 'move_time_block',
          schedule_block_id: diff.schedule_block_id,
          new_day_of_week: resolved.day_of_week,
          new_start_time: resolved.start_time,
          new_end_time: resolved.end_time,
        });
        break;
      }

      default:
        result.errors.push(`diff "${decision.ref}": unrecognized diff kind "${String(diff.kind)}"`);
    }
  }

  const { data: updated, error: updateErr } = await admin
    .from('reviews')
    .update({ diff_decisions: nextDecisions, edited_values: Object.keys(nextEditedValues).length > 0 ? nextEditedValues : null })
    .eq('id', review.id)
    .eq('user_id', user.id)
    .select('*')
    .single();
  if (updateErr) return dbError('review.decide.update', updateErr);

  return NextResponse.json({ review: updated, result });
});
