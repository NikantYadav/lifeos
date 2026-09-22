import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { updateTaskSchema } from '@/lib/validation/tasks';

const idSchema = z.string().uuid();

export const PATCH = withApi<{ id: string }>(async (req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const parsed = await parseBody(req, updateTaskSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { updated_at: now };
  if (body.title !== undefined) patch.title = body.title;
  if (body.detail !== undefined) patch.detail = body.detail;
  if (body.trigger_week !== undefined) patch.trigger_week = body.trigger_week;

  if (body.status !== undefined) {
    patch.status = body.status;
    // done_at/dropped_at are server-set timestamps derived from the status
    // transition, never client-settable directly (they weren't offered in
    // the Zod schema at all, so this is the only place they're written).
    patch.done_at = body.status === 'done' ? now : null;
    patch.dropped_at = body.status === 'dropped' ? now : null;
    // Same ordering discipline as the tracker-entries missed/miss_category
    // fix: a status that isn't "dropped" always wins over a stray
    // dropped_reason in the same request, never the other way around.
    // (`updateTaskSchema`'s superRefine already requires `status: 'dropped'`
    // whenever `dropped_reason` is present, so `body.dropped_reason` can
    // only be set here when `body.status === 'dropped'` — there is no
    // `dropped_reason`-without-`status` case left to handle.)
    patch.dropped_reason = body.status === 'dropped' ? (body.dropped_reason ?? null) : null;
  }

  const { data, error } = await admin
    .from('tasks')
    .update(patch)
    .eq('id', idResult.data)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();

  if (error) return dbError('tasks.update', error);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ task: data });
});

export const DELETE = withApi<{ id: string }>(async (_req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const admin = supabaseAdmin();

  // Hard-deleted — a task is a to-do, not history; "dropped" (via PATCH
  // status) is the soft-removal path when the AI review should still be
  // able to see it was abandoned. DELETE is for outright mistakes.
  const { data, error } = await admin.from('tasks').delete().eq('id', idResult.data).eq('user_id', user.id).select('id').maybeSingle();

  if (error) return dbError('tasks.delete', error);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ deleted: true });
});
