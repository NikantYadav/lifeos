import { z } from 'zod';

/**
 * RevenueCat webhook event -> `subscriptions` row mapping, kept as a pure
 * function separate from the HTTP/auth shell (`app/api/webhooks/revenuecat/
 * route.ts`) specifically so it can be exercised directly (unit-style, or
 * via a real DB round trip) without going through HTTP/signature plumbing.
 *
 * Schema note, DELIBERATE INVERSION of this codebase's usual convention:
 * every other Zod schema in this repo is `.strict()` (reject unknown keys)
 * because its input is either this app's own client or an AI model whose
 * output is fully specified by our own prompt. This schema is neither — the
 * payload is a third party's (RevenueCat's) wire format, which adds fields
 * over time (see the documented event-type list: TRANSFER, PRODUCT_CHANGE,
 * SUBSCRIPTION_PAUSED, TEMPORARY_ENTITLEMENT_GRANT, etc., all of which carry
 * fields this app doesn't care about). `.strict()` here would 400 (or, since
 * this route isn't behind `withApi`, 500) on a legitimate delivery the
 * moment RevenueCat ships a new field. Left non-strict on purpose — unknown
 * keys are ignored, not rejected.
 */
export const revenueCatEventSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  event_timestamp_ms: z.number().optional(),
  app_user_id: z.string(),
  original_app_user_id: z.string().optional(),
  product_id: z.string().optional(),
  original_transaction_id: z.string().optional(),
  transaction_id: z.string().optional(),
  purchased_at_ms: z.number().nullable().optional(),
  expiration_at_ms: z.number().nullable().optional(),
  environment: z.string().optional(),
  store: z.string().optional(),
  cancel_reason: z.string().optional(),
  expiration_reason: z.string().optional(),
});

export const revenueCatWebhookPayloadSchema = z.object({
  api_version: z.string().optional(),
  event: revenueCatEventSchema,
});

export type RevenueCatEvent = z.infer<typeof revenueCatEventSchema>;

/**
 * Event types this route actually acts on. Everything else (TEST, TRANSFER,
 * PRODUCT_CHANGE, SUBSCRIPTION_PAUSED, NON_RENEWING_PURCHASE, and every
 * other type in RevenueCat's documented enum) is acknowledged with 200 and
 * ignored — see the route handler for why 2xx-and-ignore, not 4xx, is the
 * correct response for an unhandled-but-valid type (RevenueCat retries
 * non-2xx responses; a 4xx on a type this route simply doesn't map yet would
 * retry forever without ever succeeding).
 */
const HANDLED_TYPES = [
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
] as const;

export type HandledEventType = (typeof HANDLED_TYPES)[number];

export function isHandledEventType(type: string): type is HandledEventType {
  return (HANDLED_TYPES as readonly string[]).includes(type);
}

/**
 * RevenueCat's convention when a client purchase happens before any
 * `app_user_id` was explicitly set (or after a `logOut()`): the SDK
 * generates `$RCAnonymousID:<uuid>` and that becomes `app_user_id`. Per this
 * app's integration design (documented in the route file and in the report
 * that shipped this feature), the RN client is required to call
 * `Purchases.logIn(supabaseUserId)` at/after sign-in so `app_user_id` is
 * always this app's own `auth.users.id` (a real UUID) by the time any
 * purchase happens — but the client-side purchase flow doesn't exist yet
 * (ROADMAP), so this defensive check guards against a real RevenueCat
 * account eventually sending an anonymous id before that flow is built or
 * if it's ever skipped (e.g. a restore-purchases edge case).
 */
export function isAnonymousAppUserId(appUserId: string): boolean {
  return appUserId.startsWith('$RCAnonymousID:');
}

export interface SubscriptionRow {
  user_id: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  provider: 'google_play' | 'revenuecat' | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface SubscriptionUpdate {
  status?: SubscriptionRow['status'];
  provider?: SubscriptionRow['provider'];
  provider_customer_id?: string;
  provider_subscription_id?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
}

/**
 * Pure mapping: event + the row's CURRENT stored state -> the partial update
 * to apply. Taking the current row (not just the event) is what makes the
 * monotonic-ordering guard possible (see below) — this is intentionally not
 * a stateless "event -> update" function, because idempotent-per-event is
 * not the same guarantee as correct-under-redelivery-and-reordering.
 *
 * Idempotency: every branch sets ABSOLUTE fields (status, a specific
 * timestamp, a specific boolean) rather than incrementing/toggling anything,
 * so redelivering the exact same event twice produces the exact same row
 * both times — safe by construction, no dedup table needed for that case.
 *
 * Out-of-order delivery guard (the gap absolute-writes alone do NOT close,
 * flagged explicitly rather than silently assumed away): RevenueCat does not
 * guarantee delivery order, so an EXPIRATION for an old period could in
 * principle arrive after a RENEWAL for a newer one already moved
 * `current_period_end` forward. Guarded here with `event_timestamp_ms`
 * (when present) for the two transitions where acting on a stale event would
 * actually harm the user (EXPIRATION -> 'expired', BILLING_ISSUE ->
 * 'past_due' both downgrade access) — a stale downgrade is dropped
 * (`applied: false`) rather than applied. This is a best-effort ordering
 * check using a field already on the payload, NOT full event-id dedup (that
 * would need a persisted `webhook_events` table keyed on `event.id`, which
 * this build deliberately does not add — see the route file's doc comment).
 */
export function mapRevenueCatEventToUpdate(
  event: RevenueCatEvent,
  current: Pick<SubscriptionRow, 'current_period_end'> & { last_event_timestamp_ms?: number | null }
): { update: SubscriptionUpdate; applied: true } | { update: null; applied: false; reason: string } {
  const periodEndIso =
    event.expiration_at_ms === null || event.expiration_at_ms === undefined
      ? null // null = non-expiring (lifetime/non-renewing) product, per RevenueCat docs — NOT "already expired".
      : new Date(event.expiration_at_ms).toISOString();

  const providerSubscriptionId = event.original_transaction_id ?? event.transaction_id;

  const base: SubscriptionUpdate = {
    provider: 'revenuecat',
    provider_customer_id: event.app_user_id,
    ...(providerSubscriptionId ? { provider_subscription_id: providerSubscriptionId } : {}),
  };

  switch (event.type as HandledEventType) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
      // Always active + always (re)writes current_period_end. Per
      // has_active_entitlement()'s real SQL (read directly from the live DB
      // before writing this): 'active' only counts as entitled while
      // current_period_end is null or in the future — leaving a stale/absent
      // period_end here would silently lock out a paying user, so this is
      // never a partial update on this field.
      return {
        applied: true,
        update: {
          ...base,
          status: 'active',
          current_period_end: periodEndIso,
          cancel_at_period_end: false, // a fresh purchase/renewal clears any prior cancellation intent
        },
      };

    case 'CANCELLATION':
      // Still entitled until the period actually ends — this only flips the
      // auto-renew intent flag, never the status. Matches the task's
      // explicit instruction: don't immediately downgrade.
      return { applied: true, update: { ...base, cancel_at_period_end: true } };

    case 'UNCANCELLATION':
      // Natural pair to CANCELLATION: user resubscribed/undid the
      // cancellation before the period lapsed. Not explicitly required by
      // the task, added because leaving it unhandled would mean an
      // uncancel event 200s-and-no-ops forever with cancel_at_period_end
      // stuck true, which is a worse outcome than the few extra lines here.
      return { applied: true, update: { ...base, cancel_at_period_end: false } };

    case 'EXPIRATION': {
      // Out-of-order guard: don't downgrade to 'expired' on an event older
      // than one we've already used to move current_period_end forward.
      if (
        typeof event.event_timestamp_ms === 'number' &&
        typeof current.last_event_timestamp_ms === 'number' &&
        event.event_timestamp_ms < current.last_event_timestamp_ms
      ) {
        return { applied: false, update: null, reason: 'stale_event_ignored' };
      }
      return {
        applied: true,
        update: { ...base, status: 'expired', cancel_at_period_end: false },
      };
    }

    case 'BILLING_ISSUE': {
      if (
        typeof event.event_timestamp_ms === 'number' &&
        typeof current.last_event_timestamp_ms === 'number' &&
        event.event_timestamp_ms < current.last_event_timestamp_ms
      ) {
        return { applied: false, update: null, reason: 'stale_event_ignored' };
      }
      // has_active_entitlement() treats 'past_due' as still-entitled as long
      // as current_period_end hasn't passed (grace period) — status alone,
      // not a downgrade of current_period_end, which this event doesn't carry
      // a new value for anyway (billing issue == the SAME period failed to
      // renew, not a new period).
      return { applied: true, update: { ...base, status: 'past_due' } };
    }

    default:
      return { applied: false, update: null, reason: 'unhandled_event_type' };
  }
}
