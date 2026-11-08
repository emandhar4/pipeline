import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

describe('global tables, matches and AI queue', () => {
  let a: TestUser;
  let b: TestUser;
  const suffix = randomBytes(4).toString('hex');
  const companyIds: string[] = [];
  const postingIds: string[] = [];

  async function makeCompany(tag: string): Promise<string> {
    const name = `__test__ ${tag} ${suffix}`;
    const { data, error } = await adminClient()
      .from('companies')
      .insert({ name, normalized_name: name.toLowerCase() })
      .select()
      .single();
    expect(error).toBeNull();
    companyIds.push(data!.id);
    return data!.id;
  }

  async function makePosting(companyId: string, tag: string, extra: Record<string, unknown> = {}) {
    return adminClient()
      .from('postings')
      .insert({
        company_id: companyId,
        company_name: `__test__ ${tag}`,
        title: 'Test Intern',
        apply_url: 'https://example.test/apply',
        dedupe_key: `__test__-${tag}-${suffix}`,
        ...extra,
      })
      .select()
      .single();
  }

  beforeAll(async () => {
    a = await createTestUser('glob-a');
    b = await createTestUser('glob-b');
  });

  afterAll(async () => {
    const admin = adminClient();
    // Deleting users cascades their matches and jobs; postings must go before companies.
    const userJobs: Promise<unknown>[] = [];
    if (a) userJobs.push(deleteTestUser(a.id, a.email));
    if (b) userJobs.push(deleteTestUser(b.id, b.email));
    const failed = (await Promise.allSettled(userJobs)).filter((r) => r.status === 'rejected');
    const errors: unknown[] = failed.map((f) => (f as PromiseRejectedResult).reason);
    for (const id of postingIds) {
      const { error } = await admin.from('postings').delete().eq('id', id);
      if (error) errors.push(new Error(`postings cleanup failed: ${error.message}`));
    }
    for (const id of companyIds) {
      const { error } = await admin.from('companies').delete().eq('id', id);
      if (error) errors.push(new Error(`companies cleanup failed: ${error.message}`));
    }
    if (errors.length) throw new AggregateError(errors, 'cleanup failed');
  });

  it('authenticated users can read postings but not write them', async () => {
    const companyId = await makeCompany('read');
    const posting = await makePosting(companyId, 'read');
    expect(posting.error).toBeNull();
    postingIds.push(posting.data!.id);

    const read = await a.client.from('postings').select('*').eq('id', posting.data!.id);
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(1);

    const ins = await a.client.from('postings').insert({
      company_name: '__test__ nope',
      title: 'x',
      dedupe_key: `__test__-nope-${suffix}`,
    });
    expect(ins.error).not.toBeNull();

    const upd = await a.client
      .from('postings')
      .update({ title: 'hijacked' })
      .eq('id', posting.data!.id)
      .select();
    // Write privileges are revoked, so this errors; an RLS-only setup would return 0 rows.
    expect(upd.data ?? []).toEqual([]);

    const del = await a.client.from('postings').delete().eq('id', posting.data!.id).select();
    expect(del.data ?? []).toEqual([]);

    const still = await adminClient().from('postings').select('title').eq('id', posting.data!.id).single();
    expect(still.data!.title).toBe('Test Intern');
  });

  it('posting_matches are private', async () => {
    const companyId = await makeCompany('match');
    const posting = await makePosting(companyId, 'match');
    expect(posting.error).toBeNull();
    postingIds.push(posting.data!.id);

    const ins = await adminClient()
      .from('posting_matches')
      .insert({ user_id: a.id, posting_id: posting.data!.id, passed_filter: true, base_score: 0.5 });
    expect(ins.error).toBeNull();

    const own = await a.client.from('posting_matches').select('*');
    expect(own.data).toHaveLength(1);
    const other = await b.client.from('posting_matches').select('*');
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  });

  it('users can queue AI jobs but cannot complete them', async () => {
    const ins = await a.client
      .from('ai_jobs')
      .insert({ kind: 'score_fit', input: {} })
      .select()
      .single();
    expect(ins.error).toBeNull();
    expect(ins.data!.status).toBe('queued');
    const id = ins.data!.id as string;

    // Cannot insert a job that is already done.
    const forged = await a.client
      .from('ai_jobs')
      .insert({ kind: 'score_fit', input: {}, status: 'done', result: { ok: true } });
    expect(forged.error).not.toBeNull();

    const upd = await a.client
      .from('ai_jobs')
      .update({ status: 'done', result: { forged: true } })
      .eq('id', id)
      .select();
    expect(upd.error).not.toBeNull();

    const check = await a.client.from('ai_jobs').select('status,result').eq('id', id).single();
    expect(check.data).toMatchObject({ status: 'queued', result: null });

    // B cannot see it.
    const other = await b.client.from('ai_jobs').select('*');
    expect(other.data).toEqual([]);

    // Service role can still complete it.
    const done = await adminClient()
      .from('ai_jobs')
      .update({ status: 'done', result: { ok: true }, completed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    expect(done.error).toBeNull();
    expect(done.data!.status).toBe('done');
  });

  it('snippet longer than 1000 chars is rejected', async () => {
    const companyId = await makeCompany('snippet');
    const tooLong = await makePosting(companyId, 'snippet', { snippet: 'x'.repeat(1001) });
    expect(tooLong.error).not.toBeNull();
    const ok = await makePosting(companyId, 'snippet', { snippet: 'x'.repeat(1000) });
    expect(ok.error).toBeNull();
    postingIds.push(ok.data!.id);
  });
});
