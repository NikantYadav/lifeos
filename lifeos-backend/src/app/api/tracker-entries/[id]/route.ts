import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { trackerFieldsSchema, updateTrackerEntrySchema, validateEntryDataAgainstFields } from '@/lib/validation/trackers';

const idSchema = z.string().uuid();

export const PATCH = withApi<{ id: string }>(async (req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const parsed = await parseBody(req, updateTrackerEntrySchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const admin = supabaseAdmin();

  const { data: existing, error: loadErr } = await admin
    .from('tracker_entries')
    .select('id, tracker_id, user_id, trackers!inner(kind, fields)')
    .eq('id', idResult.data)
    .eq('user_id', user.id)
    .maybeSingle();

  if (loadErr) return dbError('tracker_entries.update.load', loadErr);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const trackerRow = existing.trackers as unknown as { kind: string; fields: unknown };
  // Re-parsed, not just cast: `fields` came back out of the DB, and while
  // the pg_jsonschema CHECK constraint should guarantee its shape, treating
  // our own stored data as pre-validated is exactly the kind of assumption
  // this schema-validation layer exists to avoid.
  const trackerFields = trackerFieldsSchema.safeParse(trackerRow.fields).data ?? [];

  if (body.data !== undefined) {
    if (trackerRow.kind === 'log') {
      const check = validateEntryDataAgainstFields(body.data, trackerFields);
      if (!check.ok) return NextResponse.json({ error: 'invalid_data', message: check.message }, { status: 400 });
    } else if (Object.keys(body.data).length > 0) {
      return NextResponse.json({ error: 'data_only_allowed_on_log_kind' }, { status: 400 });
    }
  }

  const missed = body.missed;
  if (missed === true && body.miss_category === undefined) {
    // Allow patching other fields on an already-missed entry without
    // re-supplying miss_category every time, but a transition INTO missed
    // within this same request must carry a category.
    const { data: current } = await admin
      .from('tracker_entries')
      .select('miss_category')
      .eq('id', idResult.data)
      .single();
    if (!current?.miss_category) {
      return NextResponse.json({ error: 'miss_category_required_when_missed' }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.entry_date !== undefined) patch.entry_date = body.entry_date;
  if (body.value !== undefined) patch.value = body.value;
  if (body.data !== undefined) patch.data = body.data;
  if (body.note !== undefined) patch.note = body.note;
  if (missed !== undefined) patch.missed = missed;

  // miss_category/miss_note are handled last and unconditionally when
  // missed===false, deliberately overriding any (schema-forbidden, but
  // never trust one layer alone) client-supplied value in the same
  // request — "false" always wins over a stray category/note, never the
  // other way around. This ordering is what actually enforces the
  // invariant at the DB-write boundary; the Zod superRefine in
  // updateTrackerEntrySchema is the first line of defense, not the only one.
  if (missed === false) {
    patch.miss_category = null;
    patch.miss_note = null;
  } else {
    if (body.miss_category !== undefined) patch.miss_category = body.miss_category;
    if (body.miss_note !== undefined) patch.miss_note = body.miss_note;
  }

  const { data, error } = await admin
    .from('tracker_entries')
    .update(patch)
    .eq('id', idResult.data)
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (error) return dbError('tracker_entries.update', error);

  return NextResponse.json({ entry: data });
});

export const DELETE = withApi<{ id: string }>(async (_req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const admin = supabaseAdmin();

  // Entries are hard-deleted (unlike trackers) — a single mislogged entry is
  // meant to be correctable/removable; it's the tracker definition itself
  // that's preserved via soft-archive for history/AI-review continuity.
  const { data, error } = await admin
    .from('tracker_entries')
    .delete()
    .eq('id', idResult.data)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) return dbError('tracker_entries.delete', error);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ deleted: true });
});
