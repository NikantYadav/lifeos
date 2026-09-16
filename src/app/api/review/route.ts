import { NextResponse } from 'next/server';
import { callGemini } from '@/lib/gemini';
import { migrateState } from '@/lib/migrate';
import { redis, STATE_KEY } from '@/lib/redis';
import { buildReviewContext } from '@/lib/reviewContext';
import { EMPTY_STATE, ProposedDiff } from '@/lib/types';
import { parseState } from '@/lib/validate';

export const dynamic = 'force-dynamic';

const DIFF_FIELDS = new Set(['aim', 'when', 'where', 'how', 'quota', 'warn', 'milestones']);

/**
 * Hard backstop, independent of the prompt instructions and the response
 * schema: drops any diff naming a fixed field even if the model ignored both.
 */
function sanitizeDiffs(diffs: unknown): ProposedDiff[] {
  if (!Array.isArray(diffs)) return [];
  const out: ProposedDiff[] = [];
  for (const d of diffs) {
    if (typeof d !== 'object' || d === null) continue;
    const obj = d as Record<string, unknown>;
    if (obj.kind === 'plan' && typeof obj.field === 'string' && !DIFF_FIELDS.has(obj.field)) continue;
    if (typeof obj.kind !== 'string' || !['plan', 'schedule', 'weekGoals'].includes(obj.kind)) continue;
    out.push({
      kind: obj.kind as ProposedDiff['kind'],
      planId: typeof obj.planId === 'string' ? obj.planId : undefined,
      field: typeof obj.field === 'string' ? (obj.field as ProposedDiff['field']) : undefined,
      dayOfWeek: typeof obj.dayOfWeek === 'number' ? obj.dayOfWeek : undefined,
      key: typeof obj.key === 'string' ? obj.key : undefined,
      before: obj.before,
      after: obj.after,
      reason: typeof obj.reason === 'string' ? obj.reason : '',
    });
  }
  return out;
}

/**
 * Generation only — zero write side effects. This is what makes "AI never
 * sits in the logging path" true by construction: the only route that can
 * ever mutate plans/schedule/weekGoals is PUT /api/state, driven by the
 * user's explicit Accept/Apply click on the client.
 */
export async function POST() {
  if (!redis) {
    return NextResponse.json({ error: 'Redis is not configured.' }, { status: 503 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not set.' }, { status: 503 });
  }

  try {
    const raw = await redis.get<unknown>(STATE_KEY);
    const state = migrateState(raw == null ? { ...EMPTY_STATE } : parseState(raw));
    const context = buildReviewContext(state, new Date());

    const result = await callGemini(context);

    return NextResponse.json({
      narrative: String(result.narrative ?? ''),
      pattern: String(result.pattern ?? ''),
      proposedDiffs: sanitizeDiffs(result.proposedDiffs),
    });
  } catch {
    return NextResponse.json({ error: 'Could not generate review.' }, { status: 502 });
  }
}
