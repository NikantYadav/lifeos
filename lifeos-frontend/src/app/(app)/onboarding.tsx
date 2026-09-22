import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { TrialPaywall } from '@/components/TrialPaywall';
import { ProposalPreview, validateProposal } from '@/components/onboarding/ProposalPreview';
import { apiErrorCode, useApiErrorHandling, type ApiErrorKind } from '@/hooks/useApiErrorHandling';
import { useSession } from '@/hooks/useSession';
import {
  commitOnboardingPlan,
  getOnboardingSession,
  MAX_MESSAGE_CHARS,
  proposeOnboardingPlan,
  removePlanFromProposal,
  sendOnboardingMessage,
  skipOnboarding,
  type ChatTurn,
  type OnboardingProposal,
  type OnboardingSession,
} from '@/lib/onboarding';

/**
 * ROADMAP.md Phase 2's chat -> propose -> preview -> commit flow, one route
 * with two phases via local state rather than two routes — a preview route
 * would need the proposal (a full JSON object, not a string) passed through
 * `useLocalSearchParams`, which only carries strings; keeping it one screen
 * avoids round-tripping the proposal through the URL.
 *
 * `session.transcript` from the server is the source of truth for the chat
 * log (rendered directly, not accumulated into a separate local array) —
 * every POST /api/onboarding response already carries both the user's turn
 * and the model's reply appended, so there is nothing this screen needs to
 * merge itself; it only ever replaces state from the latest response.
 *
 * Preview step covers ROADMAP.md's full "escape hatch" bullet: skip
 * (discard entirely, `handleSkip`), reject-a-plan (partial discard,
 * `handleRejectPlan` -> `removePlanFromProposal`), and hand-edit (field-by-
 * field editing of the obviously-useful fields, via `ProposalPreview`'s
 * `onChange` -> `setProposal` here — same `proposal` state, no parallel
 * "draft" object). See `ProposalPreview`'s own doc comment for which fields
 * are editable and why `ref`/`plan_ref` specifically are not.
 *

 * Leaving this screen on success is done via `setOnboardingStatus(...)`
 * from `useSession`, never `router.replace('/')` directly: the `(app)`
 * layout's `Stack.Protected` guard reads that same status to decide whether
 * `onboarding` or `index` is even registered in the navigator, so the guard
 * flipping IS the navigation — a `router.replace` fired before that flip
 * would target a route the guard had just removed.
 */
export default function Onboarding() {
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [proposal, setProposal] = useState<OnboardingProposal | null>(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<ApiErrorKind | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { classify } = useApiErrorHandling();
  const { setOnboardingStatus } = useSession();

  const load = useCallback(() => {
    return getOnboardingSession()
      .then(({ session: s }) => {
        setSession(s);
        setErrorState(null);
      })
      .catch((err: unknown) => {
        // This is a lifetime, non-resetting cap (see MAX_ONBOARDING_SESSIONS'
        // doc comment in the backend's validation/onboarding.ts and
        // start_onboarding_session's only-ever-increments SQL) — there is no
        // in-app path back from it, so the message says so plainly rather
        // than implying a retry might work.
        if (apiErrorCode(err) === 'onboarding_session_limit_reached') {
          setErrorState({
            kind: 'other',
            message: "You've reached the maximum number of onboarding attempts. Please contact support if you need to restart.",
          });
          return;
        }
        setErrorState(classify(err));
      });
  }, [classify]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSend() {
    const message = draft.trim();
    if (!message || isSending) return;
    setActionError(null);
    setIsSending(true);
    setDraft('');
    try {
      const { session: s } = await sendOnboardingMessage(message);
      setSession(s);
    } catch (err) {
      const code = apiErrorCode(err);
      if (code === 'transcript_turn_limit_reached') {
        setActionError("We've talked plenty — tap \"Build my plan\" below to continue.");
      } else if (code === 'ai_disabled') {
        setActionError('AI onboarding is temporarily unavailable. You can skip for now.');
      } else if (code === 'onboarding_session_limit_reached') {
        // Rare here — this session already loaded successfully, so hitting
        // the cap on send means the active session got applied elsewhere
        // (e.g. another device) between load and this request. Route
        // through errorState (not actionError) so the whole screen reflects
        // the terminal state rather than showing a dismissible chat error.
        setErrorState({
          kind: 'other',
          message: "You've reached the maximum number of onboarding attempts. Please contact support if you need to restart.",
        });
      } else {
        const classified = classify(err);
        if (classified.kind === 'entitlement_required' || classified.kind === 'unauthenticated') {
          setErrorState(classified);
        } else {
          setActionError(classified.message);
        }
      }
      setDraft(message); // give the user their text back so nothing is lost
    } finally {
      setIsSending(false);
    }
  }

  async function handlePropose() {
    setActionError(null);
    setIsProposing(true);
    try {
      const { session: s } = await proposeOnboardingPlan();
      setSession(s);
      setProposal(s.proposed_plan);
    } catch (err) {
      const code = apiErrorCode(err);
      if (code === 'transcript_empty') {
        setActionError('Send at least one message first.');
      } else if (code === 'ai_response_truncated') {
        setActionError('That plan came out too large — try a shorter conversation, then build again.');
      } else if (code === 'ai_produced_invalid_proposal' || code === 'ai_error') {
        setActionError("Couldn't build a plan from that conversation — try rephrasing your goals and try again.");
      } else {
        const classified = classify(err);
        if (classified.kind === 'entitlement_required' || classified.kind === 'unauthenticated') {
          setErrorState(classified);
        } else {
          setActionError(classified.message);
        }
      }
    } finally {
      setIsProposing(false);
    }
  }

  function handleRejectPlan(ref: string) {
    setProposal((prev) => (prev ? removePlanFromProposal(prev, ref) : prev));
  }

  const validationIssues = proposal ? validateProposal(proposal) : [];

  async function handleAccept() {
    if (!proposal || proposal.plans.length === 0 || validationIssues.length > 0) return;
    setActionError(null);
    setIsCommitting(true);
    try {
      const { result } = await commitOnboardingPlan(proposal);
      // Commit is best-effort/non-atomic server-side (see commit/route.ts's
      // doc comment) — a partial failure still returns 201, so `errors`
      // must be surfaced rather than treated as a bare success. The status
      // flip below still happens either way: whatever DID get created is
      // real and the user is past onboarding regardless.
      if (result.errors.length > 0) {
        setActionError(`Saved with some issues: ${result.errors.join('; ')}`);
      }
      setOnboardingStatus('completed');
    } catch (err) {
      const classified = classify(err);
      if (classified.kind === 'entitlement_required' || classified.kind === 'unauthenticated') {
        setErrorState(classified);
      } else if (apiErrorCode(err) === 'already_applied') {
        // A concurrent/retried commit already landed — this proposal is
        // moot, but the user's onboarding genuinely is done either way.
        setOnboardingStatus('completed');
      } else {
        setActionError(`Could not save your plan: ${classified.message}`);
      }
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleSkip() {
    setActionError(null);
    try {
      await skipOnboarding();
      setOnboardingStatus('skipped');
    } catch (err) {
      const classified = classify(err);
      if (classified.kind === 'entitlement_required' || classified.kind === 'unauthenticated') {
        setErrorState(classified);
      } else {
        setActionError(classified.message);
      }
    }
  }

  if (errorState?.kind === 'entitlement_required') {
    return <TrialPaywall status={errorState.status} trialEndsAt={errorState.trialEndsAt} />;
  }
  if (errorState?.kind === 'unauthenticated') return null;
  if (errorState?.kind === 'other') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorBanner}>{errorState.message}</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (proposal) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Here&apos;s the plan I built</Text>
          <View style={styles.headerLinks}>
            <Pressable onPress={() => setProposal(null)}>
              <Text style={styles.link}>Back to chat</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/settings')}>
              <Text style={styles.link}>Settings</Text>
            </Pressable>
          </View>
        </View>
        <ProposalPreview proposal={proposal} onChange={setProposal} onRejectPlan={handleRejectPlan} />
        {actionError ? <Text style={styles.errorBanner}>{actionError}</Text> : null}
        {validationIssues.length > 0 ? (
          <Text style={styles.errorBanner}>
            {[...new Set(validationIssues.map((i) => i.message))].join(' ')}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <Pressable
            style={[styles.button, styles.secondaryButton]}
            onPress={handleSkip}
            disabled={isCommitting}
          >
            <Text style={styles.secondaryButtonText}>Skip for now</Text>
          </Pressable>
          <Pressable
            style={[
              styles.button,
              (isCommitting || proposal.plans.length === 0 || validationIssues.length > 0) && styles.buttonDisabled,
            ]}
            onPress={handleAccept}
            disabled={isCommitting || proposal.plans.length === 0 || validationIssues.length > 0}
          >
            {isCommitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Accept & start</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  const transcript: ChatTurn[] = session.transcript;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Let&apos;s set up LifeOS</Text>
        <View style={styles.headerLinks}>
          <Pressable onPress={() => router.push('/settings')}>
            <Text style={styles.link}>Settings</Text>
          </Pressable>
          <Pressable onPress={handleSkip}>
            <Text style={styles.link}>Skip</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {transcript.length === 0 ? (
          <Text style={styles.empty}>
            Tell me about your goals, your current routine, and anything that tends to get in the way — I&apos;ll
            build a plan from it.
          </Text>
        ) : (
          transcript.map((turn, i) => (
            <View key={i} style={[styles.bubble, turn.role === 'user' ? styles.userBubble : styles.modelBubble]}>
              <Text style={turn.role === 'user' ? styles.userText : styles.modelText}>{turn.text}</Text>
            </View>
          ))
        )}
        {isSending ? <ActivityIndicator style={styles.typingIndicator} /> : null}
      </ScrollView>

      {actionError ? <Text style={styles.errorBanner}>{actionError}</Text> : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          value={draft}
          onChangeText={setDraft}
          maxLength={MAX_MESSAGE_CHARS}
          multiline
          editable={!isSending}
        />
        <Pressable
          style={[styles.sendButton, (!draft.trim() || isSending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!draft.trim() || isSending}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.button, styles.proposeButton, (transcript.length === 0 || isProposing) && styles.buttonDisabled]}
        onPress={handlePropose}
        disabled={transcript.length === 0 || isProposing}
      >
        {isProposing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Build my plan</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700' },
  headerLinks: { flexDirection: 'row', gap: 16 },
  link: { color: '#555', fontSize: 14 },
  chat: { flex: 1 },
  chatContent: { padding: 20, gap: 10 },
  empty: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 40, lineHeight: 20 },
  bubble: { maxWidth: '85%', borderRadius: 14, padding: 12 },
  userBubble: { backgroundColor: '#111', alignSelf: 'flex-end' },
  modelBubble: { backgroundColor: '#f0f0f0', alignSelf: 'flex-start' },
  userText: { color: '#fff', fontSize: 15 },
  modelText: { color: '#111', fontSize: 15 },
  typingIndicator: { marginTop: 4, alignSelf: 'flex-start' },
  errorBanner: { color: '#c0392b', fontSize: 13, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, gap: 8, paddingBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: { backgroundColor: '#111', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  sendButtonDisabled: { backgroundColor: '#ccc' },
  sendButtonText: { color: '#fff', fontWeight: '600' },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  proposeButton: { marginHorizontal: 20, marginBottom: 20 },
  footer: { flexDirection: 'row', gap: 12, padding: 20 },
  secondaryButton: { flex: 1, backgroundColor: '#eee' },
  secondaryButtonText: { color: '#111', fontSize: 16, fontWeight: '600' },
});
