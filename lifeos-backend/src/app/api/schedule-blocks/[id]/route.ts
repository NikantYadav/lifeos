import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isEndAfterStart, updateScheduleBlockSchema } from '@/lib/validation/scheduleBlocks';

const idSchema = z.string().uuid();

export const PATCH = withApi<{ id: string }>(async (req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const parsed = await parseBody(req, updateScheduleBlockSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const admin = supabaseAdmin();

  // start_time/end_time ordering can only be checked in the schema when
  // both are supplied in the same request (see validation/scheduleBlocks.ts).
  // A PATCH that only changes one of the two against a stored pair that
  // would become invalid is a real gap; close it here by loading current
  // values when only one side is being changed.
  if ((body.start_time !== undefined) !== (body.end_time !== undefined)) {
    const { data: existing, error: loadErr } = await admin
      .from('schedule_blocks')
      .select('start_time, end_time')
      .eq('id', idResult.data)
      .eq('user_id', user.id)
      .maybeSingle();
    if (loadErr) return dbError('schedule_blocks.update.load', loadErr);
    if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const effectiveStart = body.start_time ?? existing.start_time;
    const effectiveEnd = body.end_time === undefined ? existing.end_time : body.end_time;
    if (effectiveEnd && !isEndAfterStart(effectiveStart, effectiveEnd)) {
      return NextResponse.json({ error: 'end_time_must_be_after_start_time' }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.day_of_week !== undefined) patch.day_of_week = body.day_of_week;
  if (body.start_time !== undefined) patch.start_time = body.start_time;
  if (body.end_time !== undefined) patch.end_time = body.end_time;
  if (body.title !== undefined) patch.title = body.title;
  if (body.note !== undefined) patch.note = body.note;
  if (body.is_key_block !== undefined) patch.is_key_block = body.is_key_block;

  const { data, error } = await admin
    .from('schedule_blocks')
    .update(patch)
    .eq('id', idResult.data)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();

  if (error) return dbError('schedule_blocks.update', error);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ schedule_block: data });
});

export const DELETE = withApi<{ id: string }>(async (_req, { user, params }) => {
  const idResult = idSchema.safeParse(params.id);
  if (!idResult.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const admin = supabaseAdmin();

  // Hard-deleted, unlike trackers/plans — a schedule block is a timetable
  // slot, not history the AI review needs to look back on; there's nothing
  // to preserve once it's removed.
  const { data, error } = await admin
    .from('schedule_blocks')
    .delete()
    .eq('id', idResult.data)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) return dbError('schedule_blocks.delete', error);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ deleted: true });
});
