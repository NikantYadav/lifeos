import { useCallback } from 'react';
import { ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase';

/**
 * The two `ApiError` statuses every authenticated screen must handle
 * specially, not just display as generic text — both are live paths as of
 * the trackers/entries + plans/tasks/habits/schedule_blocks backend work
 * (see lifeos-public-app-direction memory's build-status sections):
 *
 *  - 401: the backend rejected the Bearer token (expired/invalid/missing).
 *    Sign out through the Supabase client so `useSession`'s
 *    `onAuthStateChange` fires and `Stack.Protected` in the root layout
 *    bounces to `sign-in` automatically — no manual navigation call needed.
 *  - 402: `requireEntitlement` denied the request (trial expired, no active
 *    subscription). This is NOT an error to sign out on — the user is still
 *    authenticated, they just need to see a paywall/trial-ended state. The
 *    response body carries `{ status, trialEndsAt }` (see
 *    lib/entitlement.ts's `requireEntitlement`) for rendering it.
 *
 * Returns a classifier a screen calls from its own catch block, so it
 * decides what to render for the "something else went wrong" case itself,
 * but never has to re-implement the 401/402 branches.
 */
export type ApiErrorKind =
  | { kind: 'unauthenticated' } // handled here (signs out); screen usually shows nothing further
  | { kind: 'entitlement_required'; status: string; trialEndsAt: string | null }
  | { kind: 'other'; message: string };

/**
 * The raw `{error: string}` code a route returned, when there is one —
 * for screens that need to branch on a specific onboarding code
 * (`transcript_turn_limit_reached`, `ai_disabled`, `ai_response_truncated`,
 * `ai_error`, `transcript_empty`, `no_active_session`, `already_applied`,
 * `ai_produced_invalid_proposal`, ...) rather than the generic `classify()`
 * bucket, which collapses every non-401/402 status to one `'other'` message.
 * Returns `null` for a non-`ApiError` or a body without an `error` string —
 * callers fall back to `classify()`'s generic text in that case.
 */
export function apiErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { error?: string } | null;
  return typeof body?.error === 'string' ? body.error : null;
}

export function useApiErrorHandling() {
  const classify = useCallback((err: unknown): ApiErrorKind => {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        // Fire and forget — the screen doesn't need to await this, the
        // session listener handles the redirect.
        void supabase.auth.signOut();
        return { kind: 'unauthenticated' };
      }
      if (err.status === 402) {
        const body = err.body as { status?: string; trialEndsAt?: string | null } | null;
        return { kind: 'entitlement_required', status: body?.status ?? 'unknown', trialEndsAt: body?.trialEndsAt ?? null };
      }
      return { kind: 'other', message: `Request failed (${err.status})` };
    }
    return { kind: 'other', message: err instanceof Error ? err.message : String(err) };
  }, []);

  return { classify };
}
