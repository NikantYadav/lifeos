import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from './supabaseAdmin';

/**
 * The frontend authenticates directly against Supabase Auth (sign-up/sign-in,
 * token refresh) using the publishable/anon key, which is safe to embed on
 * device — Supabase Auth's own endpoints are designed for that. It never
 * talks to a Postgres table directly, though: every data operation goes
 * through this backend, with the resulting user access token sent as a
 * normal Bearer token.
 *
 * This backend then re-verifies that token itself (rather than trusting a
 * decoded-but-unverified JWT payload) via Supabase Auth's own /auth/v1/user
 * lookup, so a forged or tampered token is rejected before any query runs.
 */
export interface AuthedUser {
  id: string;
  email: string | null;
}

export async function requireUser(req: NextRequest): Promise<AuthedUser | NextResponse> {
  const header = req.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return NextResponse.json({ error: 'missing_bearer_token' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  return { id: data.user.id, email: data.user.email ?? null };
}

/** Type guard for the common `const user = await requireUser(req); if (isErrorResponse(user)) return user;` pattern. */
export function isErrorResponse(value: AuthedUser | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
