import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getMe, type OnboardingStatus } from '@/lib/me';

interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
  onboardingStatus: OnboardingStatus | 'unknown' | null;
  setOnboardingStatus: (status: OnboardingStatus) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  isLoading: true,
  onboardingStatus: null,
  setOnboardingStatus: () => {},
  signOut: () => Promise.resolve(),
});

/**
 * Single source of truth for auth state, read once here and consumed by
 * `Stack.Protected` guards in the root layout — see AGENTS.md's "Rules" and
 * https://docs.expo.dev/router/advanced/authentication/ for the pattern.
 * Session persistence/refresh itself is handled by the Supabase client's own
 * AsyncStorage-backed config (see lib/supabase.ts); this just surfaces the
 * current value as React state.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // `null` = not yet fetched (the (app) layout shows a spinner while this is
  // null); `'unknown'` = fetch failed (network/401/402 — let the guarded
  // screen itself render the right paywall/sign-out state instead of
  // getting stuck behind this gate). Lives here, not as local state in the
  // (app) layout, specifically so `onboarding.tsx` can call
  // `setOnboardingStatus('completed' | 'skipped')` on success and have the
  // `Stack.Protected` guard flip immediately — a local fetch-once value in
  // the layout would go stale the instant the server-side flag changes,
  // leaving `router.replace('/')` targeting a route the guard had removed
  // from the navigator.
  const [onboardingStatus, setOnboardingStatusState] = useState<OnboardingStatus | 'unknown' | null>(null);
  // Tracks which user id `onboardingStatus` was last computed for, so a
  // sign-out OR a sign-in-as-a-different-user can reset the status during
  // render (React's documented "adjust state during render when a prop
  // changes" pattern) instead of a synchronous `setState` inside an effect
  // body, which `react-hooks/set-state-in-effect` flags as a
  // cascading-render risk — same rule, same fix shape as the Today screen's
  // `NumericInput`/`TimedInput` (see lifeos-public-app-direction memory's
  // build-status notes). Keyed on `session.user.id`, NOT the `Session`
  // object itself: Supabase's `onAuthStateChange` emits a fresh `Session`
  // object on every `TOKEN_REFRESHED` (roughly hourly) even for the same
  // user, and keying on object identity would reset (and re-fetch)
  // `onboardingStatus` on every refresh, flashing a spinner in `(app)` for
  // no reason — the user id is stable across a token refresh and changes
  // only on an actual user switch.
  const userId = session?.user.id ?? null;
  const [statusFor, setStatusFor] = useState<string | null>(null);
  if (userId !== statusFor) {
    setStatusFor(userId);
    setOnboardingStatusState(null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    getMe()
      .then(({ profile }) => setOnboardingStatusState(profile.onboarding_status))
      .catch(() => setOnboardingStatusState('unknown'));
  }, [userId]);

  function setOnboardingStatus(status: OnboardingStatus) {
    setOnboardingStatusState(status);
  }

  // The one sanctioned way to sign out from a component — wraps the raw
  // Supabase client the same way `useApiErrorHandling`'s 401 branch already
  // does, so there's a single call site for it instead of components
  // reaching into `lib/supabase` directly. `onAuthStateChange` (subscribed
  // above) picks up the resulting `null` session and flips `session` state;
  // the root layout's `Stack.Protected` guard on `!!session` then swaps the
  // navigator to `sign-in` on its own — no manual `router.replace` needed,
  // same pattern the doc comments on `_layout.tsx`/`onboarding.tsx` already
  // establish for this codebase.
  function signOut() {
    return supabase.auth.signOut().then(() => undefined);
  }

  return (
    <SessionContext.Provider value={{ session, isLoading, onboardingStatus, setOnboardingStatus, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
