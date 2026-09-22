import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { apiErrorCode, useApiErrorHandling, type ApiErrorKind } from '@/hooks/useApiErrorHandling';
import { decideDiff, generateReview, getThisWeekReview, type ProposedReviewDiff, type Review } from '@/lib/review';

/**
 * The Today-screen surface for the weekly Sunday Review (ROADMAP.md Phase
 * 3's heavier weekly sibling to the daily check-in). Built by closely
 * mirroring `components/checkin/CheckinCard.tsx` — same directory
 * conventions, same accept/edit/reject trust model, same error-handling
 * hookup — but NOT a blind copy: review's backend shapes differ from
 * check-in's in ways that would silently misrender if pattern-matched
 * without re-reading `lib/validation/review.ts` and the three review
 * routes directly (done before writing this file, not assumed from the
 * memory file's prose). Three concrete divergences from `CheckinCard`,
 * documented here rather than left implicit:
 *
 * 1. **Two directional diff kinds, not one.** Review adds `raise_target`
 *    alongside `lower_target` (a full week of data justifies raising a
 *    consistently-hit target, which check-in's noisier daily window
 *    doesn't). Every `kind === 'lower_target'` branch in check-in's
 *    `DiffRow` (target line, Edit link, accept-with-edit handler) is
 *    `kind === 'lower_target' || kind === 'raise_target'` here. There is
 *    still no `move_time_block` kind in review as of this writing
 *    (`reviewDiffKindSchema` re-read fresh immediately before this file was
 *    written) — an unrecognized/future kind falls through to a generic
 *    reason + accept/reject row with no target line, which renders safely
 *    rather than crashing if one is ever added.
 * 2. **The two "nothing here" states mean opposite things, so they get
 *    different copy — not check-in's one-size-fits-all "nothing to flag"
 *    line.** `no_weekly_activity` (404, thrown by `generateReview()`) means
 *    zero tracker_entries logged all week — genuinely nothing to review
 *    yet (e.g. a brand-new user), rendered as a neutral/instructional
 *    empty state. A successful review with `proposed_diffs.length === 0`
 *    means the opposite: every target was hit, a real GOOD week — rendered
 *    as a positive "no changes suggested" state. Collapsing these into one
 *    string (as check-in does, correctly, since check-in's own 404 and
 *    empty-diffs case really are the same "nothing to flag" condition)
 *    would misreport a good week as if nothing had happened.
 * 3. **No retry affordance on a `result.errors` row.** `review/decide/
 *    route.ts` records `diff_decisions[ref]` before attempting the tracker
 *    update that can fail (same ordering check-in's decide route had
 *    before it was fixed this session — review's has NOT been fixed, see
 *    this file's own build-status report) — a ref landing in
 *    `result.errors` is already decided server-side and re-deciding it
 *    409s. The row shows the error text and stops there, same as
 *    check-in's `DiffRow` already does (nothing to change here, just
 *    confirmed rather than assumed).
 *
 * Reused as-is from `CheckinCard`, deliberately not reinvented: the own
 * data-loading effect kept separate from Today's tracker fetch; generate
 * is button-only, never auto-fired on mount (a real Gemini call — same
 * cost-consciousness constraint); 402 bubbles up via `onEntitlementRequired`
 * to Today's existing `TrialPaywall`, not a second paywall; each diff is
 * its own row component with its own submitting state; the local-draft
 * numeric input pattern (init once, never re-synced from props — a
 * review's `proposed_target` is fixed at generation time and a decided ref
 * is locked, so there's no external-change case to guard against);
 * `result.errors` surfaced per-diff-row via the `"<ref>"`-quoted substring
 * match.
 *
 * Not built on `ProposalPreview` for the same reason `CheckinCard` wasn't:
 * a review is a short narrative plus a handful of flat, independently
 * decided diffs, not a per-plan-grouped multi-resource commit.
 *
 * Entry-point/reachability: rendered as a card inside Today, directly under
 * `CheckinCard` (daily above weekly) — no separate route. Weekly cadence
 * doesn't need its own screen/tab; this app has no tab navigator at all
 * (`(app)/` is a plain Stack with `index`/`onboarding`/`settings`), so a new
 * route would need Expo Router typed-route regeneration for no real
 * navigational benefit, and would bury a once-a-week surface behind an
 * extra tap instead of surfacing it on the one screen the user already
 * opens daily. A small dot badge (same derivation as check-in's: any
 * proposed diff with no decision yet) shows next to "This week" when there
 * is something actionable.
 */
export function ReviewCard({ onEntitlementRequired }: { onEntitlementRequired: (err: ApiErrorKind & { kind: 'entitlement_required' }) => void }) {
  const [review, setReview] = useState<Review | null | undefined>(undefined); // undefined = loading, null = none yet this week
  const [loadFailed, setLoadFailed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState<'idle' | 'no_activity' | 'ai_disabled' | 'error'>('idle');
  const { classify } = useApiErrorHandling();

  // Same promise-chain convention as CheckinCard/index.tsx's `load` — an
  // `async function` awaited via `void load()` inside useEffect is flagged
  // by react-hooks/set-state-in-effect; this keeps every setState call
  // inside a .then()/.catch() callback instead.
  const load = useCallback(() => {
    return getThisWeekReview()
      .then(({ review: r }) => {
        setReview(r);
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
        // than blocking Today.
        setLoadFailed(true);
      });
  }, [classify, onEntitlementRequired]);

  useEffect(() => {
    load();
  }, [load]);

  function handleGenerate() {
    setIsGenerating(true);
    setGenerateStatus('idle');
    generateReview()
      .then(({ review: r }) => {
        setReview(r);
      })
      .catch((err: unknown) => {
        const code = apiErrorCode(err);
        if (code === 'review_already_generated_this_week') {
          // Already exists — refetch rather than surface this as an error,
          // per the same "silently refetch" convention as check-in's
          // checkin_already_generated_today. load() itself doesn't set
          // isGenerating, so do that here once it settles.
          load().finally(() => setIsGenerating(false));
          return;
        }
        if (code === 'no_weekly_activity') {
          // NOT the same copy as check-in's "nothing to flag" — see this
          // file's doc comment. This means zero activity logged all week,
          // not a good week.
          setGenerateStatus('no_activity');
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
        // review_context_failed / unauthenticated / anything else.
        setGenerateStatus('error');
        setIsGenerating(false);
      });
    return; // not async — fire-and-forget button handler, matching Today's/CheckinCard's convention.
  }

  function handleDecided(updated: Review) {
    setReview(updated);
  }

  if (review === undefined) {
    // Loading — no spinner of its own weight, matching CheckinCard.
    return null;
  }

  if (loadFailed) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>Couldn&apos;t load this week&apos;s review.</Text>
        <Pressable onPress={() => load()} hitSlop={8}>
          <Text style={styles.retryLink}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const undecidedCount = review ? review.proposed_diffs.filter((d) => !(d.ref in review.diff_decisions)).length : 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>This week</Text>
          {undecidedCount > 0 ? <View style={styles.badgeDot} /> : null}
        </View>
        {review ? <Text style={styles.timestamp}>{new Date(review.generated_at).toLocaleString()}</Text> : null}
      </View>

      {!review ? (
        <>
          <Text style={styles.bodyText}>No review yet this week.</Text>
          {generateStatus === 'no_activity' && (
            <Text style={styles.calmText}>Nothing logged this week yet — track a few days and check back.</Text>
          )}
          {generateStatus === 'ai_disabled' && (
            <Text style={styles.errorText}>AI reviews aren&apos;t available right now.</Text>
          )}
          {generateStatus === 'error' && (
            <Text style={styles.errorText}>Couldn&apos;t generate a review. Try again.</Text>
          )}
          <Pressable style={[styles.generateButton, isGenerating && styles.buttonDisabled]} onPress={handleGenerate} disabled={isGenerating}>
            {isGenerating ? <ActivityIndicator color="#fff" /> : <Text style={styles.generateButtonText}>Generate this week&apos;s review</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.narrative}>{review.narrative}</Text>
          {review.pattern ? <Text style={styles.pattern}>{review.pattern}</Text> : null}

          {review.proposed_diffs.length === 0 ? (
            // A real good week (every target hit) — deliberately positive
            // copy, not the same "nothing to flag" string as the
            // no_weekly_activity state above. See this file's doc comment.
            <Text style={styles.calmText}>No changes suggested — your targets look right.</Text>
          ) : (
            review.proposed_diffs.map((diff) => (
              <DiffRow key={diff.ref} diff={diff} review={review} onDecided={handleDecided} onEntitlementRequired={onEntitlementRequired} />
            ))
          )}
        </>
      )}
    </View>
  );
}

function DiffRow({
  diff,
  review,
  onDecided,
  onEntitlementRequired,
}: {
  diff: ProposedReviewDiff;
  review: Review;
  onDecided: (updated: Review) => void;
  onEntitlementRequired: (err: ApiErrorKind & { kind: 'entitlement_required' }) => void;
}) {
  const decidedValue = review.diff_decisions[diff.ref];
  const editedTarget = review.edited_values?.[diff.ref]?.target;
  const isDecided = decidedValue !== undefined;
  const isDirectional = diff.kind === 'lower_target' || diff.kind === 'raise_target';

  const [isEditing, setIsEditing] = useState(false);
  // Local draft, initialized once and never re-synced from a prop — same
  // rationale as CheckinCard.DiffRow: a review's proposed_target is fixed
  // at generation time, and a decided ref is locked (re-deciding 409s), so
  // there's no external-change case to guard against here (unlike
  // NumericInput's syncedAt pattern, which exists because the SERVER can
  // change a tracker entry's value under that component).
  const [draft, setDraft] = useState(diff.proposed_target != null ? String(diff.proposed_target) : '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const { classify } = useApiErrorHandling();

  function submit(decision: 'accept' | 'reject', value?: number) {
    setIsSubmitting(true);
    setRowError(null);
    decideDiff(diff.ref, decision, value)
      .then(({ review: updated, result }) => {
        onDecided(updated);
        setIsEditing(false);
        const rowIssue = result.errors.find((e) => e.includes(`"${diff.ref}"`));
        if (rowIssue) setRowError(rowIssue);
      })
      .catch((err: unknown) => {
        const code = apiErrorCode(err);
        if (code === 'diff_already_decided') {
          // Server state is authoritative — the parent's next
          // load()/generate() response will reflect it; no local resync
          // call from inside a row, just a calm note.
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
    if (isDirectional && isEditing) {
      const trimmed = draft.trim();
      const parsed = Number(trimmed);
      if (trimmed === '' || !Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) return;
      // Only pass edited_target when it actually differs from the AI's
      // proposal — matches reviewDecisionSchema's superRefine, which
      // allows edited_target on accept unconditionally, but there's no
      // reason to send a redundant "edit" for an unchanged number.
      // Number(...) guards against the documented supabase-js
      // string-numeric landmine even though proposed_diffs is Zod-validated
      // JSONB (should already be a real number) — costs nothing.
      submit('accept', parsed !== Number(diff.proposed_target) ? parsed : undefined);
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

      {isDirectional && (
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
              {isDirectional && !isEditing && (
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
