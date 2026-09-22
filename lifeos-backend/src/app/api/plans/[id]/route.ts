import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { updatePlanSchema } from '@/lib/validation/plans';

const idSchema = z.string().uuid();

export const GET = withApi<{ id: string }>(async (_req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from('plans').select('*').eq('id', idResult.data).eq('user_id', user.id).maybeSingle();
  if (error) return dbError('plans.get', error);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ plan: data });
});

export const PATCH = withApi<{ id: string }>(async (req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const parsed = await parseBody(req, updatePlanSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const admin = supabaseAdmin();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.aim !== undefined) patch.aim = body.aim;
  if (body.when !== undefined) patch.when = body.when;
  if (body.where !== undefined) patch.where = body.where;
  if (body.how !== undefined) patch.how = body.how;
  if (body.quota !== undefined) patch.quota = body.quota;
  if (body.good !== undefined) patch.good = body.good;
  if (body.bad !== undefined) patch.bad = body.bad;
  if (body.warn !== undefined) patch.warn = body.warn;
  if (body.ask !== undefined) patch.ask = body.ask;
  if (body.milestones !== undefined) patch.milestones = body.milestones;
  if (body.archived !== undefined) patch.archived_at = body.archived ? new Date().toISOString() : null;

  const { data, error } = await admin
    .from('plans')
    .update(patch)
    .eq('id', idResult.data)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();

  if (error) return dbError('plans.update', error);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ plan: data });
});

export const DELETE = withApi<{ id: string }>(async (_req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const admin = supabaseAdmin();

  // Soft delete only — a plan being archived shouldn't orphan or silently
  // delete the trackers/tasks/habits/schedule_blocks that still reference
  // its plan_id; those keep pointing at an archived plan, same as archived
  // trackers keep their own history.
  const { data, error } = await admin
    .from('plans')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', idResult.data)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) return dbError('plans.archive', error);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ archived: true });
});
