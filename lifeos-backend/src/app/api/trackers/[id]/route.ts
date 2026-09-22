import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { updateTrackerSchema } from '@/lib/validation/trackers';

const idSchema = z.string().uuid();

async function loadOwnTracker(admin: ReturnType<typeof supabaseAdmin>, id: string, userId: string) {
  return admin.from('trackers').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
}

export const GET = withApi<{ id: string }>(async (_req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await loadOwnTracker(admin, idResult.data, user.id);
  if (error) return dbError('trackers.get', error);
  // Not found and "belongs to someone else" return the identical 404 —
  // never distinguish them, or the endpoint becomes an existence oracle for
  // other users' tracker ids.
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ tracker: data });
});

export const PATCH = withApi<{ id: string }>(async (req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const parsed = await parseBody(req, updateTrackerSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const admin = supabaseAdmin();
  const { data: existing, error: loadErr } = await loadOwnTracker(admin, idResult.data, user.id);
  if (loadErr) return dbError('trackers.update.load', loadErr);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (body.fields && existing.kind !== 'log') {
    return NextResponse.json({ error: 'fields_only_allowed_on_log_kind' }, { status: 400 });
  }

  // A field's `type` changing shape (e.g. text -> number) after real entries
  // exist leaves those entries' `data` silently inconsistent with the
  // tracker's now-current schema — `validateEntryDataAgainstFields` only
  // ever validates NEW writes against the CURRENT schema, it never
  // retroactively checks old rows. Rather than allow that drift (or attempt
  // a lossy backfill/coercion), block the edit outright once any entry
  // exists for this tracker: archive and start a new tracker instead. Only
  // a field's `type` is checked — adding/removing/renaming fields, or
  // editing `label`/`options` on a field whose `type` is unchanged, doesn't
  // create the same inconsistency and stays allowed.
  if (body.fields && existing.kind === 'log') {
    const oldTypeByKey = new Map((existing.fields as Array<{ key: string; type: string }>).map((f) => [f.key, f.type]));
    const typeChanged = body.fields.some((f) => oldTypeByKey.has(f.key) && oldTypeByKey.get(f.key) !== f.type);
    if (typeChanged) {
      const { count, error: countErr } = await admin
        .from('tracker_entries')
        .select('id', { count: 'exact', head: true })
        .eq('tracker_id', idResult.data);
      if (countErr) return dbError('trackers.update.entry_count', countErr);
      if ((count ?? 0) > 0) {
        return NextResponse.json({ error: 'cannot_change_field_type_with_existing_entries' }, { status: 409 });
      }
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.unit !== undefined) patch.unit = body.unit;
  if (body.target !== undefined) patch.target = body.target;
  if (body.cadence !== undefined) patch.cadence = body.cadence;
  if (body.fields !== undefined) patch.fields = body.fields;
  if (body.archived !== undefined) patch.archived_at = body.archived ? new Date().toISOString() : null;

  const { data, error } = await admin
    .from('trackers')
    .update(patch)
    .eq('id', idResult.data)
    .eq('user_id', user.id) // belt and suspenders alongside the pre-check above
    .select('*')
    .single();

  if (error) return dbError('trackers.update', error);

  return NextResponse.json({ tracker: data });
});

export const DELETE = withApi<{ id: string }>(async (_req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const admin = supabaseAdmin();

  // Soft delete only (archive), same as the rest of the schema's
  // archived_at pattern — never a hard DELETE from a route, so a user's
  // history (and the AI review context built from it) is never silently
  // destroyed by a client bug or a misdirected request.
  const { data, error } = await admin
    .from('trackers')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', idResult.data)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) return dbError('trackers.archive', error);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ archived: true });
});
