import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { OnboardingProposal, ProposedHabit, ProposedScheduleBlock, ProposedTask, ProposedTracker } from '@/lib/onboarding';

/**
 * "Here's the plan I built from our chat" — ROADMAP.md Phase 2's required
 * review step before anything is written (never write AI output straight to
 * the DB unseen, same trust model as the existing weekly review). Per-plan
 * reject (full discard) plus field-by-field hand-editing of the
 * obviously-useful fields: plan name, tracker name/unit/target, schedule
 * block title/time, task/habit title. This is the "hand-edit anything the
 * AI proposed before accepting" half of ROADMAP.md's escape hatch bullet —
 * skip (in onboarding.tsx) covers the other half.
 *
 * Deliberately NOT exposed as editable, on purpose:
 *  - `ref` on a plan — every child resource's `plan_ref` points at it by
 *    string value; letting a user edit `ref` (or delete/rename it some
 *    other way than the existing whole-plan Remove button) would dangle
 *    every `plan_ref` that pointed at the old value, and the backend's
 *    `onboardingProposalSchema.superRefine` 400s the ENTIRE commit if any
 *    `plan_ref` doesn't resolve to a plan in the same proposal. Simplest way
 *    to avoid that whole bug class is to never let `ref` be touched here.
 *  - `plan_ref` on any child item — only ever set from `plan.ref` by the
 *    parent's own filter (see `withPlanChildren` below), never typed by the
 *    user, for the same dangling-ref reason.
 *  - schedule block day-of-week and end_time, task/habit cadence — left at
 *    whatever the AI proposed; not "obviously useful" enough for this pass
 *    per the task's own scoping ("doesn't need to cover literally every
 *    field").
 *  - `start_time` editing is intentionally a validated HH:MM(:SS) field
 *    (see `parseTimeInput`), not a free TextInput — the backend's Zod schema
 *    rejects anything else and a free-text "9am" would silently 400 the
 *    whole commit at Accept time with no clue which field caused it.
 *
 * State shape: this component holds no proposal data of its own. Every
 * field edit calls `onChange` with a brand-new `OnboardingProposal` object
 * (same shape `commitOnboardingPlan` expects), and the caller
 * (`app/(app)/onboarding.tsx`) sets that as its single `proposal` state
 * value — no parallel "draft" structure anywhere.
 *
 * Index identity: child resources (`trackers`/`tasks`/`habits`/
 * `schedule_blocks`) have no `id` and no `ref` of their own — only a
 * `plan_ref` string and their position in the proposal's flat arrays. Every
 * "for this plan" list below is built by mapping the full array to
 * `{item, index}` pairs FIRST and filtering after, so edits write back to
 * the original array index rather than a re-numbered filtered index (which
 * would silently edit the wrong row for any plan that isn't first in the
 * proposal).
 *
 * React key choice matters here for a second, subtler reason beyond correct
 * writes: `TrackerRow`/`ScheduleBlockRow` hold local draft state
 * (`targetDraft`/`timeDraft`) that is intentionally never re-synced from
 * props (see their own comments). If their key were the raw original-array
 * `index`, removing an earlier plan via `onRejectPlan` shifts every later
 * item's index down, and React would match the surviving key to a
 * *different* item — reusing that component instance (and its stale local
 * draft) for a row that now renders different `tracker`/`block` data. The
 * key is `${plan.ref}-t-${pos}` (position WITHIN that plan's own filtered
 * list, via the `pos` param `.map` provides) instead: removing a different
 * plan never changes another plan's child count or order, so this key is
 * stable across a rejection and each row's local draft stays attached to
 * the same logical item. Unlinked-item keys (`u-t-${pos}`, etc.) are stable
 * for the same reason — the unlinked list is filtered by `!plan_ref` and a
 * plan removal can only drop items that already had a `plan_ref`, so it
 * never touches the unlinked list's membership or order.
 */

function withIndex<T>(arr: T[] | undefined): { item: T; index: number }[] {
  return (arr ?? []).map((item, index) => ({ item, index }));
}

// HH:MM or HH:MM:SS, 24h — matches what the backend's Zod schema accepts.
// Deliberately conservative: reject rather than silently coerce, since a
// value that slips through wrong here only surfaces as a whole-commit 400
// with no field-level indication of what caused it.
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

function isBlank(s: string | undefined): boolean {
  return !s || s.trim() === '';
}

export interface ProposalValidationIssue {
  message: string;
}

/**
 * Required-field + format checks the Accept button must pass before
 * `commitOnboardingPlan` is even attempted. Mirrors the subset of
 * `onboardingProposalSchema` that a hand-edit in this component could
 * violate (required non-empty strings, `start_time` format) — NOT a
 * reimplementation of the full backend schema, just the fields this editor
 * exposes. The backend re-validates everything regardless; this is purely
 * to give the user an inline reason instead of a generic "commit failed"
 * after a round trip.
 */
export function validateProposal(proposal: OnboardingProposal): ProposalValidationIssue[] {
  const issues: ProposalValidationIssue[] = [];
  if (isBlank(proposal.summary)) issues.push({ message: 'Summary cannot be empty.' });
  for (const plan of proposal.plans) {
    if (isBlank(plan.name)) issues.push({ message: 'Every plan needs a name.' });
  }
  for (const t of proposal.trackers ?? []) {
    if (isBlank(t.name)) issues.push({ message: 'Every tracker needs a name.' });
  }
  for (const t of proposal.tasks ?? []) {
    if (isBlank(t.title)) issues.push({ message: 'Every task needs a title.' });
  }
  for (const h of proposal.habits ?? []) {
    if (isBlank(h.title)) issues.push({ message: 'Every habit needs a title.' });
  }
  for (const b of proposal.schedule_blocks ?? []) {
    if (isBlank(b.title)) issues.push({ message: 'Every schedule block needs a title.' });
    if (!TIME_RE.test(b.start_time)) issues.push({ message: `"${b.start_time}" isn't a valid time (use HH:MM).` });
  }
  return issues;
}

export function ProposalPreview({
  proposal,
  onChange,
  onRejectPlan,
}: {
  proposal: OnboardingProposal;
  onChange: (next: OnboardingProposal) => void;
  onRejectPlan: (ref: string) => void;
}) {
  const trackersIdx = withIndex(proposal.trackers);
  const habitsIdx = withIndex(proposal.habits);
  const blocksIdx = withIndex(proposal.schedule_blocks);
  const tasksIdx = withIndex(proposal.tasks);

  const trackersFor = (ref: string) => trackersIdx.filter(({ item }) => item.plan_ref === ref);
  const habitsFor = (ref: string) => habitsIdx.filter(({ item }) => item.plan_ref === ref);
  const blocksFor = (ref: string) => blocksIdx.filter(({ item }) => item.plan_ref === ref);
  const tasksFor = (ref: string) => tasksIdx.filter(({ item }) => item.plan_ref === ref);

  const unlinkedTrackers = trackersIdx.filter(({ item }) => !item.plan_ref);
  const unlinkedHabits = habitsIdx.filter(({ item }) => !item.plan_ref);
  const unlinkedBlocks = blocksIdx.filter(({ item }) => !item.plan_ref);
  const unlinkedTasks = tasksIdx.filter(({ item }) => !item.plan_ref);
  const hasUnlinked =
    unlinkedTrackers.length + unlinkedHabits.length + unlinkedBlocks.length + unlinkedTasks.length > 0;

  function updatePlanName(ref: string, name: string) {
    onChange({ ...proposal, plans: proposal.plans.map((p) => (p.ref === ref ? { ...p, name } : p)) });
  }

  function updateTracker(index: number, patch: Partial<ProposedTracker>) {
    onChange({
      ...proposal,
      trackers: (proposal.trackers ?? []).map((t, i) => (i === index ? { ...t, ...patch } : t)),
    });
  }

  function updateHabit(index: number, patch: Partial<ProposedHabit>) {
    onChange({ ...proposal, habits: (proposal.habits ?? []).map((h, i) => (i === index ? { ...h, ...patch } : h)) });
  }

  function updateBlock(index: number, patch: Partial<ProposedScheduleBlock>) {
    onChange({
      ...proposal,
      schedule_blocks: (proposal.schedule_blocks ?? []).map((b, i) => (i === index ? { ...b, ...patch } : b)),
    });
  }

  function updateTask(index: number, patch: Partial<ProposedTask>) {
    onChange({ ...proposal, tasks: (proposal.tasks ?? []).map((t, i) => (i === index ? { ...t, ...patch } : t)) });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.fieldLabel}>Summary</Text>
      <TextInput
        style={styles.summaryInput}
        value={proposal.summary}
        onChangeText={(v) => onChange({ ...proposal, summary: v })}
        multiline
      />

      {proposal.plans.length === 0 ? (
        <Text style={styles.empty}>No plans left — reject fewer, or go back and chat some more.</Text>
      ) : (
        proposal.plans.map((plan) => (
          <View key={plan.ref} style={styles.card}>
            <View style={styles.cardHeader}>
              <TextInput
                style={styles.cardTitleInput}
                value={plan.name}
                onChangeText={(v) => updatePlanName(plan.ref, v)}
              />
              <Pressable onPress={() => onRejectPlan(plan.ref)} hitSlop={8}>
                <Text style={styles.reject}>Remove</Text>
              </Pressable>
            </View>
            {plan.aim ? <Text style={styles.aim}>{plan.aim}</Text> : null}

            {trackersFor(plan.ref).map(({ item, index }, pos) => (
              <TrackerRow key={`${plan.ref}-t-${pos}`} tracker={item} onChange={(patch) => updateTracker(index, patch)} />
            ))}
            {habitsFor(plan.ref).map(({ item, index }, pos) => (
              <TitleRow key={`${plan.ref}-h-${pos}`} icon="🔁" title={item.title} onChangeTitle={(v) => updateHabit(index, { title: v })} />
            ))}
            {blocksFor(plan.ref).map(({ item, index }, pos) => (
              <ScheduleBlockRow key={`${plan.ref}-b-${pos}`} block={item} onChange={(patch) => updateBlock(index, patch)} />
            ))}
            {tasksFor(plan.ref).map(({ item, index }, pos) => (
              <TitleRow key={`${plan.ref}-k-${pos}`} icon="✅" title={item.title} onChangeTitle={(v) => updateTask(index, { title: v })} />
            ))}
          </View>
        ))
      )}

      {hasUnlinked ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Not tied to a specific plan</Text>
          {unlinkedTrackers.map(({ item, index }, pos) => (
            <TrackerRow key={`u-t-${pos}`} tracker={item} onChange={(patch) => updateTracker(index, patch)} />
          ))}
          {unlinkedHabits.map(({ item, index }, pos) => (
            <TitleRow key={`u-h-${pos}`} icon="🔁" title={item.title} onChangeTitle={(v) => updateHabit(index, { title: v })} />
          ))}
          {unlinkedBlocks.map(({ item, index }, pos) => (
            <ScheduleBlockRow key={`u-b-${pos}`} block={item} onChange={(patch) => updateBlock(index, patch)} />
          ))}
          {unlinkedTasks.map(({ item, index }, pos) => (
            <TitleRow key={`u-k-${pos}`} icon="✅" title={item.title} onChangeTitle={(v) => updateTask(index, { title: v })} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function TitleRow({
  icon,
  title,
  onChangeTitle,
}: {
  icon: string;
  title: string;
  onChangeTitle: (v: string) => void;
}) {
  return (
    <View style={styles.itemRow}>
      <Text style={styles.itemIcon}>{icon}</Text>
      <TextInput style={styles.itemInput} value={title} onChangeText={onChangeTitle} />
    </View>
  );
}

function TrackerRow({ tracker, onChange }: { tracker: ProposedTracker; onChange: (patch: Partial<ProposedTracker>) => void }) {
  // `target` is the one field that needs a local string draft rather than
  // writing straight through: it must allow transient states a `number`
  // can't represent ("", "1.", "-") while the user is mid-keystroke.
  // Initialized once from the proposal value and never re-synced from a
  // prop afterward — nothing but this same user's typing changes this
  // field during a preview session, so there's no external-change case to
  // adjust for (the NumericInput/TimedInput sync-during-render pattern
  // exists for a value the SERVER can change under the component; that
  // doesn't apply to in-memory proposal state nobody else is writing to).
  const [targetDraft, setTargetDraft] = useState(tracker.target != null ? String(tracker.target) : '');

  function commitTarget(v: string) {
    setTargetDraft(v);
    const trimmed = v.trim();
    if (trimmed === '') {
      onChange({ target: undefined });
      return;
    }
    const parsed = Number(trimmed);
    // Guard against NaN reaching the proposal object: JSON.stringify turns
    // NaN into `null`, which fails the backend's `z.number()` check with a
    // generic 400 that gives no hint the cause was a stray non-numeric
    // target value typed here.
    if (Number.isFinite(parsed)) onChange({ target: parsed });
  }

  return (
    <View style={styles.trackerRow}>
      <Text style={styles.itemIcon}>📊</Text>
      <TextInput style={styles.itemInput} value={tracker.name} onChangeText={(v) => onChange({ name: v })} />
      <TextInput
        style={styles.smallInput}
        value={targetDraft}
        onChangeText={commitTarget}
        keyboardType="numeric"
        placeholder="target"
      />
      <TextInput
        style={styles.smallInput}
        value={tracker.unit ?? ''}
        onChangeText={(v) => onChange({ unit: v.trim() === '' ? undefined : v })}
        placeholder="unit"
      />
    </View>
  );
}

function ScheduleBlockRow({
  block,
  onChange,
}: {
  block: ProposedScheduleBlock;
  onChange: (patch: Partial<ProposedScheduleBlock>) => void;
}) {
  // Same local-draft reasoning as TrackerRow's `target`: needs to allow an
  // in-progress, not-yet-valid string ("9", "9:3") without either rejecting
  // keystrokes or writing a malformed time into the proposal on every
  // keystroke. Only a value that fully matches TIME_RE is propagated via
  // `onChange`; an invalid draft stays local until it either becomes valid
  // or the field loses focus (in which case the last-known-valid
  // `block.start_time` is still what's in the proposal — never overwritten
  // with garbage).
  const [timeDraft, setTimeDraft] = useState(block.start_time);

  function handleTimeChange(v: string) {
    setTimeDraft(v);
    if (TIME_RE.test(v)) onChange({ start_time: v });
  }

  const timeIsValid = TIME_RE.test(timeDraft);

  return (
    <View style={styles.trackerRow}>
      <Text style={styles.itemIcon}>🗓</Text>
      <Text style={styles.dayLabel}>{DAY_NAMES[block.day_of_week]}</Text>
      <TextInput
        style={[styles.smallInput, !timeIsValid && styles.invalidInput]}
        value={timeDraft}
        onChangeText={handleTimeChange}
        placeholder="HH:MM"
      />
      <TextInput style={styles.itemInput} value={block.title} onChangeText={(v) => onChange({ title: v })} />
    </View>
  );
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#999', textTransform: 'uppercase', marginBottom: 4 },
  summaryInput: {
    fontSize: 15,
    color: '#333',
    marginBottom: 20,
    lineHeight: 21,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 10,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  empty: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 20 },
  card: {
    backgroundColor: '#f7f7f7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  cardTitleInput: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 2,
  },
  reject: { color: '#c0392b', fontSize: 13, fontWeight: '600' },
  aim: { fontSize: 14, color: '#555', marginTop: 4, marginBottom: 8 },
  item: { fontSize: 14, color: '#333', marginTop: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  itemIcon: { fontSize: 14 },
  itemInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e2e2',
    paddingVertical: 2,
  },
  trackerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  smallInput: {
    fontSize: 14,
    color: '#333',
    width: 64,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e2e2',
    paddingVertical: 2,
    textAlign: 'center',
  },
  invalidInput: { borderBottomColor: '#c0392b', color: '#c0392b' },
  dayLabel: { fontSize: 13, color: '#888', width: 32 },
});
