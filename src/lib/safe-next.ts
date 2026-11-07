const BASE = 'http://pipeline.invalid';

/** A single leading `/`, never `//` or `/\`, no backslashes or control characters. */
function isSafeRelative(path: string): boolean {
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return false;
  return path.startsWith('/') && !path.startsWith('//');
}

/**
 * Returns `raw` only if it is a same-site relative path (a single leading `/`).
 * Anything else (absolute URLs, protocol-relative `//host`, backslash tricks,
 * control characters that browsers strip, bare words) yields `fallback`.
 */
export function safeNext(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  // Browsers treat `\` like `/` and silently drop tab/CR/LF, so `/\evil.com`
  // and `/\t/evil.com` become `//evil.com`. Reject them outright.
  if (!isSafeRelative(raw)) return fallback;
  try {
    const url = new URL(raw, BASE);
    if (url.origin !== BASE) return fallback;
    // URL parsing collapses `.`, `..` and `%2e` segments, so `/.//evil.com`
    // normalizes to `//evil.com`. Re-check the normalized result.
    const normalized = `${url.pathname}${url.search}${url.hash}`;
    return isSafeRelative(normalized) ? normalized : fallback;
  } catch {
    return fallback;
  }
}
