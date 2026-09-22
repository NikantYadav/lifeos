import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';

/**
 * Rendered whenever a screen's data call comes back 402 (see
 * `useApiErrorHandling`'s `entitlement_required` case) — trial expired or no
 * active subscription. No billing integration exists yet (ROADMAP.md Phase
 * 5/RevenueCat — `subscriptions.provider`/`provider_subscription_id` columns
 * are ready but no webhook handler), so this only explains the state and
 * offers sign-out; the "Upgrade" button gets wired to Play Billing / RevenueCat
 * once that lands.
 */
export function TrialPaywall({ status, trialEndsAt }: { status: string; trialEndsAt: string | null }) {
  const isExpiredTrial = status === 'trialing' || status === 'expired';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isExpiredTrial ? 'Your trial has ended' : 'Subscription inactive'}</Text>
      <Text style={styles.body}>
        {trialEndsAt
          ? `Your free trial ended ${new Date(trialEndsAt).toDateString()}. Subscribe to keep using LifeOS.`
          : 'Subscribe to keep using LifeOS.'}
      </Text>

      {/* Billing not wired up yet — see ROADMAP.md Phase 5. */}
      <Pressable style={[styles.button, styles.buttonDisabled]} disabled>
        <Text style={styles.buttonText}>Upgrade (coming soon)</Text>
      </Pressable>

      <Pressable onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOut}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff', gap: 8 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, color: '#555', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  button: { backgroundColor: '#111', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  signOut: { textAlign: 'center', marginTop: 20, color: '#555' },
});
