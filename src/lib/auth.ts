import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type CurrentUser = { id: string; email: string | null };

/**
 * Verified current user (JWT signature checked by getClaims, never getSession).
 * Redirects to /login when there is no valid session. Deduped per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  // Verifying a JWT compares its expiry against the clock, so it must run at
  // request time. Without this, Cache Components' runtime prefetch flags Date.now().
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect('/login');
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };
});
