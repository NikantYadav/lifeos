import { NextResponse } from 'next/server';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createTaskSchema } from '@/lib/validation/tasks';

export const GET = withApi(async (req, { user }) => {
  const admin = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  let query = admin.from('tasks').select('*').eq('user_id', user.id).order('trigger_week').order('created_at');
  if (status) {
    if (!['pending', 'done', 'dropped'].includes(status)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return dbError('tasks.list', error);

  return NextResponse.json({ tasks: data });
});

export const POST = withApi(async (req, { user }) => {
  const parsed = await parseBody(req, createTaskSchema);
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
    if (planErr) return dbError('tasks.create.plan_lookup', planErr);
    if (!plan) return NextResponse.json({ error: 'plan_not_found' }, { status: 404 });
  }

  const { data, error } = await admin
    .from('tasks')
    .insert({
      user_id: user.id,
      title: body.title,
      detail: body.detail ?? '',
      plan_id: body.plan_id ?? null,
      trigger_week: body.trigger_week ?? 0,
      status: 'pending',
      created_by: 'user',
    })
    .select('*')
    .single();

  if (error) return dbError('tasks.create', error);

  return NextResponse.json({ task: data }, { status: 201 });
});
