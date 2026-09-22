import { NextResponse } from 'next/server';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createPlanSchema } from '@/lib/validation/plans';

export const GET = withApi(async (req, { user }) => {
  const admin = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const includeArchived = searchParams.get('include_archived') === 'true';

  let query = admin.from('plans').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
  if (!includeArchived) query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) return dbError('plans.list', error);

  return NextResponse.json({ plans: data });
});

export const POST = withApi(async (req, { user }) => {
  const parsed = await parseBody(req, createPlanSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const admin = supabaseAdmin();

  // Row built explicitly — id/user_id/created_by/timestamps are all
  // server-owned, same discipline as trackers.ts's POST.
  const { data, error } = await admin
    .from('plans')
    .insert({
      user_id: user.id,
      name: body.name,
      aim: body.aim ?? '',
      when: body.when ?? null,
      where: body.where ?? null,
      how: body.how ?? null,
      quota: body.quota ?? null,
      good: body.good ?? null,
      bad: body.bad ?? null,
      warn: body.warn ?? null,
      ask: body.ask ?? null,
      milestones: body.milestones ?? [],
      created_by: 'user',
    })
    .select('*')
    .single();

  if (error) return dbError('plans.create', error);

  return NextResponse.json({ plan: data }, { status: 201 });
});
