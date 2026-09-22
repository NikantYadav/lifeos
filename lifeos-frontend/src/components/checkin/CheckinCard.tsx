import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiErrorCode, useApiErrorHandling, type ApiErrorKind } from '@/hooks/useApiErrorHandling';
import { decideDiff, generateCheckin, getTodayCheckin, type Checkin, type ProposedCheckinDiff } from '@/lib/checkin';

/**
 * The Today-screen surface for the daily AI check-in/nudge (ROADMAP.md
 * Phase 3's "lighter-weight sibling to the weekly Sunday Review"). Structural
 * choice, documented here rather than invented silently:
 *
 * - This is its OWN card with its own data-loading effect, not folded into
 *   Today's existing `Promise.all([listTrackers(), listEntries(...)])` — a
 *   check-in fetch failure (or the 404 "nothing to flag" case, which isn't
 *   an error at all) must never blank the tracker list, and the tracker list
 *   must never block on this. `getTodayCheckin()` is a cheap GET (no AI
 *   cost) so firing it on mount is fine; `generateCheckin()` is NOT auto-fired
 *   from here or anywhere — it's a real Gemini call, gated behind an explicit
 *   button tap only, per the task's explicit cost-risk instruction.
 * - It is NOT built on `ProposalPreview`'s component, despite being the
 *   closest sibling in spirit (same accept/edit/reject trust model, same
 *   "never write AI output straight to the DB unseen" rule). That component's
 *   shape is a whole multi-resource proposal grouped by plan with per-plan
 *   Remove/cascade semantics (`ref`/`plan_ref`) — none of that exists here.
 *   A check-in is a short narrative plus at most 5 flat, independent diffs,
 *   each individually accept/reject/edit-able and each submitted
 *   incrementally via its own `/decide` call (not one big commit). Forcing
 *   that into `ProposalPreview`'s per-plan-card layout would mean inventing
 *   a fake "plan" wrapper for data that has none. What IS reused, in spirit:
 *   the same visual language (rounded card, muted "reason" text under an
 *   editable value, accept in a dark pill button, reject as a plain red
 *   text link) and the same local-draft-input convention `ProposalPreview`'s
 *   `TrackerRow`/NumericInput both use for a number field.
 * - Each diff is its own small row component (`DiffRow`) with its own
 *   accept/reject/edit-in-place UI and its own submitting state, so acting on
 *   one diff never disables or re-renders the others mid-interaction.
 *
 * Entry-point/reachability: rendered as a card inside Today, right under the
 * header, above the tracker list — no separate route, reachable on every
 * Today mount without hunting. A small dot badge shows next to "Check-in"
 * when a check-in exists with at least one undecided diff (derived from
 * `checkin.proposed_diffs` vs `checkin.diff_decisions`, no new state/table).
 * Deliberately-scoped-out: a persisted "seen/unseen" read receipt beyond
 * decided-vs-not — the task flagged this as possibly overkill for a first
 * pass, and there's no natural place to store per-view state without a new
 * column; the dot answers "is there something actionable" which covers the
 * practical need.
 */
export function CheckinCard({ onEntitlementRequired }: { onEntitlementRequired: (err: ApiErrorKind & { kind: 'entitlement_required' }) => void }) {
  const [checkin, setCheckin] = useState<Checkin | null | undefined>(undefined); // undefined = loading, null = none yet
  const [loadFailed, setLoadFailed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState<'idle' | 'no_misses' | 'ai_disabled' | 'error'>('idle');
  const { classify } = useApiErrorHandling();

  // Same promise-chain convention as app/(app)/index.tsx's `load` — an
  // `async function` awaited via `void load()` inside useEffect is flagged
  // by react-hooks/set-state-in-effect (documented in the memory file as a
  // real, twice-repeated bug class in this codebase, not a style nit); this
  // keeps every setState call inside a .then()/.catch() callback instead.
  const load = useCallback(() => {
    return getTodayCheckin()
      .then(({ checkin: c }) => {
        setCheckin(c);
        setLoadFailed(false);
      })
      .catch((err: unknown) => {
        const classified = classify(err);
        if (classified.kind === 'entitlement_required') {
          onEntitlementRequired(classified);
          return;
        }
        // 'unauthenticated' already triggered sign-out inside classify().
        // For 'other', this card fails quietly (a small retry link) rather
        // than blocking Today, which is the whole point of it being a
        // separate card with its own load effect.
        setLoadFailed(true);
      });
  }, [classify, onEntitlementRequired]);

  useEffect(() => {
    load();
  }, [load]);

  function handleGenerate() {
    setIsGenerating(true);
    setGenerateStatus('idle');
    generateCheckin()
      .then(({ checkin: c }) => {
        setCheckin(c);
      })
      .catch((err: unknown) => {
        const code = apiErrorCode(err);
        if (code === 'checkin_already_generated_today') {
          // Already exists — refetch rather than surface this as an error,
          // per the task's explicit instruction. load() itself doesn't set
          // isGenerating, so do that here once it settles.
          load().finally(() => setIsGenerating(false));
          return;
        }
        if (code === 'no_recent_misses') {
          setGenerateStatus('no_misses');
          setIsGenerating(false);
          return;
        }
        if (code === 'ai_disabled') {
          setGenerateStatus('ai_disabled');
          setIsGenerating(false);
          return;
        }
        const classified = classify(err);
        if (classified.kind === 'entitlement_required') {
          onEntitlementRequired(classified);
          setIsGenerating(false);
          return;
        }
        // Covers ai_response_truncated / ai_error / ai_produced_invalid_proposal /
        // checkin_context_failed / unauthenticated / anything else — all
        // reasonable to show as "couldn't generate, try again".
        setGenerateStatus('error');
        setIsGenerating(false);
      });
    return; // handleGenerate itself isn't async — nothing awaits this call site, matching Today's fire-and-forget button handlers elsewhere.
  }

  function handleDecided(updated: Checkin) {
    setCheckin(updated);
  }

  if (checkin === undefined) {
    // Loading — deliberately no spinner of its own weight; a compact
    // inline placeholder so it doesn't compete with Today's own loading
    // state (which gates the whole screen already on first mount).
    return null;
  }

  if (loadFailed) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>Couldn&apos;t load today&apos;s check-in.</Text>
        <Pressable onPress={() => load()} hitSlop={8}>
          <Text style={styles.retryLink}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const undecidedCount = checkin ? checkin.proposed_diffs.filter((d) => !(d.ref in checkin.diff_decisions)).length : 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Check-in</Text>
          {undecidedCount > 0 ? <View style={styles.badgeDot} /> : null}
        </View>
        {checkin ? <Text style={styles.timestamp}>{new Date(checkin.generated_at).toLocaleString()}</Text> : null}
      </View>

      {!checkin ? (
        <>
          <Text style={styles.bodyText}>No check-in yet today.</Text>
          {generateStatus === 'no_misses' && (
            <Text style={styles.calmText}>Nothing to flag today — you&apos;re on track.</Text>
          )}
          {generateStatus === 'ai_disabled' && (
            <Text style={styles.errorText}>AI check-ins aren&apos;t available right now.</Text>
          )}
          {generateStatus === 'error' && (
            <Text style={styles.errorText}>Couldn&apos;t generate a check-in. Try again.</Text>
          )}
          <Pressable style={[styles.generateButton, isGenerating && styles.buttonDisabled]} onPress={handleGenerate} disabled={isGenerating}>
            {isGenerating ? <ActivityIndicator color="#fff" /> : <Text style={styles.generateButtonText}>Generate today&apos;s check-in</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.narrative}>{checkin.narrative}</Text>
          {checkin.pattern ? <Text style={styles.pattern}>{checkin.pattern}</Text> : null}

          {checkin.proposed_diffs.length === 0 ? (
            <Text style={styles.calmText}>Nothing to flag today — you&apos;re on track.</Text>
          ) : (
            checkin.proposed_diffs.map((diff) => (
              <DiffRow key={diff.ref} diff={diff} checkin={checkin} onDecided={handleDecided} onEntitlementRequired={onEntitlementRequired} />
            ))
          )}
        </>
      )}
    </View>
  );
}

function DiffRow({
  diff,
  checkin,
  onDecided,
  onEntitlementRequired,
}: {
  diff: ProposedCheckinDiff;
  checkin: Checkin;
  onDecided: (updated: Checkin) => void;
  onEntitlementRequired: (err: ApiErrorKind & { kind: 'entitlement_required' }) => void;
}) {
  const decidedValue = checkin.diff_decisions[diff.ref];
  const editedTarget = checkin.edited_values?.[diff.ref]?.target;
  const isDecided = decidedValue !== undefined;

  const [isEditing, setIsEditing] = useState(false);
  // Local draft, initialized once and never re-synced from a prop — this
  // mirrors ProposalPreview's TrackerRow.targetDraft, not NumericInput's
  // syncedAt pattern: NumericInput syncs because the SERVER can change
  // entry.value under the component (another device, pull-to-refresh).
  // diff.proposed_target cannot change while this card is mounted — a
  // check-in's diffs are fixed at generation time — and once decided the
  // ref is locked (re-deciding 409s), so there's no external-change case to
  // adjust for here.
  const [draft, setDraft] = useState(diff.proposed_target != null ? String(diff.proposed_target) : '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const { classify } = useApiErrorHandling();

  function submit(decision: 'accept' | 'reject', value?: number) {
    setIsSubmitting(true);
    setRowError(null);
    decideDiff(diff.ref, decision, value)
      .then(({ checkin: updated, result }) => {
        onDecided(updated);
        setIsEditing(false);
        const rowIssue = result.errors.find((e) => e.includes(`"${diff.ref}"`));
        if (rowIssue) setRowError(rowIssue);
      })
      .catch((err: unknown) => {
        const code = apiErrorCode(err);
        if (code === 'diff_already_decided') {
          // Server state is authoritative and already has the answer — the
          // parent's next load()/generate() response will reflect it; no
          // local resync call is made from inside a row, so just surface a
          // calm note instead of a raw error.
          setRowError('This suggestion was already decided.');
          setIsSubmitting(false);
          return;
        }
        const classified = classify(err);
        if (classified.kind === 'entitlement_required') {
          onEntitlementRequired(classified);
          setIsSubmitting(false);
          return;
        }
        setRowError('Something went wrong — try again.');
        setIsSubmitting(false);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  function handleAccept() {
    if (diff.kind === 'lower_target' && isEditing) {
      const trimmed = draft.trim();
      const parsed = Number(trimmed);
      if (trimmed === '' || !Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) return;
      // Only pass edited_target when it actually differs from the AI's
      // proposal — matches checkinDecisionSchema's superRefine, which
      // allows edited_target on accept unconditionally, but there's no
      // reason to send a redundant "edit" for an unchanged number.
      submit('accept', parsed !== diff.proposed_target ? parsed : undefined);
      return;
    }
    submit('accept');
  }

  function handleReject() {
    submit('reject');
  }

  return (
    <View style={styles.diffRow}>
      <Text style={styles.diffReason}>{diff.reason}</Text>

      {diff.kind === 'lower_target' && (
        <View style={styles.targetLine}>
          {diff.current_target != null ? <Text style={styles.targetOld}>{diff.current_target}</Text> : null}
          <Text style={styles.targetArrow}>{'->'}</Text>
          {isEditing && !isDecided ? (
            <TextInput
              style={styles.targetInput}
              value={draft}
              onChangeText={setDraft}
              keyboardType="decimal-pad"
              autoFocus
            />
          ) : (
            <Text style={styles.targetNew}>{isDecided && editedTarget != null ? editedTarget : diff.proposed_target}</Text>
          )}
          {diff.tracker_name ? <Text style={styles.trackerName}>{diff.tracker_name}</Text> : null}
        </View>
      )}

      {isDecided ? (
        <Text style={styles.decidedLabel}>
          {decidedValue === 'accept' ? (editedTarget != null ? 'Accepted (edited)' : 'Accepted') : 'Rejected'}
        </Text>
      ) : (
        <View style={styles.diffActions}>
          {isSubmitting ? (
            <ActivityIndicator size="small" />
          ) : (
            <>
              <Pressable onPress={handleReject} hitSlop={8}>
                <Text style={styles.rejectLink}>Reject</Text>
              </Pressable>
              {diff.kind === 'lower_target' && !isEditing && (
                <Pressable onPress={() => setIsEditing(true)} hitSlop={8}>
                  <Text style={styles.editLink}>Edit</Text>
                </Pressable>
              )}
              <Pressable style={styles.acceptButton} onPress={handleAccept}>
                <Text style={styles.acceptButtonText}>{isEditing ? 'Save' : 'Accept'}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {rowError ? <Text style={styles.rowErrorText}>{rowError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#eee' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  badgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e0703a' },
  timestamp: { fontSize: 12, color: '#aaa' },
  bodyText: { fontSize: 14, color: '#555', marginTop: 8, marginBottom: 14 },
  calmText: { fontSize: 14, color: '#4a8f5c', marginTop: 8 },
  errorText: { fontSize: 13, color: '#c0392b', marginTop: 8, marginBottom: 8 },
  retryLink: { fontSize: 13, color: '#555', marginTop: 4 },
  generateButton: { backgroundColor: '#111', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.5 },
  generateButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  narrative: { fontSize: 15, color: '#222', marginTop: 8, lineHeight: 21 },
  pattern: { fontSize: 13, color: '#888', marginTop: 6, fontStyle: 'italic' },
  diffRow: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  diffReason: { fontSize: 13, color: '#555' },
  targetLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  targetOld: { fontSize: 15, color: '#aaa', textDecorationLine: 'line-through' },
  targetArrow: { fontSize: 13, color: '#aaa' },
  targetNew: { fontSize: 15, fontWeight: '700', color: '#111' },
  targetInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 6,
    fontSize: 15,
    width: 64,
    textAlign: 'center',
  },
  trackerName: { fontSize: 13, color: '#888', marginLeft: 4 },
  diffActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 10 },
  rejectLink: { color: '#c0392b', fontSize: 13, fontWeight: '600' },
  editLink: { color: '#555', fontSize: 13, fontWeight: '600' },
  acceptButton: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  acceptButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  decidedLabel: { fontSize: 12, color: '#888', marginTop: 10, textAlign: 'right' },
  rowErrorText: { fontSize: 12, color: '#c0392b', marginTop: 6 },
});
