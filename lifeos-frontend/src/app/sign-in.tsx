import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from '@/lib/supabase';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

if (!googleWebClientId) {
  throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must be set — see .env.example.');
}

GoogleSignin.configure({ webClientId: googleWebClientId });

/**
 * Google-only auth screen. Sign-up and sign-in are the same action — Supabase
 * creates the auth.users row on first Google sign-in — which auto-provisions
 * a profile + 7-day trial row via the `on_auth_user_created` DB trigger
 * (migration 001), so there is nothing else to call here after success.
 */
export default function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setIsSubmitting(true);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        // User cancelled the flow — nothing to report.
        return;
      }

      const { idToken } = response.data;
      if (!idToken) {
        setError('Google did not return an ID token. Please try again.');
        return;
      }

      const { error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (authError) setError(authError.message);
      // On success, useSession's onAuthStateChange listener picks up the new
      // session and Stack.Protected in the root layout swaps to (app)
      // automatically — no manual navigation call needed here.
    } catch (err) {
      if (isErrorWithCode(err) && err.code === statusCodes.IN_PROGRESS) {
        return;
      }
      // TEMP: surfacing the raw error for debugging — revert to a generic
      // message once the Google sign-in flow is confirmed working.
      console.log('Google sign-in error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      const message = isErrorWithCode(err) ? `[${err.code}] ${err.message}` : String(err);
      setError(message);
    } finally {
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
