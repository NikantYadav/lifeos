import { ReviewContext } from './reviewContext';

/**
 * Server-only. Never import this from a client component — GEMINI_API_KEY
 * must not reach the browser.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// 'bad' and 'ask' are deliberately absent from this enum — a schema-conformant
// response cannot name them, independent of the prompt instructions below.
const DIFF_FIELD_ENUM = ['aim', 'when', 'where', 'how', 'quota', 'warn', 'milestones'];

export const REVIEW_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    narrative: { type: 'string' },
    pattern: { type: 'string' },
    proposedDiffs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['plan', 'schedule', 'weekGoals', 'task', 'habit'] },
          planId: { type: 'string' },
          field: { type: 'string', enum: DIFF_FIELD_ENUM },
          dayOfWeek: { type: 'integer' },
          key: { type: 'string' },
          op: { type: 'string', enum: ['add', 'drop', 'retime'] },
          existingId: { type: 'string' },
          title: { type: 'string' },
          detail: { type: 'string' },
          triggerWeek: { type: 'integer' },
          before: { type: 'string' },
          after: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['kind', 'reason'],
      },
    },
  },
  required: ['narrative', 'pattern', 'proposedDiffs'],
};

export function buildReviewPrompt(context: ReviewContext): string {
  return `You are drafting a factual weekly plan-diff proposal for a personal self-improvement tracker. You are not writing motivational content.

There are five kinds of diff you may propose:
1. kind "plan" — change a plan's "aim", "when", "where", "how", "quota", "warn", or "milestones" field. Set planId and field. Never propose a change to a plan's "bad" or "ask" fields — they do not appear as valid "field" values and any diff naming them will be discarded.
2. kind "schedule" — change a schedule day's label. Set dayOfWeek.
3. kind "weekGoals" — change a weekly numeric target. Set key.
4. kind "task" — add, drop, or retime a one-shot task from pendingTasks. Set op to "add" (with title, detail, triggerWeek, and optionally planId), "drop" (with existingId — must be an id from pendingTasks), or "retime" (with existingId and a new triggerWeek).
5. kind "habit" — add or drop a recurring habit from habits. Set op to "add" (with title and optionally planId — describe the intended cadence in "reason", since cadence structure isn't settable via this diff) or "drop" (with existingId — must be an id from habits).

Rules:
- A "drop" or "retime" diff MUST reference an existingId that actually appears in pendingTasks or habits in the data below. Never invent an id.
- Every proposed diff must have a "before" value taken from the data given (or "none" for an add), an "after" value that is the concrete proposed replacement, and a one-line "reason" that cites the specific data behind it (a score, a skip pattern, a staleness count, a lesson, an overdue task, a missed milestone).
- Do not include encouragement, praise, generic advice, or anything that isn't a specific, data-backed change.
- If nothing in the data justifies a change, return an empty proposedDiffs array. Do not invent changes to fill space.
- "narrative" is 2-4 sentences on what happened this week/these weeks, factually.
- "pattern" is 1-3 sentences on the cross-week pattern the data shows, factually.

DATA:
${JSON.stringify(context, null, 2)}`;
}

export interface GeminiReviewResult {
  narrative: string;
  pattern: string;
  proposedDiffs: unknown[];
}

export async function callGemini(context: ReviewContext): Promise<GeminiReviewResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildReviewPrompt(context) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: REVIEW_RESPONSE_SCHEMA,
        temperature: 0.4,
      },
    }),
  });

  if (!res.ok) throw new Error(`Gemini error ${res.status}`);

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Gemini returned no content');

  return JSON.parse(text) as GeminiReviewResult;
}
