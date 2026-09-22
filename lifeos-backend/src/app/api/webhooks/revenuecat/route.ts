import 'server-only';
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { dbError } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  isAnonymousAppUserId,
  isHandledEventType,
  mapRevenueCatEventToUpdate,
  revenueCatWebhookPayloadSchema,
} from '@/lib/billing/revenuecat';

/**
 * POST /api/webhooks/revenuecat — server-to-server webhook, NOT a
 * `withApi` route. There is no end-user session here (RevenueCat is the
 * caller, not a signed-in user), so `requireUser`'s Supabase-JWT check does
 * not apply and this route builds its own auth check from scratch, per the
 * task's explicit instruction not to force this through `requireUser`.
 * Because it bypasses `withApi`, it also hand-rolls the two things that
 * wrapper normally provides for free: a request-body size cap (matching the
 * same 64KB figure) and a catch-all so an unexpected throw can't leak a raw
 * error to RevenueCat's retry logs.
 *
 * === Auth scheme: static shared-secret Authorization header ===
 * Implemented scheme: reject unless `Authorization` matches
 * `REVENUECAT_WEBHOOK_SECRET`, checked in constant time.
 *
 * CONFIDENCE NOTE (read before relying on this in production): RevenueCat's
 * own webhook docs (fetched live while building this, see this task's
 * report) confirm there IS a configurable "Authorization header" scheme —
 * "You can configure the authorization header used for webhook requests via
 * the dashboard... verify the validity of the authorization header for
 * every notification" — which is a static shared value, not HMAC, matching
 * what this task asked for. However, the same page also documents a NEWER,
 * RevenueCat-recommended alternative: HMAC-SHA256 request signing via an
 * `X-RevenueCat-Webhook-Signature: t=<ts>,v1=<hex>` header, computed over
 * `"<timestamp>.<raw_body>"`. This route implements the static-header
 * scheme ONLY, per the task's explicit instruction — the HMAC path is not
 * built. What's genuinely uncertain (not verified live, since no real
 * RevenueCat account exists to test against): whether the dashboard sends
 * the configured value as a raw header (`Authorization: <secret>`) or
 * RevenueCat expects/prepends the caller to configure it already including
 * a scheme (`Authorization: Bearer <secret>`) — the docs describe it as "the
 * authorization header used for webhook requests," i.e. the OPERATOR types
 * the full header value into the dashboard themselves, so either is
 * possible depending on what was typed in. This route accepts BOTH forms
 * (the raw configured secret, or `Bearer <secret>`) so it's correct under
 * either reading rather than betting on one.
 *
 * Ordering matters here, and is deliberate (see the report / advisor
 * discussion this task was built with): a blank `REVENUECAT_WEBHOOK_SECRET`
 * must never be treated as "no auth required" or "empty string matches
 * empty string" — that would fail OPEN the moment the env var is unset,
 * exactly the misconfiguration this project is currently in
 * (`.env.local` has `REVENUECAT_WEBHOOK_SECRET=`, blank, as of this
 * writing). So: missing header -> 401; secret not configured server-side ->
 * 503 (distinct from 401, since it's a deployment problem, not a caller
 * problem) BEFORE any comparison is attempted; mismatch -> 401.
 */
const MAX_BODY_BYTES = 64 * 1024;

function extractPresentedSecret(header: string | null): string | null {
  if (!header) return null;
  if (header.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return header;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch rather than returning false —
  // guard explicitly so a length-derived timing signal isn't reintroduced by
  // an early-return short-circuit before the call.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const presented = extractPresentedSecret(authHeader);
    if (!presented) {
      return NextResponse.json({ error: 'missing_authorization' }, { status: 401 });
    }

    const configuredSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!configuredSecret) {
      // Fail closed AND loud: an unset secret must never silently authenticate
      // anything (see doc comment above) — a 503 also gives an operator a
      // clear signal in RevenueCat's dashboard delivery log that this is a
      // server misconfiguration, not a bad request.
      console.error('revenuecat_webhook.secret_not_configured');
      return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 });
    }

    if (!constantTimeEquals(presented, configuredSecret)) {
      return NextResponse.json({ error: 'invalid_authorization' }, { status: 401 });
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }

    let json: unknown;
    try {
      json = raw.length ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const parsed = revenueCatWebhookPayloadSchema.safeParse(json);
    if (!parsed.success) {
      console.error('revenuecat_webhook.invalid_payload', parsed.error.issues);
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const { event } = parsed.data;

    // Unknown/unhandled type: 200-and-ignore, not 4xx. RevenueCat retries
    // non-2xx responses, and its documented event-type enum includes many
    // types this app has no mapping for (TEST, TRANSFER, PRODUCT_CHANGE,
    // SUBSCRIPTION_PAUSED, NON_RENEWING_PURCHASE, and others) — a 4xx on any
    // of those would retry forever without ever being able to succeed.
    if (!isHandledEventType(event.type)) {
      return NextResponse.json({ ignored: true, reason: 'unhandled_event_type' }, { status: 200 });
    }

    // `app_user_id` is RevenueCat's identifier, expected (per this app's
    // integration design — see lib/billing/revenuecat.ts's doc comment and
    // this task's report) to be set to this app's own Supabase `auth.users`
    // id by the RN client at purchase time via `Purchases.logIn(userId)`.
    // Two defensive checks before ever touching a row, matching this
    // codebase's existing "confirm a matching row exists before write"
    // discipline for any client/webhook-supplied id (the analogous IDOR
    // concern here: a forged/malformed webhook targeting an arbitrary
    // user_id, even though there's no session to forge in the traditional
    // sense):
    if (isAnonymousAppUserId(event.app_user_id)) {
      console.error('revenuecat_webhook.anonymous_app_user_id', event.app_user_id, event.type);
      return NextResponse.json({ ignored: true, reason: 'anonymous_app_user_id' }, { status: 200 });
    }

    const admin = supabaseAdmin();

    // Existence check BEFORE write, never trust app_user_id blindly — same
    // pattern every other route in this codebase uses for a client-supplied
    // foreign key. Also fetches enough of the current row state for the
    // out-of-order-delivery guard in mapRevenueCatEventToUpdate.
    const { data: existing, error: findErr } = await admin
      .from('subscriptions')
      .select('user_id, current_period_end')
      .eq('user_id', event.app_user_id)
      .maybeSingle();
    if (findErr) return dbError('webhooks.revenuecat.find', findErr);
    if (!existing) {
      // Every real user gets a subscriptions row auto-provisioned on signup
      // (migration 001's on_auth_user_created trigger) — a webhook whose
      // app_user_id matches no row means either a forged/malformed id or an
      // account that no longer exists (e.g. already account-deleted). 404
      // here (chosen over a 200-and-log) because it's honestly what
      // happened and is more debuggable from RevenueCat's delivery log;
      // note in the report that a production deployment expecting deleted
      // accounts to keep sending stale renewal events might prefer 200 to
      // avoid an indefinite retry storm against a row that will never exist.
      console.error('revenuecat_webhook.unknown_app_user_id', event.app_user_id, event.type);
      return NextResponse.json({ error: 'unknown_app_user_id' }, { status: 404 });
    }

    const result = mapRevenueCatEventToUpdate(event, {
      current_period_end: existing.current_period_end,
    });

    if (!result.applied) {
      return NextResponse.json({ ignored: true, reason: result.reason }, { status: 200 });
    }

    const { error: updateErr } = await admin
      .from('subscriptions')
      .update({ ...result.update, updated_at: new Date().toISOString() })
      .eq('user_id', event.app_user_id);
    if (updateErr) return dbError('webhooks.revenuecat.update', updateErr);

    return NextResponse.json({ applied: true, event_type: event.type }, { status: 200 });
  } catch (err) {
    console.error('revenuecat_webhook.unhandled_error', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
