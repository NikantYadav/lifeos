import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { PUSH_SUB_KEY, StoredPushSubscription } from '@/lib/push';

export const dynamic = 'force-dynamic';

function unavailable() {
  return NextResponse.json(
    { error: 'Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.' },
    { status: 503 }
  );
}

/**
 * Single-user app, so this is one subscription slot, not a table keyed by
 * user id — the same shape the rest of the app's persistence takes
 * (see STATE_KEY in redis.ts). A second browser subscribing just replaces it.
 */
export async function POST(req: NextRequest) {
  if (!redis) return unavailable();

  let sub: StoredPushSubscription;
  try {
    sub = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON.' }, { status: 400 });
  }

  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 });
  }

  try {
    await redis.set(PUSH_SUB_KEY, sub);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not save subscription.' }, { status: 502 });
  }
}

export async function DELETE() {
  if (!redis) return unavailable();

  try {
    await redis.del(PUSH_SUB_KEY);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not remove subscription.' }, { status: 502 });
  }
}

/**
 * Diagnostic only — reports whether a subscription is on file and which push
 * service it targets, without echoing back the p256dh/auth secrets a full
 * subscription carries.
 */
export async function GET() {
  if (!redis) return unavailable();

  const sub = await redis.get<StoredPushSubscription>(PUSH_SUB_KEY);
  if (!sub) return NextResponse.json({ subscribed: false });

  let endpointOrigin: string | null = null;
  try {
    endpointOrigin = new URL(sub.endpoint).origin;
  } catch {
    // leave null
  }

  return NextResponse.json({ subscribed: true, endpointOrigin });
}
