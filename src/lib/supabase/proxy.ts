import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env';
import { safeNext } from '@/lib/safe-next';

/** Paths reachable without a session. Everything else requires sign-in (default deny). */
function isPublic(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/auth/');
}

/** Returns a redirect that keeps any refreshed auth cookies and no-cache headers. */
function redirectWith(url: URL, from: NextResponse): NextResponse {
  const res = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => res.cookies.set(cookie));
  for (const header of ['cache-control', 'expires', 'pragma']) {
    const value = from.headers.get(header);
    if (value) res.headers.set(header, value);
  }
  return res;
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  // Create a new client on every request; never share it across requests.
  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(): it refreshes
  // the session, and removing it causes random sign-outs.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', `${pathname}${search}`);
    return redirectWith(url, supabaseResponse);
  }

  if (signedIn && pathname === '/login') {
    const url = request.nextUrl.clone();
    const target = new URL(safeNext(request.nextUrl.searchParams.get('next')), request.url);
    url.pathname = target.pathname;
    url.search = target.search;
    return redirectWith(url, supabaseResponse);
  }

  return supabaseResponse;
}
