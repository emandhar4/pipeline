import { NextResponse, type NextRequest } from 'next/server';
import { isInviteRejection } from '@/lib/auth-errors';
import { safeNext } from '@/lib/safe-next';
import { createClient } from '@/lib/supabase/server';

/** OAuth / PKCE return: exchanges `code` for a session, then goes to `next`. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get('next'));
  const code = searchParams.get('code');
  const loginError = (code: string) => {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', code);
    url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  };

  const providerError = searchParams.get('error_description') ?? searchParams.get('error');
  if (providerError) return loginError(isInviteRejection(providerError) ? 'invite-only' : 'oauth');
  if (!code) return loginError('link');

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return loginError(isInviteRejection(error.message) ? 'invite-only' : 'link');

  return NextResponse.redirect(new URL(next, request.url));
}
