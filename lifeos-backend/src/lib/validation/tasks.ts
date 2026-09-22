import { z } from 'zod';

// `dropped_reason` has no DB-side CHECK constraint (confirmed against
// migration 002 / pg_constraint directly, unlike tracker_entries'
// miss_category which does) — it's free text at the schema level, so this
// stays a capped string rather than an invented enum that doesn't match
// what the DB actually allows.
const droppedReason = z.string().max(200);

export const createTaskSchema = z
  .object({
    title: z.string().min(1).max(150),
    detail: z.string().max(1000).optional(),
    plan_id: z.string().uuid().optional(),
    trigger_week: z.number().int().min(0).max(520).optional(),
  })
  .strict();

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(150).optional(),
    detail: z.string().max(1000).optional(),
    trigger_week: z.number().int().min(0).max(520).optional(),
    status: z.enum(['pending', 'done', 'dropped']).optional(),
    dropped_reason: droppedReason.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.status === 'dropped' && !val.dropped_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dropped_reason is required when status is "dropped"',
        path: ['dropped_reason'],
      });
    }
    if (val.dropped_reason && val.status !== undefined && val.status !== 'dropped') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dropped_reason can only be set when status is "dropped"',
        path: ['dropped_reason'],
      });
    }
    // Same class of gap the tracker-entries missed/miss_category bug was:
    // `{dropped_reason: 'x'}` with `status` OMITTED would otherwise pass —
    // neither check above fires when `status === undefined`. Schema-level
    // validation alone can't know the task's *current* stored status
    // though, so this only closes the "no status field at all" case; the
    // route (tasks/[id]/route.ts) still has to load the current status
    // when dropped_reason is patched without status, same as
    // schedule-blocks/[id]/route.ts does for start_time/end_time ordering.
    if (val.dropped_reason && val.status === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'patching dropped_reason requires status: "dropped" in the same request',
        path: ['dropped_reason'],
      });
    }
  });
