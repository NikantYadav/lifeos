import { z } from 'zod';

/**
 * Server-side validation for trackers and tracker_entries — the actual
 * attack surface of this app, per ROADMAP.md's Phase 6 hardening note and
 * the lifeos-public-app-direction memory: tracker `fields` schemas are
 * AI-authored, so they get treated exactly like untrusted user input, never
 * trusted output from a "friendly" model.
 *
 * This module is deliberately kept in lockstep with three DB-side guards it
 * duplicates (defense in depth, not the only check):
 *   - migration 003's (tightened by migration 012) `pg_jsonschema` CHECK
 *     constraint on `trackers.fields` — as of migration 012 this actually
 *     matches `trackerFieldsSchema` below on every rule EXCEPT duplicate
 *     field keys, which no JSON Schema draft can express as a cross-item
 *     constraint
 *   - migration 012's `trackers_fields_unique_keys` trigger, the DB-side
 *     mirror of `trackerFieldsSchema`'s duplicate-key `superRefine` check
 *     (the one rule the CHECK constraint itself can't express)
 *   - the DB trigger that validates each `tracker_entries.data` against its
 *     tracker's stored `fields` schema
 * If any DB rule changes, this file must change with it.
 *
 * Every string field is length-capped even where the DB column is
 * unbounded `text` — these values may later be concatenated into LLM review
 * prompts, so unbounded free text is both a storage and a prompt-injection /
 * cost concern, not just a validation nicety.
 */

const FIELD_KEY_RE = /^[a-z_][a-z0-9_]*$/;
const FIELD_TYPES = ['text', 'number', 'select', 'boolean', 'date'] as const;

export const trackerFieldSchema = z
  .object({
    key: z.string().regex(FIELD_KEY_RE).max(40),
    type: z.enum(FIELD_TYPES),
    label: z.string().min(1).max(60),
    options: z.array(z.string().max(40)).max(20).optional(),
  })
  .strict();

export const trackerFieldsSchema = z.array(trackerFieldSchema).max(12).superRefine((fields, ctx) => {
  const keys = new Set<string>();
  for (const [i, f] of fields.entries()) {
    if (keys.has(f.key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate field key "${f.key}"`, path: [i, 'key'] });
    }
    keys.add(f.key);

    if (f.type === 'select' && (!f.options || f.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'select fields require at least one option',
        path: [i, 'options'],
      });
    }
    if (f.type !== 'select' && f.options) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'options only allowed on select fields',
        path: [i, 'options'],
      });
    }
  }
});

const TRACKER_KINDS = ['checkbox', 'numeric', 'counter', 'timed', 'scale', 'log'] as const;
export type TrackerKind = (typeof TRACKER_KINDS)[number];

// Exported so `validation/habits.ts` can reuse the identical shape —
// `habits.cadence` is the same kind of "daily/weekly/custom days" JSONB with
// no DB-side CHECK constraint (confirmed against pg_constraint directly),
// so this is an app-layer consistency choice, not something the DB enforces
// on either table. Keep both callers in sync if this shape changes.
export const cadenceSchema = z
  .union([
    z.object({ kind: z.literal('daily') }).strict(),
    z.object({ kind: z.literal('weekly') }).strict(),
    z
      .object({
        kind: z.literal('custom'),
        days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      })
      .strict(),
  ])
  .default({ kind: 'daily' });

export const createTrackerSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    kind: z.enum(TRACKER_KINDS),
    unit: z.string().max(30).optional(),
    target: z.number().finite().min(0).max(1_000_000).optional(),
    cadence: cadenceSchema.optional(),
    fields: trackerFieldsSchema.optional(),
    plan_id: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.kind !== 'log' && val.fields && val.fields.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`fields` is only allowed on kind "log"',
        path: ['fields'],
      });
    }
    if (val.kind === 'log' && val.target !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`target` is not meaningful on kind "log"',
        path: ['target'],
      });
    }
  });

export const updateTrackerSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    unit: z.string().max(30).nullable().optional(),
    target: z.number().finite().min(0).max(1_000_000).nullable().optional(),
    cadence: cadenceSchema.optional(),
    fields: trackerFieldsSchema.optional(),
    archived: z.boolean().optional(),
    // kind and plan_id are deliberately not editable after creation: kind
    // changes the shape of every existing entry's `value`/`data`, and
    // plan_id reassignment is a separate, ownership-checked operation, not a
    // generic patch field.
  })
  .strict();

const MISS_CATEGORIES = ['tired', 'too_busy', 'no_motivation', 'no_plan', 'sick', 'forgot', 'other'] as const;

export const createTrackerEntrySchema = z
  .object({
    tracker_id: z.string().uuid(),
    entry_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'entry_date must be YYYY-MM-DD')
      .refine(isValidCalendarDate, 'entry_date must be a valid calendar date')
      .optional(),
    value: z.number().finite().min(-1_000_000).max(1_000_000).nullable().optional(),
    data: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
    note: z.string().max(1000).optional(),
    missed: z.boolean().optional(),
    miss_category: z.enum(MISS_CATEGORIES).optional(),
    miss_note: z.string().max(1000).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.miss_category && val.missed === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'miss_category requires missed=true',
        path: ['miss_category'],
      });
    }
    if (val.miss_note && !val.miss_category && val.missed !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'miss_note requires missed=true',
        path: ['miss_note'],
      });
    }
  });

// NOT `createTrackerEntrySchema.innerType().partial()...` — `innerType()`
// unwraps the ZodEffects wrapper and drops its `superRefine` entirely
// (a `ZodEffects` has no `.partial()`, so unwrapping is the only way to get
// there, but it silently discards the miss_category/miss_note coupling
// check with it). This schema is built the same way as the create schema —
// `.strict()` then its own `superRefine` — so a PATCH gets the identical
// validation discipline a POST gets, just with every field optional.
export const updateTrackerEntrySchema = z
  .object({
    entry_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'entry_date must be YYYY-MM-DD')
      .refine(isValidCalendarDate, 'entry_date must be a valid calendar date')
      .optional(),
    value: z.number().finite().min(-1_000_000).max(1_000_000).nullable().optional(),
    data: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
    note: z.string().max(1000).optional(),
    missed: z.boolean().optional(),
    miss_category: z.enum(MISS_CATEGORIES).nullable().optional(),
    miss_note: z.string().max(1000).nullable().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    // `missed: false` (explicit or implicit, since the route also clears
    // both columns whenever `missed===false`) must never be paired with a
    // non-null miss_category/miss_note in the same request — that combination
    // is exactly what the POST route rejects, and PATCH must reject it too,
    // not silently persist it via the route's field-by-field patch builder.
    if (val.missed === false) {
      if (val.miss_category) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'miss_category cannot be set when missed=false',
          path: ['miss_category'],
        });
      }
      if (val.miss_note) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'miss_note cannot be set when missed=false',
          path: ['miss_note'],
        });
      }
    }
    // The mirror gap: `missed: true` (or omitted, meaning "stays missed")
    // paired with an *explicit* `miss_category: null` must also be
    // rejected — `.nullable()` on miss_category exists so a request can
    // clear it, but only together with clearing missed itself. Without
    // this, `{missed: true, miss_category: null}` would pass validation
    // and the route's else-branch would write it through unchanged,
    // producing `missed=true, miss_category=null` — the exact state POST
    // rejects but PATCH would have silently allowed.
    if (val.missed !== false && val.miss_category === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'miss_category can only be cleared together with missed=false',
        path: ['miss_category'],
      });
    }
  });

/**
 * Real calendar validity for a YYYY-MM-DD string, matching pg_jsonschema's
 * `"format": "date"` behavior on the DB trigger side (which rejects e.g.
 * "2026-13-40" even though it matches the \d{4}-\d{2}-\d{2} shape).
 *
 * Deliberately NOT `new Date(Date.UTC(y, m-1, d))` + round-trip comparison:
 * `Date.UTC`/the `Date` constructor special-case two-digit-looking years
 * 0-99 as 1900+y (spec behavior, same as `new Date(y, ...)`), which would
 * reject every real year 0000-0099 (e.g. "0050-06-15") even though RFC 3339
 * full-date — what pg_jsonschema's `format: "date"` implements — permits
 * them. A plain days-in-month table sidesteps that quirk entirely and
 * matches the DB's actual (more permissive on year range) behavior instead
 * of silently becoming stricter than it.
 */
function isValidCalendarDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= daysInMonth[m - 1];
}

/**
 * Validates a `log`-kind entry's `data` against its tracker's stored
 * `fields` schema — the app-layer mirror of the DB trigger. Rejects unknown
 * keys and wrong types, same discipline as validating a normal form
 * submission. Called after the tracker is fetched (so we know its kind and
 * fields), before the entry insert/update is attempted.
 */
export function validateEntryDataAgainstFields(
  data: Record<string, unknown> | undefined,
  fields: Array<z.infer<typeof trackerFieldSchema>>
): { ok: true } | { ok: false; message: string } {
  if (!data || Object.keys(data).length === 0) return { ok: true };

  const byKey = new Map(fields.map((f) => [f.key, f]));
  for (const key of Object.keys(data)) {
    if (!byKey.has(key)) return { ok: false, message: `unknown field "${key}"` };
  }

  for (const field of fields) {
    const v = data[field.key];
    // Omitted key: fine, the field simply isn't set this entry. `null` is
    // NOT the same thing and must NOT be treated as "skip" here — the DB
    // trigger (`validate_tracker_entry_data`) builds each field's JSON
    // Schema as e.g. `{"type": "string", "maxLength": 500}` with no `"null"`
    // in the type union, so a `null` value fails `jsonb_matches_schema` for
    // every field type. Letting `null` through here used to produce a
    // confirmed-live 500 (raw Postgres P0001 surfacing through the generic
    // `dbError` catch-all) instead of a clean 400 — this mirrors the DB's
    // actual (stricter) behavior instead of silently disagreeing with it.
    if (v === undefined) continue;
    if (v === null) return { ok: false, message: `field "${field.key}" cannot be null` };

    switch (field.type) {
      case 'text':
        if (typeof v !== 'string') return { ok: false, message: `field "${field.key}" must be text` };
        break;
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          return { ok: false, message: `field "${field.key}" must be a number` };
        }
        break;
      case 'boolean':
        if (typeof v !== 'boolean') return { ok: false, message: `field "${field.key}" must be a boolean` };
        break;
      case 'date':
        // Regex shape first, then real calendar validity — pg_jsonschema's
        // `"format": "date"` on the DB side (see validate_tracker_entry_data)
        // rejects e.g. "2026-13-40" even though it matches \d{4}-\d{2}-\d{2};
        // a regex-only check here previously let that through to a confirmed
        // live 500 at the DB trigger instead of a clean 400.
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !isValidCalendarDate(v)) {
          return { ok: false, message: `field "${field.key}" must be a valid YYYY-MM-DD date` };
        }
        break;
      case 'select':
        if (typeof v !== 'string' || !(field.options ?? []).includes(v)) {
          return { ok: false, message: `field "${field.key}" must be one of the tracker's options` };
        }
        break;
    }
  }

  return { ok: true };
}
