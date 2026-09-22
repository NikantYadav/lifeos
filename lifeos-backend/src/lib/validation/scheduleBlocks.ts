import { z } from 'zod';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/; // HH:MM or HH:MM:SS, matches Postgres `time`

// Plain string comparison (`"09:00" <= "09:05"`) only works when both sides
// use the SAME format — HH:MM vs HH:MM:SS breaks it even when the times are
// equal, because the longer string sorts greater ("09:00:00" > "09:00"
// lexicographically), which would let a zero-length or inverted block
// through. Normalize to HH:MM:SS before every comparison.
function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

function isEndAfterStart(start: string, end: string): boolean {
  return normalizeTime(end) > normalizeTime(start);
}

export const createScheduleBlockSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6), // matches the DB CHECK (0=Sun..6=Sat, migration 002's own convention)
    start_time: z.string().regex(TIME_RE, 'start_time must be HH:MM'),
    end_time: z.string().regex(TIME_RE, 'end_time must be HH:MM').optional(),
    title: z.string().min(1).max(100),
    note: z.string().max(500).optional(),
    is_key_block: z.boolean().optional(),
    plan_id: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.end_time && !isEndAfterStart(val.start_time, val.end_time)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'end_time must be after start_time', path: ['end_time'] });
    }
  });

export const updateScheduleBlockSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6).optional(),
    start_time: z.string().regex(TIME_RE, 'start_time must be HH:MM').optional(),
    end_time: z.string().regex(TIME_RE, 'end_time must be HH:MM').nullable().optional(),
    title: z.string().min(1).max(100).optional(),
    note: z.string().max(500).nullable().optional(),
    is_key_block: z.boolean().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.start_time && val.end_time && !isEndAfterStart(val.start_time, val.end_time)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'end_time must be after start_time', path: ['end_time'] });
    }
  });

// Exported so the route can reuse the identical normalize-then-compare logic
// when checking a partial PATCH against the row's existing stored values
// (see schedule-blocks/[id]/route.ts) — must stay in sync with the checks
// above, or the two could disagree on the same edge case.
//
// `normalizeTime` is ALSO exported (not just `isEndAfterStart`) so
// `scheduleBlockOverlap.ts` can normalize sibling rows read back from
// Postgres (which returns HH:MM:SS) against an AI-proposed HH:MM value
// before comparing endpoints for an overlap — reusing this exact helper
// instead of re-deriving the same HH:MM-vs-HH:MM:SS comparison bug this file
// already fixed once (see the 2026-09-21 CRUD session's build-status entry).
export { isEndAfterStart, normalizeTime };
