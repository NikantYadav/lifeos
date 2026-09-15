import { NextRequest, NextResponse } from 'next/server';
import { redis, STATE_KEY } from '@/lib/redis';
import { AppState, EMPTY_STATE } from '@/lib/types';

export async function GET() {
  const value = await redis.get<AppState>(STATE_KEY);
  return NextResponse.json(value ?? EMPTY_STATE);
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as AppState;
  await redis.set(STATE_KEY, body);
  return NextResponse.json({ ok: true });
}
