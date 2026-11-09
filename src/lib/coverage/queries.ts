import 'server-only';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { RunItem } from './summary';

export type LatestRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  items: RunItem[];
};

export type CompanyCoverage = { covered: number; not_covered: number; unknown: number };

/** The most recent finder run with its items, or null if the finder has never run. Global data, no per-user rows. */
export async function getLatestRun(): Promise<LatestRun | null> {
  await getCurrentUser();
  const client = await createClient();
  const { data: run, error } = await client
    .from('finder_runs')
    .select('id, started_at, finished_at, status')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`read finder run failed: ${error.message}`);
  if (!run) return null;

  const items: RunItem[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error: itemsError } = await client
      .from('finder_run_items')
      .select('source, scope, status, found, new, error')
      .eq('run_id', run.id)
      .order('id')
      .range(from, from + page - 1);
    if (itemsError) throw new Error(`read finder run items failed: ${itemsError.message}`);
    items.push(...data);
    if (data.length < page) break;
  }
  return { ...run, items };
}

/** Company counts by coverage status. */
export async function getCompanyCoverage(): Promise<CompanyCoverage> {
  await getCurrentUser();
  const client = await createClient();
  const count = async (coverage: keyof CompanyCoverage) => {
    const { count: n, error } = await client
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('coverage', coverage);
    if (error) throw new Error(`read company coverage failed: ${error.message}`);
    return n ?? 0;
  };
  const [covered, not_covered, unknown] = await Promise.all([count('covered'), count('not_covered'), count('unknown')]);
  return { covered, not_covered, unknown };
}
