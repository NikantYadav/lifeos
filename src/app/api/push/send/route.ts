import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { PUSH_SUB_KEY, pushConfigured, StoredPushSubscription, webpush } from '@/lib/push';

export const dynamic = 'force-dynamic';

/**
 * Sends one push message to whatever subscription is currently stored.
 * Auth-gated the same way as every other /api route (see proxy.ts) — there's
 * no separate secret here because this app has exactly one user. A cron job
 * (Vercel Cron, etc.) that wants to trigger reminders should carry the same
 * lifeos_auth cookie, or this route should be extended with a separate
 * bearer secret before exposing it to an unauthenticated scheduler.
 */
export async function POST(req: NextRequest) {
  if (!redis) {
    return NextResponse.json({ error: 'Redis is not configured.' }, { status: 503 });
  }
  if (!pushConfigured) {
    return NextResponse.json(
      { error: 'Push is not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.' },
      { status: 503 }
    );
  }

  let body: { title?: string; message?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const sub = await redis.get<StoredPushSubscription>(PUSH_SUB_KEY);
  if (!sub) {
    return NextResponse.json({ error: 'No push subscription on file.' }, { status: 404 });
  }

  const payload = JSON.stringify({
    title: body.title || 'Life OS',
    body: body.message || 'You have a new update.',
    url: body.url || '/',
  });

  try {
    await webpush.sendNotification(sub, payload);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    // 404/410 from the push service means the subscription is dead (the user
    // uninstalled, cleared data, etc.) — clean it up so future sends don't
    // keep failing against it.
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await redis.del(PUSH_SUB_KEY);
      return NextResponse.json({ error: 'Subscription expired and was removed.' }, { status: 410 });
    }
    return NextResponse.json({ error: 'Could not send notification.' }, { status: 502 });
  }
}
