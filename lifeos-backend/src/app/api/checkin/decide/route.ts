import { NextResponse } from 'next/server';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { decideCheckinSchema, type DecideCheckinBody } from '@/lib/validation/checkin';
import { validateScheduleBlockMove } from '@/lib/validation/scheduleBlockOverlap';
import { todayInTimeZone, resolveTimeZone } from '@/lib/time';

/**
 * Applies the user's accept/edit/reject decisions to today's check-in — the
 * only route that writes to `trackers`/`schedule_blocks` from this feature,
 * mirroring `onboarding/commit/route.ts`'s "propose never commits, a
 * separate route does" split. A diff with no concrete state change
 * (`no_change`, or one the user rejects) never reaches a table write at
 * all; only an ACCEPTED `lower_target` diff calls `trackers.update`, and
 * only an ACCEPTED `move_time_block` diff calls `schedule_blocks.update`
 * (via `validateScheduleBlockMove`, the overlap/ownership gate built for
 * exactly this — see `lib/validation/scheduleBlockOverlap.ts`).
 *
 * Body is `{ decisions: [{ ref, decision, edited_target? }] }` — `edited_target`
 * is the "edit" half of accept/edit/reject: the user can accept a diff's
 * intent (lower this tracker's target) while substituting their own number
 * instead of the model's suggestion, re-validated against the identical
 * numeric bounds `updateTrackerSchema` uses (min 0, max 1_000_000) since
 * this is effectively a narrow, purpose-built alternative to PATCH
 * /api/trackers/[id] — not a bypass of its validation discipline.
 *
 * A decision naming a `ref` that isn't in this check-in's `proposed_diffs`
 * is rejected outright (400) rather than silently ignored, and any diff
 * with no decision submitted for it is left undecided (not implicitly
 * rejected) — the client can call this route more than once as the user
 * works through a list of suggestions, same as nothing in onboarding forces
 * a single all-or-nothing accept.
 *
 * No cross-table transaction (same caveat `onboarding/commit/route.ts`
 * documents): the CAS-by-predicate update below claims the decision batch
 * first, then tracker updates are applied best-effort, with per-diff
 * failures reported in the response rather than silently dropped or
 * aborting the whole batch.
 */

interface DecideResult {
  applied: Array<
    | { ref: string; kind: 'lower_target'; tracker_id: string; new_target: number }
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
  const parsed = await parseBody(req, decideCheckinSchema);
  if ('error' in parsed) return parsed.error;
  const body: DecideCheckinBody = parsed.data;

  const admin = supabaseAdmin();

  // Same `local_day` boundary `checkin/generate/route.ts` writes and
  // `checkin/route.ts`'s GET reads back against (migration
  // `011_reviews_local_day_week_generation_guards`) — this route must agree
  // with both, or a check-in generated near local midnight could become
  // undecidable (this lookup missing the row generate just wrote) or the
  // reverse (acting on a stale UTC-window row instead of today's local one).
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileErr) return dbError('checkin.decide.profile', profileErr);
  const timeZone = resolveTimeZone(profile?.timezone);
  const localDay = todayInTimeZone(timeZone);

  const { data: checkin, error: findErr } = await admin
    .from('reviews')
    .select('*')
    .eq('user_id', user.id)
    .eq('kind', 'daily_checkin')
    .eq('local_day', localDay)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) return dbError('checkin.decide.find', findErr);
  if (!checkin) return NextResponse.json({ error: 'no_checkin_today' }, { status: 404 });

  type StoredDiff = {
    ref: string;
    kind: 'lower_target' | 'move_time_block' | 'no_change';
    tracker_id?: string;
    proposed_target?: number;
    schedule_block_id?: string;
    proposed_day_of_week?: number;
    proposed_start_time?: string;
    proposed_end_time?: string;
    [key: string]: unknown;
  };
  const proposedDiffs: StoredDiff[] = Array.isArray(checkin.proposed_diffs) ? checkin.proposed_diffs : [];
  const diffByRef = new Map(proposedDiffs.map((d) => [d.ref, d]));

  const existingDecisions: Record<string, unknown> =
    checkin.diff_decisions && typeof checkin.diff_decisions === 'object' ? checkin.diff_decisions : {};

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
    checkin.edited_values && typeof checkin.edited_values === 'object' ? { ...checkin.edited_values } : {};

  for (const decision of body.decisions) {
    const diff = diffByRef.get(decision.ref)!;

    if (decision.decision === 'reject') {
      nextDecisions[decision.ref] = decision.decision;
      result.rejected.push(decision.ref);
      continue;
    }

    // NOTE: for an 'accept', `nextDecisions[decision.ref]` is set ONLY on a
    // successful apply (each case below sets it right before pushing to
    // `result.applied`) — NOT unconditionally up front. An overlap
    // rejection from `validateScheduleBlockMove` is an expected, common
    // outcome for `move_time_block` (unlike `lower_target`, whose tracker
    // was already ownership-pre-filtered at generate time, so its failure
    // modes are near-impossible in practice) — recording the decision
    // anyway would permanently burn the ref: the user's next attempt with a
    // corrected edited_start_time/edited_end_time would hit 409
    // `diff_already_decided` with nothing ever having been applied. A
    // failed accept attempt is therefore left UNDECIDED, same as a ref with
    // no decision submitted at all, so the client can retry it.

    // decision.decision === 'accept' — dispatch by the STORED diff's kind
    // (never the request body's, which has no kind field at all — the
    // client only ever says accept/reject/edited-values for a ref, the
    // server is the sole authority on what that ref actually IS). A switch,
    // not an `if (diff.kind !== 'lower_target') continue`, so a future
    // third kind can't silently fall through this gate as advisory-only the
    // way `move_time_block` itself would have under the old two-kind check.
    switch (diff.kind) {
      case 'no_change': {
        // Accepting a `no_change` diff is a valid, meaningful choice (the
        // user is acknowledging the observation) — it just has nothing to
        // apply, and nothing here can fail, so the decision is recorded
        // unconditionally.
        nextDecisions[decision.ref] = 'accept';
        break;
      }

      case 'lower_target': {
        const targetValue = decision.edited_target ?? diff.proposed_target;
        if (!diff.tracker_id || targetValue === undefined) {
          result.errors.push(`diff "${decision.ref}" is missing tracker_id/target and could not be applied`);
          break;
        }

        // Ownership re-check at apply time, not just at generate time (see
        // generate/route.ts's comment on why it pre-filters too) — the
        // proposal was already scoped to this user's own trackers when it
        // was stored, but this is the actual write path, so it re-derives
        // ownership from `user.id` directly rather than trusting that
        // earlier filter held. Same IDOR discipline as
        // tracker-entries/route.ts's tracker_id lookup.
        //
        // `target` is also fetched here now (previously only `id,
        // archived_at`) for the TOCTOU check below: `/generate` validated
        // this diff's direction (proposed < current) against the tracker's
        // target AT GENERATION TIME, but nothing previously re-checked that
        // at DECIDE time — a PATCH to /api/trackers/[id] in between could
        // move the target such that "lower" is no longer true (or the
        // target could have changed entirely), and this would silently
        // apply a now-stale/nonsensical change. `target` returns as a JSON
        // string from supabase-js even though the column is numeric (see
        // the review-generate landmine documented in the memory file) — use
        // `Number(...)` and `<`/`>`, never `===`/`typeof`, when comparing it.
        const { data: tracker, error: trackerErr } = await admin
          .from('trackers')
          .select('id, archived_at, target')
          .eq('id', diff.tracker_id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (trackerErr) {
          console.error('checkin.decide.tracker_lookup_failed', decision.ref, trackerErr);
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

        const currentTarget = tracker.target === null ? null : Number(tracker.target);
        if (currentTarget === null || !(targetValue < currentTarget)) {
          // The target moved (or was cleared) since /generate validated this
          // diff's direction — applying it now would either be a no-op-or-
          // worse or would silently contradict what "lower_target" promised
          // the user. Left UNDECIDED (not recorded in nextDecisions), same
          // as any other failed accept attempt in this route, so the client
          // can re-fetch the current target and retry with a corrected
          // edited_target if the user still wants to proceed.
          result.errors.push(
            `diff "${decision.ref}": tracker target has changed since this suggestion was generated and is no longer higher than the proposed value — refresh and retry`
          );
          break;
        }

        const { error: updateErr } = await admin
          .from('trackers')
          .update({ target: targetValue })
          .eq('id', tracker.id)
          .eq('user_id', user.id);
        if (updateErr) {
          console.error('checkin.decide.tracker_update_failed', decision.ref, updateErr);
          result.errors.push(`diff "${decision.ref}": failed to update tracker target`);
          break;
        }

        // `nextEditedValues` write moved here (after the update actually
        // succeeds), matching the `move_time_block` branch's ordering — an
        // earlier version of this branch wrote it right after the initial
        // null-checks, before the ownership lookup/update could still fail,
        // which could leave an orphan `edited_values` entry for a ref that
        // ultimately stayed undecided. Harmless in practice (a retry
        // overwrites it), but kept consistent with the other branch rather
        // than left as an unintentional asymmetry.
        if (decision.edited_target !== undefined) {
          nextEditedValues[decision.ref] = { target: decision.edited_target };
        }

        nextDecisions[decision.ref] = 'accept';
        result.applied.push({ ref: decision.ref, kind: 'lower_target', tracker_id: tracker.id, new_target: targetValue });
        break;
      }

      case 'move_time_block': {
        // The user may substitute their own day/start/end (edited_* — the
        // "edit" half of accept/edit/reject) instead of the model's
        // proposed ones; either way, whatever values end up here go through
        // the identical `validateScheduleBlockMove` overlap/ownership gate
        // below — no path applies a time pair that skipped that check.
        //
        // `dayOfWeek`/`endTime` are both intentionally allowed to be
        // undefined here (only `startTime` is hard-required) —
        // `proposed_day_of_week`/`proposed_end_time` are both optional at
        // the Zod layer (see checkin.ts's comments on why: live-verified
        // against the real Gemini API, requiring either broke a common
        // well-formed model response). `validateScheduleBlockMove` defaults
        // a missing day to the stored block's own current day, and derives
        // a missing end time from its own current duration, reporting
        // `cannot_derive_end_time` only if the end truly can't be derived
        // (day always has a fallback — the block's own stored day — so
        // there is no analogous "cannot derive day" failure mode).
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
            // A real DB error, not "doesn't exist" — kept distinct (see
            // scheduleBlockOverlap.ts) so a transient failure doesn't read
            // as a benign not-found to the user. Already logged inside
            // validateScheduleBlockMove itself.
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

        // Use `moveResult.resolved`, never the local `endTime` — it may
        // have been derived server-side inside validateScheduleBlockMove,
        // and the UPDATE must apply exactly what was actually validated,
        // not a value the caller only THOUGHT it was proposing.
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
          console.error('checkin.decide.schedule_block_update_failed', decision.ref, updateErr);
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
        // Unknown/future kind stored on a diff this route doesn't recognize
        // — report it rather than silently doing nothing, since silence is
        // exactly the bug class this switch was introduced to close.
        result.errors.push(`diff "${decision.ref}": unrecognized diff kind "${String(diff.kind)}"`);
    }
  }

  const { data: updated, error: updateErr } = await admin
    .from('reviews')
    .update({ diff_decisions: nextDecisions, edited_values: Object.keys(nextEditedValues).length > 0 ? nextEditedValues : null })
    .eq('id', checkin.id)
    .eq('user_id', user.id)
    .select('*')
    .single();
  if (updateErr) return dbError('checkin.decide.update', updateErr);

  return NextResponse.json({ checkin: updated, result });
});
