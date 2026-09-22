import { NextResponse } from 'next/server';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createTrackerSchema } from '@/lib/validation/trackers';

export const GET = withApi(async (req, { user }) => {
  const admin = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const includeArchived = searchParams.get('include_archived') === 'true';

  let query = admin.from('trackers').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
  if (!includeArchived) query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) return dbError('trackers.list', error);

  return NextResponse.json({ trackers: data });
});

export const POST = withApi(async (req, { user }) => {
  const parsed = await parseBody(req, createTrackerSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const admin = supabaseAdmin();

  // Client-supplied FK ownership check: plan_id must belong to this user or
  // the insert would silently attach the tracker to someone else's plan
  // (service-role bypasses RLS, so this check is the only thing standing
  // between a guessed/enumerated plan id and a cross-tenant link).
  if (body.plan_id) {
    const { data: plan, error: planErr } = await admin
      .from('plans')
      .select('id')
      .eq('id', body.plan_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (planErr) return dbError('trackers.create.plan_lookup', planErr);
    if (!plan) return NextResponse.json({ error: 'plan_not_found' }, { status: 404 });
  }

  // Row built explicitly, field by field — never spread the parsed body.
  // Server-owned columns (id, user_id, created_by, timestamps) are never
  // client-settable, so the audit trail (who/what created this row) can't
  // be forged.
  const { data, error } = await admin
    .from('trackers')
    .insert({
      user_id: user.id,
      name: body.name,
      description: body.description ?? null,
      kind: body.kind,
      unit: body.unit ?? null,
      target: body.target ?? null,
      cadence: body.cadence ?? { kind: 'daily' },
      fields: body.fields ?? [],
      plan_id: body.plan_id ?? null,
      created_by: 'user',
    })
    .select('*')
    .single();

  if (error) return dbError('trackers.create', error);

  return NextResponse.json({ tracker: data }, { status: 201 });
});
