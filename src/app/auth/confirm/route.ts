import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/safe-next';
import { createClient } from '@/lib/supabase/server';

// Only the email sign-in link types this app issues. No passwords, so no recovery.
const OTP_TYPES: readonly EmailOtpType[] = ['magiclink', 'email'];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/** Email-link return: verifies `token_hash` + `type`, then goes to `next`. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get('next'));
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  if (tokenHash && isOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    console.error('[auth/confirm] verifyOtp failed', { code: error.code, message: error.message });
  }

  const url = new URL('/login', request.url);
  url.searchParams.set('error', 'link');
  url.searchParams.set('next', next);
  return NextResponse.redirect(url);
}
