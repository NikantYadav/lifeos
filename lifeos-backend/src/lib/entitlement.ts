import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from './supabaseAdmin';

/**
 * Trial/subscription gate. `subscriptions` rows are service-role-writable
 * only (see migration 001) — a client can read its own row (to render a
 * trial countdown / paywall) but can never grant itself access. This
 * function is the single place that turns that row into an allow/deny
 * decision, backed by the `has_active_entitlement` SQL function so the
 * "trialing and not expired, or active/past_due and not past period end"
 * logic lives in exactly one place (reused by RLS-adjacent policies and by
 * this backend check alike).
 */
export interface EntitlementStatus {
  allowed: boolean;
  status: string;
  trialEndsAt: string | null;
}

export async function checkEntitlement(userId: string): Promise<EntitlementStatus> {
  const admin = supabaseAdmin();

  const [{ data: sub, error: subError }, { data: allowed, error: fnError }] = await Promise.all([
    admin
      .from('subscriptions')
      .select('status, trial_ends_at')
      .eq('user_id', userId)
      .single(),
    admin.rpc('has_active_entitlement', { p_user_id: userId }),
  ]);

  if (subError || fnError || !sub) {
    // Fail closed: an unreadable entitlement row is treated as "no access",
    // never as "let them in" — the opposite failure mode would let a DB
    // hiccup grant free access.
    return { allowed: false, status: 'unknown', trialEndsAt: null };
  }

  return { allowed: Boolean(allowed), status: sub.status, trialEndsAt: sub.trial_ends_at };
}

/** Route-handler guard: call after `requireUser`, before any paid-feature work. */
export async function requireEntitlement(userId: string): Promise<NextResponse | null> {
  const entitlement = await checkEntitlement(userId);
  if (entitlement.allowed) return null;

  return NextResponse.json(
    {
      error: 'trial_expired',
      status: entitlement.status,
      trialEndsAt: entitlement.trialEndsAt,
    },
    { status: 402 } // Payment Required
  );
}
