import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env.server';
import type { Database } from '@/lib/database.types';

/** Service-role client. Bypasses RLS: server-only, never per-user data on behalf of a request without checks. */
export function createAdminClient(): SupabaseClient<Database> {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
