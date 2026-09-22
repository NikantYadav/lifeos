import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from '@/hooks/useSession';

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </SessionProvider>
  );
}

/**
 * `(app)` holds every screen that requires a signed-in, entitled user;
 * `sign-in` is always reachable. See
 * https://docs.expo.dev/router/advanced/authentication/ — this is the
 * current (SDK 57) recommended pattern, `Stack.Protected` over manual
 * redirect effects.
 */
function RootNavigator() {
  const { session, isLoading } = useSession();

  // Render nothing until we know the auth state — avoids a flash of the
  // sign-in screen for an already-signed-in user on cold start.
  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
