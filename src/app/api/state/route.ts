import { NextRequest, NextResponse } from 'next/server';
import { migrateState } from '@/lib/migrate';
import { BACKUP_DEPTH, BACKUP_KEY, redis, STATE_KEY } from '@/lib/redis';
import { AppState, EMPTY_STATE } from '@/lib/types';
import { MAX_BODY_BYTES, parseState } from '@/lib/validate';

export const dynamic = 'force-dynamic';

function unavailable() {
  return NextResponse.json(
    {
      error:
        'Redis is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN (see .env.local.example).',
    },
    { status: 503 }
  );
}

export async function GET() {
  if (!redis) return unavailable();

  try {
    const value = await redis.get<unknown>(STATE_KEY);
    const parsed = value == null ? { ...EMPTY_STATE } : parseState(value);
    const migrated = migrateState(parsed);

    if (migrated !== parsed) {
      // Persist the migration once, server-side, bumping rev like a normal
      // write so a client mid-edit on a stale rev still gets a clean 409.
      const next: AppState = { ...migrated, rev: parsed.rev + 1, updatedAt: Date.now() };
      await redis.set(STATE_KEY, next);
      return NextResponse.json(next, { headers: { 'cache-control': 'no-store' } });
    }

    return NextResponse.json(migrated, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not read state.' }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  if (!redis) return unavailable();

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'State too large.' }, { status: 413 });
  }

  let incoming: AppState;
  try {
    incoming = parseState(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: 'Malformed JSON.' }, { status: 400 });
  }

  try {
    const existing = await redis.get<unknown>(STATE_KEY);
    const current = existing == null ? null : parseState(existing);

    // Reject a write built on a stale read, so a second tab or device can't
    // silently clobber a whole day of edits.
    if (current && incoming.rev < current.rev) {
      return NextResponse.json(
        { error: 'conflict', state: current },
        { status: 409, headers: { 'cache-control': 'no-store' } }
      );
    }

    const next: AppState = {
      ...incoming,
      rev: (current?.rev ?? 0) + 1,
      updatedAt: Date.now(),
    };

    await redis.set(STATE_KEY, next);

    // Keep a short history so one bad write is always recoverable.
    if (current) {
      try {
        await redis.lpush(BACKUP_KEY, JSON.stringify(current));
        await redis.ltrim(BACKUP_KEY, 0, BACKUP_DEPTH - 1);
      } catch {
        // Backups are best-effort; never fail the write over them.
      }
    }

    return NextResponse.json(
      { ok: true, rev: next.rev, updatedAt: next.updatedAt },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch {
    return NextResponse.json({ error: 'Could not save state.' }, { status: 502 });
  }
}
