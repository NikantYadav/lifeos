import { z } from 'zod';

/**
 * Validation for `plans` — the AI-authored (or user-authored) goals that
 * trackers/tasks/habits/schedule_blocks optionally link back to via
 * `plan_id`. Same discipline as `validation/trackers.ts`: `.strict()` so an
 * unknown key is rejected rather than dropped, every free-text field capped
 * even where the DB column is unbounded `text` (these fields — `aim`,
 * `good`/`bad`/`warn`, `milestones[].description` — are exactly the kind of
 * thing that ends up concatenated into an AI review prompt later).
 */

const shortText = z.string().max(200);

export const milestoneSchema = z
  .object({
    week: z.number().int().min(0).max(520), // ~10 years of weeks — generous but not unbounded
    description: z.string().min(1).max(300),
  })
  .strict();

export const createPlanSchema = z
  .object({
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
    milestones: z.array(milestoneSchema).max(52).optional(), // a year of weekly milestones, generous cap
  })
  .strict();

// `createPlanSchema` is a plain ZodObject here (no `.superRefine`), so
// `.partial()` is safe directly — no `.innerType()` unwrap needed. That
// unwrap is only required when the base schema is a `ZodEffects` (see the
// comment on `updateTrackerEntrySchema` in `validation/trackers.ts` for the
// bug that pattern caused there); don't copy it here without checking which
// case applies first.
export const updatePlanSchema = createPlanSchema
  .partial()
  .extend({ archived: z.boolean().optional() })
  .strict();
