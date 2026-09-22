import { z } from 'zod';
import { milestoneSchema } from './plans';
import { cadenceSchema, trackerFieldsSchema } from './trackers';

/**
 * Validation for the AI onboarding proposal — the structured JSON the model
 * emits from a chat transcript, and the same shape the user can hand-edit
 * before accepting (see routes/onboarding: propose emits this, commit
 * re-validates it, never trusts what's merely stored in `proposed_plan`).
 *
 * This is deliberately its own module, not a re-export of
 * `createTrackerSchema` etc., because the AI can't emit real UUIDs for
 * `plan_id` — it invents plans in the same proposal it invents trackers in.
 * Every child resource takes an optional `plan_ref` (a proposal-local
 * string, not a DB id) instead of `plan_id`; the commit route resolves
 * `plan_ref -> real uuid` after inserting plans first, and rejects any
 * `plan_ref` that doesn't match a plan in the same proposal (see
 * `resolvePlanRef` below) — never lets a stray ref silently become `null`.
 *
 * Same discipline as every other validation module: `.strict()`, every
 * free-text field capped, `created_by` never a field here at all (commit
 * sets it server-side to `'ai_onboarding'`, exactly like the create routes
 * hardcode `'user'` — see `apiRoute`-based routes for the pattern this
 * mirrors).
 */

const shortText = z.string().max(200);
const planRef = z.string().min(1).max(40);

export const proposedPlanSchema = z
  .object({
    ref: planRef,
    name: z.string().min(1).max(100),
    aim: z.string().max(500).optional(),
    when: z.array(shortText).max(20).optional(),
    where: z.array(shortText).max(20).optional(),
    how: z.array(shortText).max(20).optional(),
    quota: z.array(shortText).max(20).optional(),
    good: z.string().max(500).optional(),
    bad: z.string().max(500).optional(),
    warn: z.string().max(500).optional(),
    ask: z.array(shortText).max(20).optional(),
    milestones: z.array(milestoneSchema).max(52).optional(),
  })
  .strict();

export const proposedScheduleBlockSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6),
    start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'start_time must be HH:MM'),
    end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, 'end_time must be HH:MM').optional(),
    title: z.string().min(1).max(100),
    note: z.string().max(500).optional(),
    is_key_block: z.boolean().optional(),
    plan_ref: planRef.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const norm = (t: string) => (t.length === 5 ? `${t}:00` : t);
    if (val.end_time && norm(val.end_time) <= norm(val.start_time)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'end_time must be after start_time', path: ['end_time'] });
    }
  });

export const proposedTrackerSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    kind: z.enum(['checkbox', 'numeric', 'counter', 'timed', 'scale', 'log']),
    unit: z.string().max(30).optional(),
    target: z.number().finite().min(0).max(1_000_000).optional(),
    cadence: cadenceSchema.optional(),
    fields: trackerFieldsSchema.optional(),
    plan_ref: planRef.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.kind !== 'log' && val.fields && val.fields.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '`fields` is only allowed on kind "log"', path: ['fields'] });
    }
    if (val.kind === 'log' && val.target !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '`target` is not meaningful on kind "log"', path: ['target'] });
    }
  });

export const proposedTaskSchema = z
  .object({
    title: z.string().min(1).max(150),
    detail: z.string().max(1000).optional(),
    trigger_week: z.number().int().min(0).max(520).optional(),
    plan_ref: planRef.optional(),
  })
  .strict();

export const proposedHabitSchema = z
  .object({
    title: z.string().min(1).max(150),
    cadence: cadenceSchema.optional(),
    plan_ref: planRef.optional(),
  })
  .strict();

export const onboardingProposalSchema = z
  .object({
    summary: z.string().min(1).max(1000), // shown to the user as "here's the plan I built from our chat"
    plans: z.array(proposedPlanSchema).max(10),
    schedule_blocks: z.array(proposedScheduleBlockSchema).max(100).optional(),
    trackers: z.array(proposedTrackerSchema).max(20).optional(),
    tasks: z.array(proposedTaskSchema).max(50).optional(),
    habits: z.array(proposedHabitSchema).max(20).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const refs = new Set<string>();
    val.plans.forEach((p, i) => {
      if (refs.has(p.ref)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate plan ref "${p.ref}"`, path: ['plans', i, 'ref'] });
      }
      refs.add(p.ref);
    });

    const checkRef = (list: Array<{ plan_ref?: string }> | undefined, field: string) => {
      list?.forEach((item, i) => {
        if (item.plan_ref && !refs.has(item.plan_ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `plan_ref "${item.plan_ref}" does not match any plan in this proposal`,
            path: [field, i, 'plan_ref'],
          });
        }
      });
    };
    checkRef(val.schedule_blocks, 'schedule_blocks');
    checkRef(val.trackers, 'trackers');
    checkRef(val.tasks, 'tasks');
    checkRef(val.habits, 'habits');
  });

export type OnboardingProposal = z.infer<typeof onboardingProposalSchema>;

// Chat-turn cap: the transcript is persisted and re-sent as context on every
// turn, so it's a cost/latency lever that grows with conversation length —
// cap it now rather than after real transcripts exist (ROADMAP Phase 6 asks
// for this eventually; doing it at build time is far cheaper than retrofitting).
export const MAX_TRANSCRIPT_TURNS = 40; // 20 user + 20 model turns
export const MAX_MESSAGE_CHARS = 2000;

// Per-user lifetime cap on total onboarding_sessions rows created (see
// migration 009 + getOrCreateSession in app/api/onboarding/route.ts).
// Without this, skip (which unconditionally marks the current session
// applied, no cap) followed by any GET/POST /api/onboarding creates a
// brand-new session with a FRESH MAX_TRANSCRIPT_TURNS budget — an
// authenticated caller could loop chat(<=40 Gemini calls)->skip
// indefinitely, each cycle a fresh uncapped batch of real Gemini spend.
// Worst case at this limit: MAX_ONBOARDING_SESSIONS * MAX_TRANSCRIPT_TURNS
// = 5 * 40 = 200 lifetime Gemini calls per user, vs. legitimate use needing
// roughly 3 (first attempt, one skip-then-return, one redo) — generous
// enough that a real user reworking their plan a couple of times never
// hits it, while still bounding worst-case spend to a fixed, small multiple
// of one session's own cap rather than leaving it unbounded.
export const MAX_ONBOARDING_SESSIONS = 5;

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_CHARS),
});
