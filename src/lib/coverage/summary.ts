export type RunItem = {
  source: string;
  scope: string;
  status: 'ok' | 'failed' | 'skipped';
  found: number;
  new: number;
  error: string | null;
};

export type SourceSummary = {
  source: string;
  scopes: number;
  ok: number;
  failed: number;
  skipped: number;
  found: number;
  new: number;
};

export type FailedScope = { source: string; scope: string; status: 'failed' | 'skipped'; reason: string };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** One row per source, sorted by source. */
export function summarizeRun(items: RunItem[]): SourceSummary[] {
  const bySource = new Map<string, SourceSummary>();
  for (const i of items) {
    let s = bySource.get(i.source);
    if (!s) {
      s = { source: i.source, scopes: 0, ok: 0, failed: 0, skipped: 0, found: 0, new: 0 };
      bySource.set(i.source, s);
    }
    s.scopes += 1;
    s[i.status] += 1;
    s.found += i.found;
    s.new += i.new;
  }
  return [...bySource.values()].sort((a, b) => cmp(a.source, b.source));
}

/** Failed and skipped scopes (a capped fetch is 'skipped' with a 'partial: ...' reason), sorted by source then scope. */
export function failedScopes(items: RunItem[]): FailedScope[] {
  return items
    .filter((i): i is RunItem & { status: 'failed' | 'skipped' } => i.status !== 'ok')
    .map((i) => ({ source: i.source, scope: i.scope, status: i.status, reason: i.error?.trim() || 'no reason recorded' }))
    .sort((a, b) => cmp(a.source, b.source) || cmp(a.scope, b.scope));
}
