/**
 * Paths the proxy lets through without a session. Everything else requires sign-in (default deny).
 * The /api/ai-jobs/ routes authenticate their worker with a bearer token instead.
 */
export function isPublic(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/auth/') || pathname.startsWith('/api/ai-jobs/');
}
