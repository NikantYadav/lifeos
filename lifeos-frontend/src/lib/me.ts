import { apiFetch } from './api';

/**
 * Mirrors `GET /api/me`'s response shape exactly (lifeos-backend's reference
 * route, `entitlement: false` — the one route that still works past trial
 * expiry). Only the fields this client actually reads are typed; `profile`
 * has more columns server-side than are listed here.
 */
export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

export interface Me {
  user: { id: string; email: string | null };
  profile: { onboarding_status: OnboardingStatus; timezone: string; [key: string]: unknown };
  entitlement: { status: string; trialEndsAt: string | null; [key: string]: unknown };
}

export function getMe(): Promise<Me> {
  return apiFetch('/api/me');
}

/**
 * Mirrors `PATCH /api/me` — `entitlement: false` server-side (same opt-out
 * as GET), validated on the backend by actually constructing an
 * `Intl.DateTimeFormat` with the given zone (not a regex), so any IANA
 * identifier ICU on the server recognizes is accepted.
 */
export function updateTimezone(timezone: string): Promise<{ profile: Me['profile'] }> {
  return apiFetch('/api/me', {
    method: 'PATCH',
    body: JSON.stringify({ timezone }),
  });
}

/**
 * The only place in this app that reads the device's real IANA timezone
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone` — standard, available
 * in Hermes on both Android and iOS, no new dependency) and syncs it to
 * `profiles.timezone`. Without this, every profile stays stuck at the
 * column's DB default (`'UTC'`) forever, since nothing else ever calls
 * `PATCH /api/me` (see that route's own doc comment on the backend).
 *
 * Fetches the current profile via `getMe()` first and only PATCHes on an
 * actual mismatch — avoids a pointless network call on every mount/sign-in
 * once a user's timezone is already correct (the common case after the
 * first sync). Deliberately swallows every failure (offline, a device
 * `Intl` value the server's `isValidTimeZone` rejects, etc.) — this is a
 * best-effort background sync, never something that should block or surface
 * an error in whatever screen triggers it.
 */
export async function syncDeviceTimezone(): Promise<void> {
  try {
    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!deviceTimezone) return;

    const { profile } = await getMe();
    if (profile.timezone === deviceTimezone) return;

    await updateTimezone(deviceTimezone);
  } catch {
    // Best-effort only — see doc comment above. Nothing to do here; the
    // profile simply stays at whatever timezone it already had.
  }
}

/**
 * Mirrors `POST /api/account/delete` — `entitlement: false` server-side
 * (same opt-out as `/api/me`), so this works even past trial expiry.
 * `confirm: true` is required by the backend's `.strict()` schema; the real
 * confirmation UX is the `Alert.alert` this is called from in
 * `settings.tsx`, not a second confirmation here.
 */
export function deleteAccount(): Promise<{ deleted: true }> {
  return apiFetch('/api/account/delete', {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });
}

/**
 * Mirrors `GET /api/account/export` — `entitlement: false` server-side, same
 * opt-out as `/api/me` and `account/delete` (an expired-trial user must
 * still be able to get a copy of their own data). Untyped `data` payload
 * deliberately: the response is a full per-table dump whose shape mirrors
 * whatever each table's live columns are, which this client has no reason
 * to duplicate as a second source of truth just to hand the object to
 * `Share.share`.
 */
export interface AccountExport {
  exported_at: string;
  user_id: string;
  data: Record<string, unknown[]>;
}

export function exportAccountData(): Promise<AccountExport> {
  return apiFetch('/api/account/export');
}
