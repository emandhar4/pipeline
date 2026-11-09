import 'server-only';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { parseReasons } from '@/lib/scoring/explain';
import type { BarVerdict, MatchReasons } from '@/lib/scoring/types';
import type { AppRow, EventRow } from './health';
import type { RemoteKind } from './postings';
import type { TaskRow } from './today';

/** Open and snoozed tasks for the signed-in user; rankToday decides which are visible. */
export async function getTasks(): Promise<TaskRow[]> {
  const { id } = await getCurrentUser();
  const client = await createClient();
  const { data, error } = await client
    .from('tasks')
    .select('id, kind, title, due_at, status, snoozed_until, ref_table, ref_id')
    .eq('user_id', id)
    .or('status.is.null,status.in.(open,snoozed)')
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(`read tasks failed: ${error.message}`);
  return data;
}

export type MatchRow = {
  id: string;
  confirm_pay: boolean;
  title: string;
  company_name: string;
  apply_url: string | null;
  locations: string[];
  remote: RemoteKind;
  location_unknown: boolean;
  first_seen: string;
  /** The posting's status is 'new' (first inserted by the latest run). */
  is_new: boolean;
  base_score: number | null;
  ai_score: number | null;
  bar_verdict: BarVerdict;
  reasons: MatchReasons;
  state: 'new' | 'saved' | 'hidden' | 'applied';
};

/**
 * The panel's matches: passing, not hidden, posting not gone, and not below the user's bar.
 * Best fit score first (unscored last), then newest posting, then id for a stable order.
 */
export async function getMatches(limit = 20): Promise<MatchRow[]> {
  const { id } = await getCurrentUser();
  const client = await createClient();
  const { data, error } = await client
    .from('posting_matches')
    .select(
      'id, confirm_pay, base_score, ai_score, bar_verdict, reasons, state, postings!inner(title, company_name, apply_url, locations, remote, location_unknown, first_seen, status)',
    )
    .eq('user_id', id)
    .eq('passed_filter', true)
    .neq('state', 'hidden')
    .neq('bar_verdict', 'does_not_beat')
    .neq('postings.status', 'gone')
    .order('base_score', { ascending: false, nullsFirst: false })
    .order('first_seen', { ascending: false, referencedTable: 'postings' })
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`read matches failed: ${error.message}`);
  return data.flatMap((m) => {
    const p = Array.isArray(m.postings) ? m.postings[0] : m.postings;
    if (!p) return [];
    return [
      {
        id: m.id,
        confirm_pay: m.confirm_pay,
        title: p.title,
        company_name: p.company_name,
        apply_url: p.apply_url,
        locations: p.locations,
        remote: p.remote,
        location_unknown: p.location_unknown,
        first_seen: p.first_seen,
        is_new: p.status === 'new',
        base_score: m.base_score,
        ai_score: m.ai_score === null ? null : Number(m.ai_score),
        bar_verdict: m.bar_verdict,
        reasons: parseReasons(m.reasons),
        state: m.state,
      },
    ];
  });
}

/** Passing, visible matches that do not clearly beat the user's bar (shown only as a count). */
export async function countBelowBar(): Promise<number> {
  const { id } = await getCurrentUser();
  const client = await createClient();
  const { count, error } = await client
    .from('posting_matches')
    .select('id, postings!inner(status)', { count: 'exact', head: true })
    .eq('user_id', id)
    .eq('passed_filter', true)
    .neq('state', 'hidden')
    .eq('bar_verdict', 'does_not_beat')
    .neq('postings.status', 'gone');
  if (error) throw new Error(`count below bar failed: ${error.message}`);
  return count ?? 0;
}

/** When the finder last finished a run, or null if it never has. */
export async function getFinderStatus(): Promise<{ lastFinishedAt: string | null }> {
  await getCurrentUser();
  const client = await createClient();
  const { data, error } = await client
    .from('finder_runs')
    .select('finished_at')
    .eq('status', 'finished')
    .not('finished_at', 'is', null)
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`read finder status failed: ${error.message}`);
  return { lastFinishedAt: data?.finished_at ?? null };
}

export async function getApplicationsWithEvents(): Promise<{ apps: AppRow[]; events: EventRow[] }> {
  const { id } = await getCurrentUser();
  const client = await createClient();
  const [apps, events] = await Promise.all([
    client
      .from('applications')
      .select('id, stage, outcome, channel, applied_at, last_activity_at, company_name, title')
      .eq('user_id', id)
      .limit(1000),
    client
      .from('application_events')
      .select('application_id, from_stage, to_stage, occurred_at')
      .eq('user_id', id)
      .limit(5000),
  ]);
  if (apps.error) throw new Error(`read applications failed: ${apps.error.message}`);
  if (events.error) throw new Error(`read application events failed: ${events.error.message}`);
  return { apps: apps.data, events: events.data };
}
