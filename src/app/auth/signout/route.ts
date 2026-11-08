import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** POST only, so a cross-site link or prefetch cannot sign the user out. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // 'local' ends this browser's session only, not the user's other devices.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) console.error('[auth/signout] signOut failed', { code: error.code, message: error.message });
  // 303 turns the POST into a GET of /login.
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
