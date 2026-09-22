import { NextResponse } from 'next/server';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createHabitSchema } from '@/lib/validation/habits';

export const GET = withApi(async (req, { user }) => {
  const admin = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const includeArchived = searchParams.get('include_archived') === 'true';

  let query = admin.from('habits').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
  if (!includeArchived) query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) return dbError('habits.list', error);

  return NextResponse.json({ habits: data });
});

export const POST = withApi(async (req, { user }) => {
  const parsed = await parseBody(req, createHabitSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const admin = supabaseAdmin();

  if (body.plan_id) {
    const { data: plan, error: planErr } = await admin
      .from('plans')
      .select('id')
      .eq('id', body.plan_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (planErr) return dbError('habits.create.plan_lookup', planErr);
    if (!plan) return NextResponse.json({ error: 'plan_not_found' }, { status: 404 });
  }

  const { data, error } = await admin
    .from('habits')
    .insert({
      user_id: user.id,
      title: body.title,
      plan_id: body.plan_id ?? null,
      cadence: body.cadence ?? { kind: 'daily' },
      created_by: 'user',
    })
    .select('*')
    .single();

  if (error) return dbError('habits.create', error);

  return NextResponse.json({ habit: data }, { status: 201 });
});
