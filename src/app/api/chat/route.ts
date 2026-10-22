import { NextResponse } from 'next/server';
import { callGeminiChat, ChatMessage, MAX_TEXT_CHARS } from '@/lib/chat';
import { sanitizeDiffs } from '@/lib/diffs';
import { migrateState } from '@/lib/migrate';
import { redis, STATE_KEY } from '@/lib/redis';
import { EMPTY_STATE } from '@/lib/types';
import { parseState } from '@/lib/validate';

export const dynamic = 'force-dynamic';

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/** Proposal-only: no state writes. Accepted diffs are applied by the client via PUT /api/state. */
export async function POST(req: Request) {
  if (!redis) {
    return NextResponse.json({ error: 'Redis is not configured.' }, { status: 503 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not set.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad('Body must be JSON.');
  }
  const raw = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(raw) || raw.length === 0) return bad('messages must be a non-empty array.');

  const messages: ChatMessage[] = [];
  for (const m of raw) {
    const o = m as { role?: unknown; text?: unknown } | null;
    if (!o || (o.role !== 'user' && o.role !== 'assistant') || typeof o.text !== 'string') {
      return bad('Each message needs role "user"|"assistant" and a text string.');
    }
    if (o.text.length > MAX_TEXT_CHARS) return bad(`Message text is over ${MAX_TEXT_CHARS} characters.`);
    messages.push({ role: o.role, text: o.text });
  }
  const last = messages[messages.length - 1];
  if (last.role !== 'user') return bad('The last message must be from the user.');
  if (!last.text.trim()) return bad('The last message is empty.');
  const history = messages.filter((m) => m.text.trim());

  try {
    const stored = await redis.get<unknown>(STATE_KEY);
    const state = migrateState(stored == null ? { ...EMPTY_STATE } : parseState(stored));

    const result = await callGeminiChat(state, history, new Date());

    const proposedDiffs = sanitizeDiffs(result.proposedDiffs, {
      taskIds: new Set(state.tasks.map((t) => t.id)),
      habitIds: new Set(state.habits.map((h) => h.id)),
      state,
    });
    const reply = typeof result.reply === 'string' ? result.reply : '';
    if (!reply.trim() && proposedDiffs.length === 0) throw new Error('empty reply');

    return NextResponse.json({ reply, proposedDiffs });
  } catch {
    return NextResponse.json({ error: 'Could not generate a reply.' }, { status: 502 });
  }
}
