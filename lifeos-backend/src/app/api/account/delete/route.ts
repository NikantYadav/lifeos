import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dbError, parseBody, withApi } from '@/lib/apiRoute';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Account deletion — the in-app half of the Play Console requirement
 * (an app that supports account creation must offer both an in-app
 * deletion path and a public web deletion-request URL; the latter is
 * `docs/account-deletion.html`). Treated as a submission prerequisite, not
 * optional Phase 6 polish — see ROADMAP.md Phase 6.
 *
 * `entitlement: false`, matching `/api/me`'s one deliberate opt-out: an
 * expired-trial user must still be able to delete their own account —
 * gating deletion behind an active subscription would itself be a Play
 * policy problem (and just cruel).
 *
 * POST, not DELETE: React Native/Hermes on Android has a known history of
 * silently dropping a request body on DELETE. This mirrors
 * `/api/onboarding/skip`'s shape (POST, no dynamic segment) rather than
 * inventing a new convention.
 *
 * No hand-rolled per-table deletes. Every `public.*` table with a
 * `user_id` column was confirmed via a direct `pg_constraint` query (not
 * assumed) to have `user_id references auth.users(id) on delete cascade`
 * — profiles, subscriptions, plans, schedule_blocks, tasks, habits,
 * trackers, tracker_entries, milestone_checks, reviews,
 * onboarding_sessions. No storage buckets exist in this project either
 * (`list_storage_buckets` returned empty), so there's no orphaned-file
 * concern. `auth.admin.deleteUser` is therefore sufficient by itself —
 * anything else would be redundant, and redundant deletes across
 * unrelated tables are just more surface area for a partial-failure bug.
 *
 * The verified user id comes from `withApi`'s `requireUser` (a Supabase
 * JWT verified server-side) — this route never reads a body-supplied user
 * id, so a user can only ever delete their own account by construction,
 * not by a check this route has to remember to add.
 */
const deleteAccountSchema = z.object({ confirm: z.literal(true) }).strict();

export const POST = withApi(async (req, { user }) => {
  const parsed = await parseBody(req, deleteAccountSchema);
  if ('error' in parsed) return parsed.error;

  const admin = supabaseAdmin();

  // Explicit error check here, not just `withApi`'s generic catch-all —
  // a failed `deleteUser` masked as a flat `internal_error` would leave the
  // client believing the account was deleted when it wasn't.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return dbError('account.delete', { code: undefined, message: error.message });

  return NextResponse.json({ deleted: true });
}, { entitlement: false });
