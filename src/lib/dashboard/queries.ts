import 'server-only';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
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
  score: number | null;
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
};

/** The user's visible matches, newest first (Phase 4 will reorder by score). Gone postings are hidden. */
export async function getMatches(limit = 20): Promise<MatchRow[]> {
  const { id } = await getCurrentUser();
  const client = await createClient();
  const { data, error } = await client
    .from('posting_matches')
    .select(
      'id, base_score, ai_score, confirm_pay, postings!inner(title, company_name, apply_url, locations, remote, location_unknown, first_seen, status)',
    )
    .eq('user_id', id)
    .eq('passed_filter', true)
    .neq('state', 'hidden')
    .neq('postings.status', 'gone')
    .order('postings(first_seen)', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`read matches failed: ${error.message}`);
  return data
    .flatMap((m) => {
      const p = Array.isArray(m.postings) ? m.postings[0] : m.postings;
      if (!p) return [];
      const score = m.ai_score ?? m.base_score;
      return [
        {
          id: m.id,
          score: score === null ? null : Number(score),
          confirm_pay: m.confirm_pay,
          title: p.title,
          company_name: p.company_name,
          apply_url: p.apply_url,
          locations: p.locations,
          remote: p.remote,
          location_unknown: p.location_unknown,
          first_seen: p.first_seen,
          is_new: p.status === 'new',
        },
      ];
    })
    .sort((a, b) => b.first_seen.localeCompare(a.first_seen))
    .slice(0, limit);
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
