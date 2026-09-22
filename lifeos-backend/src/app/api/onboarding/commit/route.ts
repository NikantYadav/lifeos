import { NextResponse } from 'next/server';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { onboardingProposalSchema, type OnboardingProposal } from '@/lib/validation/onboarding';

/**
 * Applies a proposal to the user's real data — the only route in the
 * onboarding flow that actually writes to `plans`/`schedule_blocks`/
 * `trackers`/`tasks`/`habits`. Deliberately does its OWN inserts here via
 * `supabaseAdmin()` rather than calling the existing per-resource routes
 * (`/api/plans`, `/api/trackers`, ...): every one of those routes hardcodes
 * `created_by: 'user'` and its create schema is `.strict()` with no
 * `created_by` field at all — by design, so a client can't forge that audit
 * column (see trackers/route.ts and its siblings). This route is the one
 * place allowed to write `created_by: 'ai_onboarding'`, which is exactly
 * why it can't just be a thin wrapper around those routes.
 *
 * Body is the (possibly user-hand-edited) proposal, NOT read from
 * `proposed_plan` on the session — ROADMAP.md's Phase 2 explicitly allows
 * editing before accepting, so whatever the client submits here is
 * untrusted input and gets the full `onboardingProposalSchema` validation
 * again, regardless of what an earlier `/propose` call stored.
 *
 * No cross-table transaction exists across separate supabase-js calls, so
 * two safeguards stand in for one:
 *   1. A compare-and-swap UPDATE (`applied=false -> true`) runs BEFORE any
 *      resource is inserted, and only proceeds if it affected a row. Two
 *      concurrent commits (double-tap) race on this update; the loser gets
 *      zero rows back and a clean 409, never a duplicate set of plans.
 *   2. If a later insert in the sequence fails, earlier inserts from this
 *      call are NOT rolled back (best-effort, not atomic) — a deliberate
 *      tradeoff: the failure mode (partially-applied proposal, session
 *      already marked applied) is safer than the alternative of leaving
 *      `applied` false and risking a duplicate commit retried by the
 *      client. The response's `errors` array reports exactly what did and
 *      didn't get created so the client can show that honestly instead of
 *      a bare success.
 */

interface CommitResult {
  plans: Array<{ ref: string; id: string }>;
  schedule_blocks: number;
  trackers: number;
  tasks: number;
  habits: number;
  errors: string[];
}

export const POST = withApi(async (req, { user }) => {
  const parsed = await parseBody(req, onboardingProposalSchema);
  if ('error' in parsed) return parsed.error;
  const proposal: OnboardingProposal = parsed.data;

  const admin = supabaseAdmin();

  const { data: session, error: findErr } = await admin
    .from('onboarding_sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('applied', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) return dbError('onboarding.commit.find', findErr);
  if (!session) {
    // No unapplied session for this user — either they never chatted
    // (genuine 404), or an earlier commit already claimed and applied one
    // (a real 409, just discovered a step later than the CAS below would
    // catch it, since this lookup already excludes applied=true rows). This
    // second lookup exists only to give the client an honest status; either
    // way nothing gets inserted from this branch.
    const { data: appliedSession } = await admin
      .from('onboarding_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('applied', true)
      .limit(1)
      .maybeSingle();
    return appliedSession
      ? NextResponse.json({ error: 'already_applied' }, { status: 409 })
      : NextResponse.json({ error: 'no_active_session' }, { status: 404 });
  }

  // Compare-and-swap: only an onboarding_sessions row that is STILL
  // applied=false gets flipped, and we select it back to confirm this call
  // won the race. A concurrent second commit attempt (double-tap on
  // "Accept", or a retried request) will find zero rows here and stop
  // before inserting anything.
  const { data: claimed, error: claimErr } = await admin
    .from('onboarding_sessions')
    .update({ applied: true, applied_at: new Date().toISOString() })
    .eq('id', session.id)
    .eq('user_id', user.id)
    .eq('applied', false)
    .select('id')
    .maybeSingle();
  if (claimErr) return dbError('onboarding.commit.claim', claimErr);
  if (!claimed) {
    return NextResponse.json({ error: 'already_applied' }, { status: 409 });
  }

  const result: CommitResult = { plans: [], schedule_blocks: 0, trackers: 0, tasks: 0, habits: 0, errors: [] };
  const planIdByRef = new Map<string, string>();

  // Plans first — everything else resolves plan_ref against this map.
  for (const plan of proposal.plans) {
    const { data, error } = await admin
      .from('plans')
      .insert({
        user_id: user.id,
        name: plan.name,
        aim: plan.aim ?? '',
        when: plan.when ?? null,
        where: plan.where ?? null,
        how: plan.how ?? null,
        quota: plan.quota ?? null,
        good: plan.good ?? null,
        bad: plan.bad ?? null,
        warn: plan.warn ?? null,
        ask: plan.ask ?? null,
        milestones: plan.milestones ?? [],
        created_by: 'ai_onboarding',
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('onboarding.commit.plan_insert_failed', plan.ref, error);
      result.errors.push(`plan "${plan.name}" (ref ${plan.ref}) failed to create`);
      continue;
    }
    planIdByRef.set(plan.ref, data.id);
    result.plans.push({ ref: plan.ref, id: data.id });
  }

  // `resolveRef` never lets a dangling ref silently become `null` for a
  // plan that failed above — the item is skipped with a reported error
  // instead of quietly landing unlinked, which would otherwise look
  // identical to "the user never asked for a plan link."
  function resolveRef(planRef: string | undefined): { ok: true; planId: string | null } | { ok: false } {
    if (!planRef) return { ok: true, planId: null };
    const id = planIdByRef.get(planRef);
    return id ? { ok: true, planId: id } : { ok: false };
  }

  for (const block of proposal.schedule_blocks ?? []) {
    const resolved = resolveRef(block.plan_ref);
    if (!resolved.ok) {
      result.errors.push(`schedule block "${block.title}" skipped: plan_ref "${block.plan_ref}" was not created`);
      continue;
    }
    const { error } = await admin.from('schedule_blocks').insert({
      user_id: user.id,
      day_of_week: block.day_of_week,
      start_time: block.start_time,
      end_time: block.end_time ?? null,
      title: block.title,
      note: block.note ?? null,
      is_key_block: block.is_key_block ?? false,
      plan_id: resolved.planId,
      created_by: 'ai_onboarding',
    });
    if (error) {
      console.error('onboarding.commit.schedule_block_insert_failed', error);
      result.errors.push(`schedule block "${block.title}" failed to create`);
      continue;
    }
    result.schedule_blocks++;
  }

  for (const tracker of proposal.trackers ?? []) {
    const resolved = resolveRef(tracker.plan_ref);
    if (!resolved.ok) {
      result.errors.push(`tracker "${tracker.name}" skipped: plan_ref "${tracker.plan_ref}" was not created`);
      continue;
    }
    const { error } = await admin.from('trackers').insert({
      user_id: user.id,
      name: tracker.name,
      description: tracker.description ?? null,
      kind: tracker.kind,
      unit: tracker.unit ?? null,
      target: tracker.target ?? null,
      cadence: tracker.cadence ?? { kind: 'daily' },
      fields: tracker.fields ?? [],
      plan_id: resolved.planId,
      created_by: 'ai_onboarding',
    });
    if (error) {
      // This is where a schema pg_jsonschema rejects (fields invalid despite
      // passing Zod above — defense in depth doing its job) would surface,
      // reported the same as any other insert failure, never crashing the
      // whole commit.
      console.error('onboarding.commit.tracker_insert_failed', error);
      result.errors.push(`tracker "${tracker.name}" failed to create`);
      continue;
    }
    result.trackers++;
  }

  for (const task of proposal.tasks ?? []) {
    const resolved = resolveRef(task.plan_ref);
    if (!resolved.ok) {
      result.errors.push(`task "${task.title}" skipped: plan_ref "${task.plan_ref}" was not created`);
      continue;
    }
    const { error } = await admin.from('tasks').insert({
      user_id: user.id,
      title: task.title,
      detail: task.detail ?? '',
      plan_id: resolved.planId,
      trigger_week: task.trigger_week ?? 0,
      created_by: 'ai_onboarding',
    });
    if (error) {
      console.error('onboarding.commit.task_insert_failed', error);
      result.errors.push(`task "${task.title}" failed to create`);
      continue;
    }
    result.tasks++;
  }

  for (const habit of proposal.habits ?? []) {
    const resolved = resolveRef(habit.plan_ref);
    if (!resolved.ok) {
      result.errors.push(`habit "${habit.title}" skipped: plan_ref "${habit.plan_ref}" was not created`);
      continue;
    }
    const { error } = await admin.from('habits').insert({
      user_id: user.id,
      title: habit.title,
      plan_id: resolved.planId,
      cadence: habit.cadence ?? { kind: 'daily' },
      created_by: 'ai_onboarding',
    });
    if (error) {
      console.error('onboarding.commit.habit_insert_failed', error);
      result.errors.push(`habit "${habit.title}" failed to create`);
      continue;
    }
    result.habits++;
  }

  await admin
    .from('profiles')
    .update({ onboarding_status: 'completed' })
    .eq('user_id', user.id);

  return NextResponse.json({ result }, { status: 201 });
});
