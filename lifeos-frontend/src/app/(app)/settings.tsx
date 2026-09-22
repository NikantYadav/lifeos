import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { deleteAccount, exportAccountData, syncDeviceTimezone } from '@/lib/me';
import { ApiError } from '@/lib/api';
import { useApiErrorHandling } from '@/hooks/useApiErrorHandling';

/**
 * First in-app settings surface — currently just account info + sign-out.
 * Before this screen existed, signing out of a test account required
 * clearing app storage via `adb`, which blocked any multi-account testing
 * done from the running app itself. Registered as a plain (unprotected by
 * onboarding status) `Stack.Screen` in `(app)/_layout.tsx` so it's reachable
 * regardless of `onboardingStatus` — see that file's comment.
 *
 * Sign-out goes through `useSession().signOut()`, not the raw Supabase
 * client — see that hook for why (single call site, same wrapping
 * `useApiErrorHandling`'s 401 branch already used ad hoc). After it
 * resolves, `session` flips to `null` via `onAuthStateChange` and the root
 * layout's `Stack.Protected` guard on `!!session` swaps to `sign-in` on its
 * own; no `router.replace` call is needed or made here.
 */
export default function Settings() {
  const { session, signOut } = useSession();
  const { classify } = useApiErrorHandling();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const hasSyncedTimezone = useRef(false);

  // Settings is reachable regardless of onboarding status (see file doc
  // comment above — registered unprotected by onboarding status, and both
  // onboarding.tsx's chat and preview steps link here), so mounting this
  // screen is this app's one place a real user's timezone reliably gets
  // synced at least once, including for anyone who used the skip escape
  // hatch and never otherwise touches this flow. `syncDeviceTimezone`
  // itself is a no-op network call when the stored value already matches
  // (see lib/me.ts) and swallows its own failures, so nothing here needs a
  // loading/error state. The ref guards against firing twice from React's
  // dev-mode double-invoke of effects; this doesn't set any component
  // state, so the `react-hooks/set-state-in-effect` rule this codebase
  // otherwise has to work around elsewhere doesn't apply here.
  useEffect(() => {
    if (hasSyncedTimezone.current) return;
    hasSyncedTimezone.current = true;
    syncDeviceTimezone().catch(() => {});
  }, []);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
      // No navigation call here — Stack.Protected in the root layout does
      // it once `session` becomes null (see file doc comment above).
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleExportData() {
    // No confirm dialog needed — this is read-only against the user's own
    // data (see the backend route's own doc comment), unlike delete.
    setIsExporting(true);
    try {
      const result = await exportAccountData();
      const json = JSON.stringify(result, null, 2);

      // `Share.share` is core react-native, not an Expo module — chosen
      // because neither `expo-sharing` nor `expo-file-system` is an existing
      // dependency (checked `package.json` before deciding) and this app
      // has no other filesystem/download affordance to build on. Passing
      // the JSON directly as `message` (no `url`, which on Android is
      // file-URI-only and would need `expo-file-system` to produce) means
      // the share sheet's target app receives the raw text — works well for
      // "send to Notes/email/Drive/etc" but is NOT a byte-for-byte file
      // export.
      //
      // Known size ceiling, not fully characterized here: Android's share
      // intent extras cross a Binder IPC transaction (~1MB total across all
      // extras in that call), and many individual share targets (Gmail,
      // Messages, etc.) impose their own, often much lower, text-length
      // limits before that. At this app's current per-user data volume this
      // is very unlikely to matter, but it WILL eventually matter for a
      // long-lived heavy tracker_entries user — if exports need to scale
      // past that, the real fix is writing the JSON to a file via
      // `expo-file-system` and sharing that file's `url` via `expo-sharing`
      // (neither installed now, deliberately, per the "fewest new
      // dependencies" instruction for this pass) rather than trying to
      // stretch `Share.share`'s message path further.
      await Share.share({ message: json, title: 'LifeOS data export' });
    } catch (err) {
      const classified = classify(err);
      if (classified.kind === 'other') {
        Alert.alert('Could not export data', classified.message);
      }
      // 'unauthenticated' -> classify() already triggered sign-out, nothing
      // more to show. 'entitlement_required' can't actually happen here
      // (the route is entitlement-exempt) but is handled by the same
      // silent-fallthrough for completeness rather than an unreachable-code
      // assumption baked into the branch.
    } finally {
      setIsExporting(false);
    }
  }

  function handleDeleteAccount() {
    // Real confirmation UX lives here, not server-side — the backend's
    // `confirm: true` body field is just a guard against an accidental/
    // automated call, not a substitute for asking the user. No dialog
    // library is installed in this project (matches the rest of this
    // screen's dependency-free approach), so this uses React Native's
    // built-in `Alert.alert` with a destructive-styled confirm button.
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all your data — plans, trackers, entries, and AI history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteAccount();
              // The account no longer exists server-side, so sign out
              // locally the same way the explicit Sign Out button does —
              // there is no session left to keep, and Stack.Protected
              // routes to sign-in once `session` is null.
              await signOut();
            } catch (err) {
              setIsDeleting(false);
              const message =
                err instanceof ApiError && typeof err.body === 'object' && err.body && 'error' in err.body
                  ? String((err.body as { error: unknown }).error)
                  : 'Something went wrong. Please try again.';
              Alert.alert('Could not delete account', message);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.link}>Close</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{session?.user.email ?? 'Unknown'}</Text>
      </View>

      <Pressable
        style={[styles.button, isSigningOut && styles.buttonDisabled]}
        onPress={handleSignOut}
        disabled={isSigningOut}
      >
        {isSigningOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign out</Text>}
      </Pressable>

      <Pressable
        style={[styles.exportButton, isExporting && styles.exportButtonDisabled]}
        onPress={handleExportData}
        disabled={isExporting || isSigningOut || isDeleting}
      >
        {isExporting ? (
          <ActivityIndicator color="#333" />
        ) : (
          <Text style={styles.exportButtonText}>Export my data</Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.deleteButton, isDeleting && styles.buttonDisabled]}
        onPress={handleDeleteAccount}
        disabled={isDeleting || isSigningOut}
      >
        {isDeleting ? (
          <ActivityIndicator color="#c0392b" />
        ) : (
          <Text style={styles.deleteButtonText}>Delete account</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 24, fontWeight: '700' },
  link: { color: '#555', fontSize: 15 },
  section: { marginBottom: 32 },
  label: { fontSize: 13, color: '#888', marginBottom: 4 },
  value: { fontSize: 16, color: '#111' },
  button: {
    backgroundColor: '#c0392b',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#e0a29b' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  exportButton: {
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: 'transparent',
  },
  exportButtonDisabled: { borderColor: '#e5e5e5' },
  exportButtonText: { color: '#333', fontSize: 16, fontWeight: '600' },
  deleteButton: {
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#c0392b',
    backgroundColor: 'transparent',
  },
  deleteButtonText: { color: '#c0392b', fontSize: 16, fontWeight: '600' },
});
