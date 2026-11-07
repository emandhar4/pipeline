import { createBrowserClient as createSsrBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/** Supabase client for Client Components. Uses only the publishable key. */
export function createBrowserClient() {
  return createSsrBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
