import { NextResponse } from 'next/server';
import { dbError, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Data export — account deletion's documented "smaller sibling gap" (see
 * ROADMAP.md Phase 6 and `account/delete/route.ts`'s doc comment). Returns
 * every row the requesting user owns, across every `user_id`-bearing table,
 * as a single JSON document.
 *
 * `entitlement: false`, same reasoning as `/api/me` and `account/delete`: an
 * expired-trial user must still be able to get a copy of their own data —
 * this is arguably even more important for export than delete, since a
 * paywall blocking "give me my data back" is a much worse look than one
 * blocking delete.
 *
 * GET, not POST: unlike delete, this is non-destructive and has no body to
 * drop, so there's no reason to deviate from the standard verb.
 *
 * No IDOR surface by construction: the user id comes only from `withApi`'s
 * verified JWT (`requireUser`) — this route takes no id from a query param,
 * body, or anything else client-supplied, so a caller can only ever export
 * their own data.
 *
 * `EXPORT_TABLES` is intentionally a single explicit list (not derived from
 * `list_tables` at runtime, which would be its own trust/perf problem) —
 * kept in sync by hand with `account/delete/route.ts`'s doc comment, which
 * lists the same 11 `user_id`-bearing tables (confirmed directly via
 * `mcp__supabase__list_tables` at the time this route was written, not
 * assumed from that comment). A future migration adding a 12th such table
 * needs a one-line addition here — nothing enforces that automatically,
 * same as nothing enforces it for the delete route's FK-cascade list.
 *
 * Deliberately fails the WHOLE export (500) on any single table's query
 * error, rather than the commit-route's best-effort/partial-success
 * pattern. That pattern is right for a multi-step AI-authored *write*
 * (something is better than nothing when creating new data), but wrong
 * here: handing a user a document that claims to be "all your data" while
 * silently missing a table is worse than a clean error asking them to
 * retry.
 *
 * Pagination: PostgREST caps rows returned per request (Supabase's default
 * server-side max-rows setting) regardless of an unbounded `SELECT *` —
 * relying on that setting never being hit would risk a *silently truncated*
 * export for a long-lived power-user's `tracker_entries`, which is a data-
 * loss bug, not just a perf tradeoff. Every table is paged via `.range()`
 * until a short page comes back, so this stays correct regardless of the
 * project's configured page-size cap, no pagination-limit assumption baked
 * in. Still fully synchronous (no background job) — even a few thousand
 * rows across a handful of `.range()` calls per table is well within a
 * normal request's time budget at this app's per-user data volume.
 *
 * No `.order(...)` applied uniformly: the tables here don't share a common
 * sortable column (`milestone_checks` has no `created_at`; `profiles` and
 * `subscriptions` have no `id` at all, `user_id` is their primary key) — an
 * export's row order isn't meaningful to a user reading their own data back,
 * so this omits ordering entirely rather than risk a 400 on some tables to
 * satisfy an ordering guarantee nothing here needs.
 */
const PAGE_SIZE = 1000;

const EXPORT_TABLES = [
  'profiles',
  'subscriptions',
  'plans',
  'schedule_blocks',
  'tasks',
  'habits',
  'trackers',
  'tracker_entries',
  'milestone_checks',
  'reviews',
  'onboarding_sessions',
] as const;

type ExportTable = (typeof EXPORT_TABLES)[number];

async function fetchAllRows(
  table: ExportTable,
  userId: string
): Promise<{ rows: Record<string, unknown>[] } | { error: { code?: string; message?: string } }> {
  const admin = supabaseAdmin();
  const rows: Record<string, unknown>[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) return { error };

    rows.push(...(data ?? []));

    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { rows };
}

export const GET = withApi(async (_req, { user }) => {
  const data: Partial<Record<ExportTable, Record<string, unknown>[]>> = {};

  for (const table of EXPORT_TABLES) {
    const result = await fetchAllRows(table, user.id);
    if ('error' in result) return dbError(`account.export:${table}`, result.error);
    data[table] = result.rows;
  }

  return NextResponse.json({
    exported_at: new Date().toISOString(),
    user_id: user.id,
    data,
  });
}, { entitlement: false });
