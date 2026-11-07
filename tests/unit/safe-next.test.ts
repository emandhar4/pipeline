import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safe-next';

describe('safeNext', () => {
  it.each([
    ['/dashboard?x=1', '/dashboard?x=1'],
    ['/settings/profile', '/settings/profile'],
    ['https://evil.com', '/dashboard'],
    ['//evil.com', '/dashboard'],
    ['/\\evil.com', '/dashboard'],
    ['\\\\evil.com', '/dashboard'],
    ['/\t/evil.com', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
    ['/.//evil.com', '/dashboard'],
    ['/..//evil.com', '/dashboard'],
    ['/%2e//evil.com', '/dashboard'],
    ['/a/..//evil.com', '/dashboard'],
    ['/a/../b', '/b'],
    ['dashboard', '/dashboard'],
    ['', '/dashboard'],
  ])('safeNext(%j) -> %j', (raw, expected) => {
    expect(safeNext(raw)).toBe(expected);
  });

  it('falls back on null and undefined', () => {
    expect(safeNext(null)).toBe('/dashboard');
    expect(safeNext(undefined)).toBe('/dashboard');
  });

  it('uses a custom fallback', () => {
    expect(safeNext('https://evil.com', '/home')).toBe('/home');
  });
});
