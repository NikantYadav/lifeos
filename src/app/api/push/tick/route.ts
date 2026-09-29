import { NextRequest, NextResponse } from 'next/server';
import { migrateState } from '@/lib/migrate';
import { PUSH_SUB_KEY, pushConfigured, StoredPushSubscription, webpush } from '@/lib/push';
import { redis, STATE_KEY } from '@/lib/redis';
import { dueBlocks, wallMs } from '@/lib/schedulePush';
import { EMPTY_STATE } from '@/lib/types';
import { parseState } from '@/lib/validate';

export const dynamic = 'force-dynamic';

/** Wall ms (see schedulePush.ts) of the latest block start already notified. */
const LAST_SENT_KEY = 'lifeos:v1:push-last-block';

/**
 * "Block starts now" pushes for every timetable row. Meant to be hit every
 * minute by an external scheduler (Vercel Hobby crons run at most daily), so
 * it's bearer-secret gated with the same CRON_SECRET as /api/push/cron and
 * excluded from the cookie gate in proxy.ts. Missed or jittery ticks are fine:
 * each run sends whatever started since the last notified block.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!redis) return NextResponse.json({ error: 'Redis is not configured.' }, { status: 503 });
  if (!pushConfigured) return NextResponse.json({ error: 'Push is not configured.' }, { status: 503 });

  const sub = await redis.get<StoredPushSubscription>(PUSH_SUB_KEY);
  if (!sub) return NextResponse.json({ sent: 0, reason: 'no subscription' });

  const raw = await redis.get<unknown>(STATE_KEY);
  const state = migrateState(raw == null ? { ...EMPTY_STATE } : parseState(raw));

  const now = wallMs(new Date());
  const lastSent = await redis.get<number>(LAST_SENT_KEY);
  const due = dueBlocks(state.schedule, state.startDate, now, lastSent);
  if (!due.length) return NextResponse.json({ sent: 0 });

  // Claim these blocks before sending, so an overlapping tick can't double-send.
  await redis.set(LAST_SENT_KEY, due[due.length - 1].at);

  let sent = 0;
  for (const { at, row } of due) {
    const [time, title, note] = row;
    try {
      await webpush.sendNotification(
        sub,
        JSON.stringify({ title: `${time} · ${title}`, body: note || 'Starts now.', tag: `lifeos-block-${at}`, url: '/' }),
        // "Starts now" is time-sensitive: high urgency wakes Android out of
        // Doze, and a short TTL drops it rather than delivering it hours late.
        { urgency: 'high', TTL: 600 }
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await redis.del(PUSH_SUB_KEY);
        return NextResponse.json({ sent, error: 'Subscription expired and was removed.' }, { status: 410 });
      }
      return NextResponse.json({ sent, error: 'push failed' }, { status: 502 });
    }
  }
  return NextResponse.json({ sent });
}
