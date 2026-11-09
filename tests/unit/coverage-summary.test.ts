import { describe, expect, it } from 'vitest';
import { failedScopes, summarizeRun } from '@/lib/coverage/summary';

const items = [
  { source: 'lever', scope: 'b', status: 'ok' as const, found: 5, new: 2, error: null },
  { source: 'greenhouse', scope: 'z', status: 'failed' as const, found: 0, new: 0, error: 'http 500' },
  { source: 'greenhouse', scope: 'a', status: 'skipped' as const, found: 3, new: 1, error: 'partial: stopped at 3 rows' },
  { source: 'greenhouse', scope: 'm', status: 'ok' as const, found: 10, new: 4, error: null },
  { source: 'lever', scope: 'a', status: 'failed' as const, found: 0, new: 0, error: null },
];

describe('summarizeRun', () => {
  it('groups by source, sorted, counting statuses and totals', () => {
    expect(summarizeRun(items)).toEqual([
      { source: 'greenhouse', scopes: 3, ok: 1, failed: 1, skipped: 1, found: 13, new: 5 },
      { source: 'lever', scopes: 2, ok: 1, failed: 1, skipped: 0, found: 5, new: 2 },
    ]);
  });
  it('is empty for no items', () => {
    expect(summarizeRun([])).toEqual([]);
  });
});

describe('failedScopes', () => {
  it('lists failed and skipped scopes sorted by source then scope, with reasons', () => {
    expect(failedScopes(items)).toEqual([
      { source: 'greenhouse', scope: 'a', status: 'skipped', reason: 'partial: stopped at 3 rows' },
      { source: 'greenhouse', scope: 'z', status: 'failed', reason: 'http 500' },
      { source: 'lever', scope: 'a', status: 'failed', reason: 'no reason recorded' },
    ]);
  });
});
