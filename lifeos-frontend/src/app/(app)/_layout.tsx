import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/hooks/useSession';

/**
 * Routes a signed-in user into `onboarding` vs the app shell (`index` and
 * whatever else joins it) based on `onboardingStatus` from `useSession` —
 * the ROADMAP Phase 2 flow (chat -> propose -> preview -> commit) needs to
 * run before a new user sees an empty Today screen with nothing to log.
 *
 * `completed` OR `skipped` both count as "past onboarding" — gating on
 * `completed` alone would send a user who deliberately skipped back into the
 * chat on every single app launch, defeating the whole point of the escape
 * hatch ROADMAP.md requires.
 *
 * The status lives in `useSession` (fetched via `GET /api/me`), not fetched
 * locally in this layout, specifically so `onboarding.tsx` can call
 * `setOnboardingStatus(...)` the instant it commits/skips and have this
 * guard flip in the same render pass — a value fetched once here and never
 * updated would leave `router.replace('/')` targeting a route this guard
 * had removed from the navigator (stale-gate deadlock). `GET /api/me` was
 * chosen over `GET /api/onboarding` for the fetch itself (in useSession)
 * because the latter has a side effect — `getOrCreateSession` inserts an
 * empty session row when none exists — which shouldn't run on every launch
 * for an already-`completed` user.
 *
 * Uses `Stack.Protected` the same way the root layout gates on session
 * (see AGENTS.md's routing rule + `_layout.tsx` at the app root), not a
 * manual `router.replace` — the guard itself is what navigates.
 */
export default function AppLayout() {
  const { onboardingStatus } = useSession();

  if (onboardingStatus === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const needsOnboarding = onboardingStatus === 'not_started' || onboardingStatus === 'in_progress';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={!needsOnboarding}>
        <Stack.Screen name="index" />
      </Stack.Protected>

      {/* Registered outside both onboarding-status guards, deliberately —
          sign-out has to be reachable regardless of onboarding status (a
          freshly-created account sitting at `not_started`/`in_progress` has
          no other way back to `sign-in` short of `adb`), and this route
          reads nothing from `onboardingStatus` itself. */}
      <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
