import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env.server';

/** Service-role client. Bypasses RLS: server-only, never per-user data on behalf of a request without checks. */
export function createAdminClient(): SupabaseClient {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
