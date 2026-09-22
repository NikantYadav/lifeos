import { supabase } from './supabase';

/**
 * Every data operation in this app goes through lifeos-backend, never
 * directly to Supabase tables (see supabase.ts). This wraps `fetch` so every
 * call automatically carries the current session's access token — the
 * backend re-verifies it server-side on every request (see
 * lifeos-backend/src/lib/auth.ts), so an expired or missing session here
 * surfaces as a normal 401 the caller can handle (e.g. redirect to sign-in),
 * not a silent failure.
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL must be set — see .env.example.');
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown
  ) {
    super(`API error ${status}`);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }

  return body as T;
}
