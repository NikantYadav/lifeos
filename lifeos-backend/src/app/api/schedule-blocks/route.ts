import { NextResponse } from 'next/server';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createScheduleBlockSchema } from '@/lib/validation/scheduleBlocks';

export const GET = withApi(async (req, { user }) => {
  const admin = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const dayOfWeek = searchParams.get('day_of_week');

  let query = admin.from('schedule_blocks').select('*').eq('user_id', user.id).order('day_of_week').order('start_time');
  if (dayOfWeek !== null) {
    const day = Number(dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      return NextResponse.json({ error: 'invalid_day_of_week' }, { status: 400 });
    }
    query = query.eq('day_of_week', day);
  }

  const { data, error } = await query;
  if (error) return dbError('schedule_blocks.list', error);

  return NextResponse.json({ schedule_blocks: data });
});

export const POST = withApi(async (req, { user }) => {
  const parsed = await parseBody(req, createScheduleBlockSchema);
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
    if (planErr) return dbError('schedule_blocks.create.plan_lookup', planErr);
    if (!plan) return NextResponse.json({ error: 'plan_not_found' }, { status: 404 });
  }

  const { data, error } = await admin
    .from('schedule_blocks')
    .insert({
      user_id: user.id,
      day_of_week: body.day_of_week,
      start_time: body.start_time,
      end_time: body.end_time ?? null,
      title: body.title,
      note: body.note ?? null,
      is_key_block: body.is_key_block ?? false,
      plan_id: body.plan_id ?? null,
      created_by: 'user',
    })
    .select('*')
    .single();

  if (error) return dbError('schedule_blocks.create', error);

  return NextResponse.json({ schedule_block: data }, { status: 201 });
});
