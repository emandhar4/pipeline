import 'server-only';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { AppRow, EventRow } from './health';
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
};

/** The user's visible matches, best score first. */
export async function getMatches(limit = 8): Promise<MatchRow[]> {
  const { id } = await getCurrentUser();
  const client = await createClient();
  const { data, error } = await client
    .from('posting_matches')
    .select('id, base_score, ai_score, confirm_pay, postings(title, company_name)')
    .eq('user_id', id)
    .eq('passed_filter', true)
    .neq('state', 'hidden')
    .order('ai_score', { ascending: false, nullsFirst: false })
    .order('base_score', { ascending: false, nullsFirst: false })
    .limit(Math.max(limit, 20));
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
        },
      ];
    })
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
    .slice(0, limit);
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
