import { NextRequest, NextResponse } from 'next/server';
import { currentWeekIndex, iso } from '@/lib/dates';
import { dueHabits } from '@/lib/habits';
import { migrateState } from '@/lib/migrate';
import { PUSH_SUB_KEY, pushConfigured, StoredPushSubscription, webpush } from '@/lib/push';
import { redis, STATE_KEY } from '@/lib/redis';
import { EMPTY_STATE } from '@/lib/types';
import { parseState } from '@/lib/validate';

export const dynamic = 'force-dynamic';

/**
 * Scheduled trigger (Vercel Cron, see vercel.json) for the two reminders this
 * single-user app sends on its own: an evening nudge if today's checks/habits
 * are still open, and a Sunday nudge that this week's review hasn't been run
 * yet. Bearer-secret gated rather than cookie-gated (see proxy.ts's exclusion
 * of this path) since a scheduler has no browser session to carry the cookie.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!redis) return NextResponse.json({ error: 'Redis is not configured.' }, { status: 503 });
  if (!pushConfigured) return NextResponse.json({ error: 'Push is not configured.' }, { status: 503 });

  const sub = await redis.get<StoredPushSubscription>(PUSH_SUB_KEY);
  if (!sub) return NextResponse.json({ sent: false, reason: 'no subscription' });

  const raw = await redis.get<unknown>(STATE_KEY);
  const state = migrateState(raw == null ? { ...EMPTY_STATE } : parseState(raw));

  const now = new Date();
  const todayKey = iso(now);
  const curWeek = currentWeekIndex(now, state.startDate);
  const day = state.days[todayKey] ?? { c: {}, n: {} };

  const openChecks = state.checks.filter(([key]) => !day.c[key]);
  const openHabits = dueHabits(state.habits, now);
  const reviewDone = state.reviews.some((r) => r.weekIndex === curWeek);

  let payload: { title: string; body: string; url: string } | null = null;

  // Sunday, and this week's review hasn't been generated yet.
  if (now.getDay() === 0 && !reviewDone) {
    payload = {
      title: 'Sunday review',
      body: 'This week’s review is ready to generate.',
      url: '/',
    };
  } else if (openChecks.length > 0 || openHabits.length > 0) {
    const parts = [
      openChecks.length ? `${openChecks.length} check${openChecks.length === 1 ? '' : 's'}` : '',
      openHabits.length ? `${openHabits.length} habit${openHabits.length === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    payload = {
      title: 'Life OS',
      body: `You still have ${parts.join(' and ')} open today.`,
      url: '/',
    };
  }

  if (!payload) return NextResponse.json({ sent: false, reason: 'nothing due' });

  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return NextResponse.json({ sent: true });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) await redis.del(PUSH_SUB_KEY);
    return NextResponse.json({ sent: false, error: 'push failed' }, { status: 502 });
  }
}
