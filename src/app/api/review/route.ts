import { NextResponse } from 'next/server';
import { sanitizeDiffs } from '@/lib/diffs';
import { callGemini } from '@/lib/gemini';
import { migrateState } from '@/lib/migrate';
import { redis, STATE_KEY } from '@/lib/redis';
import { buildReviewContext } from '@/lib/reviewContext';
import { EMPTY_STATE } from '@/lib/types';
import { parseState } from '@/lib/validate';

export const dynamic = 'force-dynamic';

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

    const existingTaskIds = new Set(state.tasks.map((t) => t.id));
    const existingHabitIds = new Set(state.habits.map((h) => h.id));

    return NextResponse.json({
      narrative: String(result.narrative ?? ''),
      pattern: String(result.pattern ?? ''),
      proposedDiffs: sanitizeDiffs(result.proposedDiffs, { taskIds: existingTaskIds, habitIds: existingHabitIds, plans: state.plans }),
    });
  } catch {
    return NextResponse.json({ error: 'Could not generate review.' }, { status: 502 });
  }
}
