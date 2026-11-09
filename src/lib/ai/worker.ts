import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import type { Json } from '@/lib/database.types';
import { aiWorkerToken } from '@/lib/env.server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_CLAIM, type CompleteInput, type CompleteResult, type ScoreFitJob } from './types';

/** claimed_by for jobs taken through the worker routes. */
const WORKER = 'ai-worker-route';

export type Authorization = 'ok' | 'unauthorized' | 'disabled';

/**
 * Checks `Authorization: Bearer <AI_WORKER_TOKEN>` in constant time. 'disabled' when the token
 * env var is unset (the routes then answer 404, as if they did not exist).
 */
export function authorize(header: string | null): Authorization {
  const token = aiWorkerToken();
  if (!token) return 'disabled';
  const given = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(token, 'utf8');
  // timingSafeEqual needs equal lengths; the length itself is not secret enough to matter.
  if (a.length !== b.length) return 'unauthorized';
  return timingSafeEqual(a, b) ? 'ok' : 'unauthorized';
}

type Res = { data: unknown; error: { message: string } | null };
/** Throws on a query error, else returns the data (null when a maybeSingle finds no row). */
function must<R extends Res>(res: R, what: string): R['data'] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

const WEIGHT_ORDER = { primary: 0, secondary: 1 } as const;

/**
 * Claims up to `limit` (≤ 10) queued jobs, or claims older than 2 hours, and returns each with its
 * posting and the user's career stage, season and fields. Never a name, email, school or resume.
 */
export async function claimJobs(limit: number): Promise<ScoreFitJob[]> {
  const db = createAdminClient();
  const take = Math.max(0, Math.min(limit, MAX_CLAIM));
  const all = must(await db.rpc('claim_ai_jobs', { p_limit: take, p_worker: WORKER }), 'claim jobs') ?? [];
  // claim_ai_jobs can claim more rows than its limit (its `id in (select … limit … for update skip
  // locked)` may be re-run by the planner). Hand the extras straight back to the queue.
  const claimed = all.slice(0, take);
  const extras = all.slice(take).map((j) => j.id);
  if (extras.length) {
    must(
      await db
        .from('ai_jobs')
        .update({ status: 'queued', claimed_by: null, claimed_at: null })
        .in('id', extras)
        .eq('status', 'claimed')
        .eq('claimed_by', WORKER),
      'release extra jobs',
    );
  }
  if (!claimed.length) return [];

  const postingIds = [...new Set(claimed.map((j) => j.posting_id).filter((id): id is string => id !== null))];
  const userIds = [...new Set(claimed.map((j) => j.user_id))];
  const [postings, profiles, fields] = await Promise.all([
    postingIds.length
      ? db
          .from('postings')
          .select('id, title, company_name, locations, apply_url, level, terms, pay_min_cents, pay_max_cents, pay_period')
          .in('id', postingIds)
          .then((res) => must(res, 'read postings') ?? [])
      : [],
    db
      .from('profiles')
      .select('user_id, career_stage, season')
      .in('user_id', userIds)
      .then((res) => must(res, 'read profiles') ?? []),
    db
      .from('profile_fields')
      .select('user_id, label, weight')
      .in('user_id', userIds)
      .then((res) => must(res, 'read profile fields') ?? []),
  ]);
  const postingById = new Map(postings.map((p) => [p.id, p]));
  const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));

  const jobs: ScoreFitJob[] = [];
  const orphaned: string[] = [];
  for (const j of claimed) {
    const p = j.kind === 'score_fit' && j.posting_id ? postingById.get(j.posting_id) : undefined;
    if (!p) {
      orphaned.push(j.id);
      continue;
    }
    const profile = profileByUser.get(j.user_id);
    jobs.push({
      id: j.id,
      posting: {
        title: p.title,
        company: p.company_name,
        locations: p.locations,
        apply_url: p.apply_url,
        level: p.level,
        terms: p.terms,
        pay_min_cents: p.pay_min_cents,
        pay_max_cents: p.pay_max_cents,
        pay_period: p.pay_period,
      },
      profile: {
        career_stage: profile?.career_stage ?? null,
        season: profile?.season ?? null,
        fields: fields
          .filter((f) => f.user_id === j.user_id)
          .sort((a, b) => WEIGHT_ORDER[a.weight] - WEIGHT_ORDER[b.weight] || a.label.localeCompare(b.label))
          .map((f) => ({ label: f.label, weight: f.weight })),
      },
    });
  }
  if (orphaned.length) {
    // A job without its posting can never be scored; close it instead of leaving it claimed.
    must(
      await db
        .from('ai_jobs')
        .update({ status: 'failed', error: 'posting not found', completed_at: new Date().toISOString() })
        .in('id', orphaned)
        .eq('status', 'claimed'),
      'fail orphaned jobs',
    );
  }
  return jobs;
}

/**
 * Completes a claimed job. A score sets the job done and writes ai_score and reasons.ai_reason on
 * the user's match for that posting (other reason keys kept); an error marks the job failed.
 */
export async function completeJob(input: CompleteInput): Promise<CompleteResult> {
  const db = createAdminClient();
  const job = must(
    await db.from('ai_jobs').select('id, user_id, posting_id, status').eq('id', input.id).maybeSingle(),
    'read job',
  );
  if (!job) return 'not_found';
  if (job.status !== 'claimed') return 'not_claimed';
  const now = new Date().toISOString();

  if ('score' in input) {
    if (job.posting_id) {
      const match = must(
        await db
          .from('posting_matches')
          .select('id, reasons')
          .eq('user_id', job.user_id)
          .eq('posting_id', job.posting_id)
          .maybeSingle(),
        'read match',
      );
      if (match) {
        const reasons =
          match.reasons && typeof match.reasons === 'object' && !Array.isArray(match.reasons) ? match.reasons : {};
        must(
          await db
            .from('posting_matches')
            .update({ ai_score: input.score, reasons: { ...reasons, ai_reason: input.reason } })
            .eq('id', match.id),
          'write match',
        );
      }
    }
    const done = must(
      await db
        .from('ai_jobs')
        .update({
          status: 'done',
          result: { score: input.score, reason: input.reason } satisfies Json,
          error: null,
          completed_at: now,
        })
        .eq('id', job.id)
        .eq('status', 'claimed')
        .select('id'),
      'complete job',
    ) ?? [];
    return done.length ? 'ok' : 'not_claimed';
  }

  const failed = must(
    await db
      .from('ai_jobs')
      .update({ status: 'failed', error: input.error, completed_at: now })
      .eq('id', job.id)
      .eq('status', 'claimed')
      .select('id'),
    'fail job',
  ) ?? [];
  return failed.length ? 'ok' : 'not_claimed';
}
