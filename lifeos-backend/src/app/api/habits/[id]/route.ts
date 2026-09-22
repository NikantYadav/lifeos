import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { updateHabitSchema } from '@/lib/validation/habits';

const idSchema = z.string().uuid();

export const PATCH = withApi<{ id: string }>(async (req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const parsed = await parseBody(req, updateHabitSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const admin = supabaseAdmin();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.cadence !== undefined) patch.cadence = body.cadence;
  if (body.last_done !== undefined) patch.last_done = body.last_done;
  if (body.archived !== undefined) patch.archived_at = body.archived ? new Date().toISOString() : null;

  const { data, error } = await admin
    .from('habits')
    .update(patch)
    .eq('id', idResult.data)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();

  if (error) return dbError('habits.update', error);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ habit: data });
});

export const DELETE = withApi<{ id: string }>(async (_req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const admin = supabaseAdmin();

  // Soft delete, same as trackers/plans — a habit's own history (via
  // last_done and whatever tracker/entry data references it) is worth
  // preserving for AI review continuity.
  const { data, error } = await admin
    .from('habits')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', idResult.data)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) return dbError('habits.archive', error);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ archived: true });
});
