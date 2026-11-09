import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

const admin = adminClient();
type U = Awaited<ReturnType<typeof createTestUser>>;
let a: U;
let b: U;
let postingId: string;
const suffix = Math.random().toString(36).slice(2, 8);

beforeAll(async () => {
  a = await createTestUser('score-a');
  b = await createTestUser('score-b');
  const p = await admin
    .from('postings')
    .insert({ company_name: 'Test- Scoring Co', title: 'Test Intern', dedupe_key: `test:scoring-${suffix}` })
    .select('id')
    .single();
  if (p.error) throw new Error(p.error.message);
  postingId = p.data.id;
});

afterAll(async () => {
  // ai_jobs, bars and user_companies cascade with the users.
  for (const u of [a, b]) if (u) await deleteTestUser(u.id, u.email);
  const dp = await admin.from('postings').delete().like('dedupe_key', 'test:scoring-%');
  if (dp.error) throw new Error(dp.error.message);
  const dc = await admin.from('companies').delete().like('name', 'Test- Scoring %');
  if (dc.error) throw new Error(dc.error.message);
});

describe('bars', () => {
  it('a second bar for the same user is refused', async () => {
    const first = await a.client.from('bars').insert({ company: 'Test Co', pay_cents: 3000, pay_period: 'hour' });
    expect(first.error).toBeNull();
    const second = await a.client.from('bars').insert({ company: 'Other Co' });
    expect(second.error).not.toBeNull();
  });

  it("a bar with pay_period 'week' is refused", async () => {
    const r = await b.client.from('bars').insert({ pay_cents: 100, pay_period: 'week' });
    expect(r.error).not.toBeNull();
  });
});

describe('user_companies', () => {
  it('a user cannot have two relations to one company', async () => {
    const co = await admin
      .from('companies')
      .insert({ name: 'Test- Scoring Rel', normalized_name: `test-scoring rel ${suffix}` })
      .select('id')
      .single();
    expect(co.error).toBeNull();
    const id = co.data!.id as string;
    expect((await a.client.from('user_companies').insert({ company_id: id, relation: 'dream' })).error).toBeNull();
    const dup = await a.client.from('user_companies').insert({ company_id: id, relation: 'target' });
    expect(dup.error).not.toBeNull();
  });

  it('watch_company on a company the user marked dream keeps dream', async () => {
    const co = await admin
      .from('companies')
      .insert({ name: 'Test- Scoring Dream', normalized_name: 'test-scoring dream' })
      .select('id')
      .single();
    expect(co.error).toBeNull();
    const id = co.data!.id as string;
    expect((await b.client.from('user_companies').insert({ company_id: id, relation: 'dream' })).error).toBeNull();
    const w = await b.client.rpc('watch_company', {
      p_name: 'Test- Scoring Dream',
      p_careers_url: null as unknown as string,
      p_ats: null as unknown as string,
      p_token: null as unknown as string,
      p_meta: {},
    });
    expect(w.error).toBeNull();
    const rows = await admin.from('user_companies').select('relation').eq('user_id', b.id).eq('company_id', id);
    expect(rows.data).toEqual([{ relation: 'dream' }]);
  });
});

describe('pay_year_cents', () => {
  it('converts hourly to yearly and nulls bad input', async () => {
    const f = (cents: number | null, period: string | null) =>
      a.client.rpc('pay_year_cents', { cents: cents as number, period: period as string });
    expect((await f(2500, 'hour')).data).toBe(5200000);
    expect((await f(5000000, 'year')).data).toBe(5000000);
    expect((await f(0, 'year')).data).toBeNull();
    expect((await f(null, 'hour')).data).toBeNull();
  });
});

describe('ai_jobs', () => {
  it("an ai_jobs row for another user's id is refused by RLS", async () => {
    const r = await a.client.from('ai_jobs').insert({ user_id: b.id, kind: 'score_fit', posting_id: postingId });
    expect(r.error).not.toBeNull();
  });

  it('a duplicate score_fit job for the same posting is refused', async () => {
    const one = await a.client.from('ai_jobs').insert({ kind: 'score_fit', posting_id: postingId });
    expect(one.error).toBeNull();
    const two = await a.client.from('ai_jobs').insert({ kind: 'score_fit', posting_id: postingId });
    expect(two.error).not.toBeNull();
  });

  it('claim_ai_jobs is not executable by authenticated, but works for service_role', async () => {
    const denied = await a.client.rpc('claim_ai_jobs', { p_limit: 1, p_worker: 'x' });
    expect(denied.error).not.toBeNull();
    // claim_ai_jobs takes any user's queued jobs, so only call it while no real job could be claimed.
    const others = await admin
      .from('ai_jobs')
      .select('id', { count: 'exact', head: true })
      .not('user_id', 'in', `(${a.id},${b.id})`)
      .in('status', ['queued', 'claimed']);
    expect(others.error).toBeNull();
    if ((others.count ?? 0) > 0) return;
    const ok = await admin.rpc('claim_ai_jobs', { p_limit: 10, p_worker: 'test-worker' });
    expect(ok.error).toBeNull();
    const mine = (ok.data as { user_id: string; status: string; claimed_by: string }[]).filter((j) => j.user_id === a.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: 'claimed', claimed_by: 'test-worker' });
  });
});
