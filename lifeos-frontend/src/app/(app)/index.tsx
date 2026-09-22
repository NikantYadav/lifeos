import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { TrialPaywall } from '@/components/TrialPaywall';
import { CheckinCard } from '@/components/checkin/CheckinCard';
import { ReviewCard } from '@/components/review/ReviewCard';
import { TrackerCard } from '@/components/tracker-inputs/TrackerCard';
import { useApiErrorHandling, type ApiErrorKind } from '@/hooks/useApiErrorHandling';
import { createEntry, listEntries, listTrackers, todayDateString, type LogEntryInput, type Tracker, type TrackerEntry } from '@/lib/trackers';

/**
 * The Today view: every active tracker, one input per `kind` (via
 * TrackerCard -> the five kind components), today's already-logged value if
 * any. First real screen built against the trackers/tracker-entries backend
 * (see lifeos-public-app-direction memory's build-status section) — replaces
 * the earlier `/api/me` proof-of-life screen; that chain (sign-in -> Bearer
 * token -> backend -> entitlement check) is still exercised here, just via
 * real data endpoints instead of a dedicated smoke-test call.
 */
export default function Today() {
  const [trackers, setTrackers] = useState<Tracker[] | null>(null);
  const [entries, setEntries] = useState<TrackerEntry[]>([]);
  const [errorState, setErrorState] = useState<ApiErrorKind | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { classify } = useApiErrorHandling();

  const today = todayDateString();

  // `load` intentionally returns the promise chain rather than being an
  // `async function` awaited via `void load()` inside the effect —
  // react-hooks' `set-state-in-effect` rule flags a `setState` call it can
  // trace back into the effect's own synchronous call stack, which a
  // `void asyncFn()` invocation still counts as. Building the chain with
  // `.then()/.catch()` here (same shape the original proof-of-life screen
  // used) keeps the `setState` calls inside promise callbacks, which the
  // rule doesn't flag, without changing the actual data flow.
  const load = useCallback(() => {
    return Promise.all([listTrackers(), listEntries({ from: today, to: today })])
      .then(([trackersRes, entriesRes]) => {
        setTrackers(trackersRes.trackers);
        setEntries(entriesRes.entries);
        setErrorState(null);
      })
      .catch((err: unknown) => {
        // 401 -> classify() signs out (Stack.Protected then bounces to
        // sign-in); 402 -> render the paywall via `errorState`; anything
        // else -> generic error text. Never a blank/spinner-forever screen
        // for the two states that are actually live at the API layer.
        setErrorState(classify(err));
      });
  }, [classify, today]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }

  async function handleEntrySubmit(input: LogEntryInput) {
    try {
      // entry_date is set here, explicitly, from the DEVICE's local
      // "today" — never left for the backend to default. The backend's own
      // default (POST /api/tracker-entries with no entry_date) uses
      // `new Date().toISOString().slice(0,10)`, i.e. UTC, which disagrees
      // with `todayDateString()`'s local-timezone value for part of every
      // day at any UTC offset that isn't a whole-hour multiple of the
      // screen's own local midnight — e.g. anything logged before ~05:30
      // local at UTC+5:30 would otherwise silently land on yesterday's row.
      // The client is the authority on "what day is it for this user" for a
      // habit tracker; the server's fallback exists for callers that have
      // no local-time concept at all (this screen isn't one of them).
      const { entry } = await createEntry({ entry_date: today, ...input });
      setEntries((prev) => {
        // Non-log kinds upsert server-side (see migration 006 in the
        // lifeos-backend memory notes) — replace the existing row for that
        // tracker+date if present, otherwise append. Log kind always
        // appends (multiple entries/day are expected for it).
        const withoutOld = prev.filter((e) => e.id !== entry.id);
        return [...withoutOld, entry];
      });
    } catch (err) {
      // Without this, a 402 (trial expired mid-session) or 401 (token
      // expired) on a WRITE was an unhandled rejection: the tap would just
      // do nothing, no paywall, no message — silently worse than the read
      // path this same classify() already covers in `load()`.
      setErrorState(classify(err));
    }
  }

  if (errorState?.kind === 'entitlement_required') {
    return <TrialPaywall status={errorState.status} trialEndsAt={errorState.trialEndsAt} />;
  }

  if (errorState?.kind === 'unauthenticated') {
    // supabase.auth.signOut() was already triggered inside classify(); the
    // root layout's Stack.Protected will swap to sign-in on the next
    // session-state tick. Nothing more to render here.
    return null;
  }

  if (errorState?.kind === 'other') {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{errorState.message}</Text>
      </View>
    );
  }

  if (!trackers) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const activeTrackers = trackers.filter((t) => !t.archived_at);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.date}>{new Date().toDateString()}</Text>
        </View>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Text style={styles.settingsLink}>Settings</Text>
        </Pressable>
      </View>

      <CheckinCard onEntitlementRequired={(err) => setErrorState(err)} />
      <ReviewCard onEntitlementRequired={(err) => setErrorState(err)} />

      {activeTrackers.length === 0 ? (
        <Text style={styles.empty}>No trackers yet. Trackers come from the plan you build during onboarding chat.</Text>
      ) : (
        activeTrackers.map((tracker) => (
          <TrackerCard
            key={tracker.id}
            tracker={tracker}
            todaysEntry={entries.find((e) => e.tracker_id === tracker.id && e.entry_date === today)}
            onSubmit={handleEntrySubmit}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f7' },
  content: { padding: 20, paddingTop: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 28, fontWeight: '700' },
  date: { fontSize: 14, color: '#888', marginBottom: 20 },
  settingsLink: { color: '#555', fontSize: 14, marginTop: 6 },
  empty: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 40 },
  error: { color: '#c0392b', textAlign: 'center' },
});
