import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The ONLY Supabase client this backend uses: service-role key, full table
 * access, RLS bypassed by design. This is safe only because:
 *
 *  1. It never leaves this process — nothing here re-exports the key or the
 *     client to a route that serializes it into a response.
 *  2. Every route that uses it re-derives `user_id` itself from a verified
 *     Supabase-issued JWT (see `requireUser` in `auth.ts`) and filters every
 *     query by that id explicitly — RLS is defense-in-depth, not the only
 *     gate, because this client bypasses it.
 *  3. The frontend (lifeos-frontend) never receives this key. It only ever
 *     talks to Supabase Auth directly (anon/publishable key, safe to embed)
 *     to sign in and obtain a user JWT, then calls this backend with that JWT
 *     as a Bearer token for every data operation. It has no Supabase
 *     anon-key access to any table in `public` — see ROADMAP.md and the
 *     `lifeos-public-app-direction` project memory for why.
 *
 * `import 'server-only'` makes any accidental client-bundle import of this
 * file a build-time error rather than a runtime key leak.
 */
let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set — see .env.local.example.'
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
