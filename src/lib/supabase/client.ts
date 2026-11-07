import { createBrowserClient as createSsrBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/** Supabase client for Client Components. Uses only the publishable key. */
export function createBrowserClient() {
  return createSsrBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
