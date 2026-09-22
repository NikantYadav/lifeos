import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * This is the ONLY Supabase client the frontend ever creates, and it is used
 * for auth only — sign up, sign in, sign out, session/token refresh.
 *
 * It must NEVER be used to read or write a `public.*` table directly
 * (`.from(...)`). Every data operation (plans, trackers, entries, reviews,
 * etc.) goes through the lifeos-backend API instead, with the current
 * session's access token sent as a Bearer header — see `apiFetch` in
 * `./api.ts`. The backend is the only place holding the Supabase service
 * role key; this app only ever holds the publishable/anon key, which is
 * safe to embed on-device because Supabase Auth's own endpoints are
 * designed for that (see lifeos-backend/src/lib/supabaseAdmin.ts and the
 * lifeos-public-app-direction project memory for the full reasoning).
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set — see .env.example.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Native uses signInWithIdToken (no redirect, nothing in a URL to read).
    // Web uses signInWithOAuth's redirect flow — Supabase needs to parse the
    // returned session out of the URL fragment on the way back from Google.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
