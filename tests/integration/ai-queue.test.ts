import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
// helpers first: it loads .env.local before the worker's env modules are evaluated.
import { adminClient, createTestUser, deleteTestUser } from './helpers';
import { enqueueScoreFit } from '@/finder/ai-queue';
import { claimJobs, completeJob } from '@/lib/ai/worker';
import type { Database } from '@/lib/database.types';

// worker.ts is server-only; here it runs in Node against the hosted project.
vi.mock('server-only', () => ({}));

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

const admin = adminClient();
const db = admin as unknown as SupabaseClient<Database>;
const suffix = randomBytes(4).toString('hex');
const postingIds: string[] = [];
let n = 0;
let q: TestUser; // enqueue and claim: matches written directly
let r: TestUser; // complete: real refresh_matches

const POSTING = {
  company_name: 'Test- AI Queue Co',
  title: 'Software Engineering Intern',
  locations: ['San Jose, CA'],
  states: ['CA'],
  countries: ['US'],
  remote: 'onsite',
  level: 'internship',
  terms: [] as string[],
  field_slugs: ['software-engineering'],
  location_unknown: false,
};

async function makePosting(extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin
    .from('postings')
    .insert({ ...POSTING, dedupe_key: `test:aiq-${n++}-${suffix}`, ...extra })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  postingIds.push(data.id);
  return data.id as string;
}

async function setMode(userId: string, mode: 'queue' | 'off') {
  const { error } = await admin.from('profiles').update({ ai_mode: mode }).eq('user_id', userId);
  expect(error).toBeNull();
}

async function jobsOf(userId: string) {
  const { data, error } = await admin
    .from('ai_jobs')
    .select('id, posting_id, status, claimed_at, result, error, completed_at')
    .eq('user_id', userId);
  expect(error).toBeNull();
  return data as {
    id: string;
    posting_id: string;
    status: string;
    claimed_at: string | null;
    result: unknown;
    error: string | null;
    completed_at: string | null;
  }[];
}

beforeAll(async () => {
  q = await createTestUser('aiq');
  r = await createTestUser('aiq-r');
});

afterAll(async () => {
  // ai_jobs and posting_matches cascade with the users and the postings.
  if (postingIds.length) {
    const d = await admin.from('postings').delete().in('id', postingIds);
    if (d.error) throw new Error(d.error.message);
  }
  for (const u of [q, r]) if (u) await deleteTestUser(u.id, u.email);
});

describe('enqueueScoreFit', () => {
  // Scores 100 down to 84 pass; the hidden, gone and failing ones score higher but never qualify.
  const ranked: string[] = [];
  let hidden: string;
  let gone: string;
  let failing: string;
  let scored: string;
  let worse: string;

  beforeAll(async () => {
    const { error: pe } = await admin
      .from('profiles')
      .update({ career_stage: 'intern', season: 'Summer 2027' })
      .eq('user_id', q.id);
    expect(pe).toBeNull();
    const { error: fe } = await admin.from('profile_fields').insert([
      { user_id: q.id, category_slug: 'software-engineering', label: 'Software Engineering', weight: 'primary' },
      { user_id: q.id, category_slug: null, label: 'Robotics', weight: 'secondary' },
    ]);
    expect(fe).toBeNull();

    for (let i = 0; i < 17; i++) ranked.push(await makePosting({ title: `Test Intern ${i}` }));
    hidden = await makePosting();
    gone = await makePosting({ status: 'gone' });
    failing = await makePosting();
    scored = await makePosting();
    worse = await makePosting();
    const rows = [
      ...ranked.map((id, i) => ({ posting_id: id, base_score: 100 - i, passed_filter: true })),
      { posting_id: hidden, base_score: 200, passed_filter: true, state: 'hidden' as const },
      { posting_id: gone, base_score: 199, passed_filter: true },
      { posting_id: failing, base_score: 198, passed_filter: false },
      { posting_id: scored, base_score: 197, passed_filter: true, ai_score: 6 },
      { posting_id: worse, base_score: 196, passed_filter: true, bar_verdict: 'does_not_beat' as const },
      // One bulk insert sends every key for every row (missing ones as null), so spell out the defaults.
    ].map((m) => ({ state: 'new' as const, ai_score: null as number | null, bar_verdict: 'no_bar' as Database['public']['Enums']['bar_verdict'], ...m, user_id: q.id }));
    const { error } = await admin.from('posting_matches').insert(rows);
    expect(error).toBeNull();
  });

  it("skips users whose ai_mode isn't queue", async () => {
    await setMode(q.id, 'off');
    expect(await enqueueScoreFit(db, q.id)).toBe(0);
    expect(await jobsOf(q.id)).toHaveLength(0);
  });

  it('puts in the top 15 only, skipping hidden, gone, failing, already-scored and does-not-beat-the-bar postings', async () => {
    await setMode(q.id, 'queue');
    expect(await enqueueScoreFit(db, q.id)).toBe(15);
    const jobs = await jobsOf(q.id);
    expect(jobs.map((j) => j.posting_id).sort()).toEqual(ranked.slice(0, 15).sort());
    expect(jobs.every((j) => j.status === 'queued')).toBe(true);
    expect(jobs.map((j) => j.posting_id)).not.toContain(worse);
  });

  it('keeps at most 15 queued or claimed jobs per user', async () => {
    expect(await enqueueScoreFit(db, q.id)).toBe(0);
  });

  it("doesn't re-enqueue a posting that has a job", async () => {
    const { error } = await admin.from('ai_jobs').update({ status: 'done' }).eq('user_id', q.id);
    expect(error).toBeNull();
    expect(await enqueueScoreFit(db, q.id)).toBe(2);
    const queued = (await jobsOf(q.id)).filter((j) => j.status === 'queued');
    expect(queued.map((j) => j.posting_id).sort()).toEqual(ranked.slice(15).sort());
    expect(await enqueueScoreFit(db, q.id)).toBe(0);
  });
});

describe('claimJobs', () => {
  let safe = false;

  beforeAll(async () => {
    // Fresh queue for q: 15 queued jobs.
    const d = await admin.from('ai_jobs').delete().eq('user_id', q.id);
    expect(d.error).toBeNull();
    expect(await enqueueScoreFit(db, q.id)).toBe(15);
    // claim_ai_jobs takes any user's jobs, so only claim while no real job could be taken.
    const others = await admin
      .from('ai_jobs')
      .select('id', { count: 'exact', head: true })
      .not('user_id', 'in', `(${q.id},${r.id})`)
      .in('status', ['queued', 'claimed']);
    expect(others.error).toBeNull();
    safe = (others.count ?? 0) === 0;
    if (!safe) console.warn(`ai-queue: SKIPPING claim tests: ${others.count} other queued/claimed ai_jobs exist`);
  });

  it('claiming twice gives no overlap, and returns only posting and profile fields', async (ctx) => {
    if (!safe) ctx.skip('other queued or claimed ai_jobs exist');
    const first = await claimJobs(10);
    expect(first).toHaveLength(10);
    // Exactly the returned jobs are claimed; the rest are still queued.
    const afterFirst = await jobsOf(q.id);
    expect(afterFirst.filter((j) => j.status === 'claimed').map((j) => j.id).sort()).toEqual(first.map((j) => j.id).sort());
    expect(afterFirst.filter((j) => j.status === 'queued')).toHaveLength(5);
    const second = await claimJobs(10);
    expect(second).toHaveLength(5);
    const ids = [...first, ...second].map((j) => j.id);
    expect(new Set(ids).size).toBe(15);
    const mine = new Set((await jobsOf(q.id)).map((j) => j.id));
    expect(ids.every((id) => mine.has(id))).toBe(true);
    expect((await jobsOf(q.id)).every((j) => j.status === 'claimed')).toBe(true);
    expect(await claimJobs(10)).toEqual([]);

    const job = first[0];
    expect(Object.keys(job).sort()).toEqual(['id', 'posting', 'profile']);
    expect(Object.keys(job.posting).sort()).toEqual(
      ['apply_url', 'company', 'level', 'locations', 'pay_max_cents', 'pay_min_cents', 'pay_period', 'terms', 'title'].sort(),
    );
    expect(job.posting.company).toBe('Test- AI Queue Co');
    expect(job.profile).toEqual({
      career_stage: 'intern',
      season: 'Summer 2027',
      fields: [
        { label: 'Software Engineering', weight: 'primary' },
        { label: 'Robotics', weight: 'secondary' },
      ],
    });
    const text = JSON.stringify([...first, ...second]);
    expect(text).not.toContain(q.id);
    expect(text).not.toContain(q.email);
  });

  it('a claim older than 2 hours is claimable again', async (ctx) => {
    if (!safe) ctx.skip('other queued or claimed ai_jobs exist');
    const [stale] = await jobsOf(q.id);
    const old = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const u = await admin.from('ai_jobs').update({ claimed_at: old }).eq('id', stale.id);
    expect(u.error).toBeNull();
    const again = await claimJobs(10);
    expect(again.map((j) => j.id)).toEqual([stale.id]);
  });

  it("leaves jobs of users whose ai_mode isn't queue, and unsupported kinds, queued and unclaimed", async (ctx) => {
    if (!safe) ctx.skip('other queued or claimed ai_jobs exist');
    // Release q's leftover claim so only the rows below could be claimed.
    const rel = await admin.from('ai_jobs').update({ status: 'done' }).eq('user_id', q.id);
    expect(rel.error).toBeNull();
    await setMode(r.id, 'off');
    const p1 = await makePosting();
    const ins = await admin
      .from('ai_jobs')
      .insert({ user_id: r.id, kind: 'score_fit', posting_id: p1 })
      .select('id')
      .single();
    expect(ins.error).toBeNull();
    const odd = await admin
      .from('ai_jobs')
      .insert({ user_id: q.id, kind: 'tailor_resume', posting_id: p1 })
      .select('id')
      .single();
    expect(odd.error).toBeNull();
    expect(await claimJobs(10)).toEqual([]);
    const [oddJob] = (await jobsOf(q.id)).filter((j) => j.id === odd.data!.id);
    expect(oddJob.status).toBe('queued');
    expect(oddJob.claimed_at).toBeNull();
    const [job] = (await jobsOf(r.id)).filter((j) => j.id === ins.data!.id);
    expect(job.status).toBe('queued');
    expect(job.claimed_at).toBeNull();
    // Turning the mode on makes the user's job claimable.
    await setMode(r.id, 'queue');
    const got = await claimJobs(10);
    expect(got.map((j) => j.id)).toEqual([ins.data!.id]);
    const cleanup = await admin.from('ai_jobs').delete().in('id', [ins.data!.id, odd.data!.id]);
    expect(cleanup.error).toBeNull();
  });

  it('signed-in users cannot call claim_ai_jobs or complete_ai_job', async () => {
    const c = await r.client.rpc('claim_ai_jobs', { p_limit: 10, p_worker: 'x' });
    expect(c.error).not.toBeNull();
    const d = await r.client.rpc('complete_ai_job', { p_id: randomUUID(), p_error: 'x' });
    expect(d.error).not.toBeNull();
  });
});

describe('completeJob', () => {
  let posting: string;
  let other: string;

  beforeAll(async () => {
    const { error: pe } = await admin
      .from('profiles')
      .update({
        career_stage: 'intern',
        work_style: 'in_person',
        work_states: ['CA'],
        work_anywhere_us: false,
        work_countries: [],
        season: 'Summer 2027',
      })
      .eq('user_id', r.id);
    expect(pe).toBeNull();
    const { error: fe } = await admin.from('profile_fields').insert({
      user_id: r.id,
      category_slug: 'software-engineering',
      label: 'Software Engineering',
      weight: 'primary',
    });
    expect(fe).toBeNull();
    posting = await makePosting();
    other = await makePosting();
    const { data, error } = await r.client.rpc('refresh_matches', { p_user: r.id });
    expect(error).toBeNull();
    expect(data).toBe('ok');
  });

  async function match(postingId: string) {
    const { data, error } = await admin
      .from('posting_matches')
      .select('passed_filter, ai_score, reasons')
      .eq('user_id', r.id)
      .eq('posting_id', postingId)
      .single();
    expect(error).toBeNull();
    return data as { passed_filter: boolean; ai_score: number | null; reasons: Record<string, unknown> };
  }

  async function claimedJob(postingId: string): Promise<string> {
    // Inserted directly as claimed, so these tests never call claim_ai_jobs.
    const { data, error } = await admin
      .from('ai_jobs')
      .insert({ user_id: r.id, kind: 'score_fit', posting_id: postingId, status: 'claimed', claimed_at: new Date().toISOString(), claimed_by: 'test' })
      .select('id')
      .single();
    expect(error).toBeNull();
    return data!.id as string;
  }

  it('sets ai_score and ai_reason, and refresh_matches afterwards keeps both', async () => {
    const before = await match(posting);
    expect(before.passed_filter).toBe(true);
    expect(before.ai_score).toBeNull();
    const id = await claimedJob(posting);

    expect(await completeJob({ id, score: 8, reason: 'Test reason: close to the primary field.' })).toBe('ok');
    const [job] = (await jobsOf(r.id)).filter((j) => j.id === id);
    expect(job.status).toBe('done');
    expect(job.result).toEqual({ score: 8, reason: 'Test reason: close to the primary field.' });
    expect(job.completed_at).not.toBeNull();

    const after = await match(posting);
    expect(Number(after.ai_score)).toBe(8);
    expect(after.reasons.ai_reason).toBe('Test reason: close to the primary field.');
    for (const key of Object.keys(before.reasons)) expect(after.reasons[key]).toEqual(before.reasons[key]);

    const { error } = await r.client.rpc('refresh_matches', { p_user: r.id });
    expect(error).toBeNull();
    const kept = await match(posting);
    expect(Number(kept.ai_score)).toBe(8);
    expect(kept.reasons.ai_reason).toBe('Test reason: close to the primary field.');

    expect(await completeJob({ id, score: 3, reason: 'again' })).toBe('not_claimed');
    expect(Number((await match(posting)).ai_score)).toBe(8);
  });

  it('an error marks the job failed and leaves the match alone', async () => {
    const id = await claimedJob(other);
    expect(await completeJob({ id, error: 'Test: apply page did not load.' })).toBe('ok');
    const [job] = (await jobsOf(r.id)).filter((j) => j.id === id);
    expect(job.status).toBe('failed');
    expect(job.error).toBe('Test: apply page did not load.');
    expect((await match(other)).ai_score).toBeNull();
  });

  it('returns not_found for an unknown id', async () => {
    expect(await completeJob({ id: randomUUID(), score: 5, reason: 'x' })).toBe('not_found');
  });
});
