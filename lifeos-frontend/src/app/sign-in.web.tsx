import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';

/**
 * Web counterpart to sign-in.tsx (native). Metro resolves this file
 * automatically for web builds via the .web.tsx extension, since
 * @react-native-google-signin/google-signin has no web target and crashes
 * on import there. Auth goes through Supabase's own OAuth redirect flow
 * instead: signInWithOAuth sends the browser to Google, Google redirects
 * back to this origin with the session in the URL fragment, and
 * lib/supabase.ts's `detectSessionInUrl: true` (web only) picks it up —
 * useSession's onAuthStateChange listener then does the rest, same as native.
 */
export default function SignInWeb() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setIsSubmitting(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (authError) {
        setError(authError.message);
        setIsSubmitting(false);
      }
      // On success the browser navigates away to Google, so there is
      // nothing more to do here — no navigation needed on the way back
      // either, since useSession's listener + Stack.Protected handle it.
    } catch (err) {
      setError(String(err));
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LifeOS</Text>
      <Text style={styles.subtitle}>Sign in to continue — 7 days free</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleGoogleSignIn} disabled={isSubmitting}>
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Continue with Google</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginTop: 8, marginBottom: 32 },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#c0392b', marginBottom: 12, textAlign: 'center' },
});
