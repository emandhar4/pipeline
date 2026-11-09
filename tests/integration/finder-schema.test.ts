import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe('finder schema', () => {
  const admin = adminClient();
  const suffix = randomBytes(4).toString('hex');
  const postingIds: string[] = [];
  const runIds: string[] = [];
  const companyIds: string[] = [];
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser('finder');
  });

  afterAll(async () => {
    // posting_matches, posting_sources cascade from postings; run items from runs.
    if (postingIds.length) await admin.from('postings').delete().in('id', postingIds);
    if (runIds.length) await admin.from('finder_runs').delete().in('id', runIds);
    if (companyIds.length) await admin.from('companies').delete().in('id', companyIds);
    if (user) await deleteTestUser(user.id, user.email);
  });

  async function makePosting(tag: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await admin
      .from('postings')
      .insert({
        company_name: 'Test Co',
        title: 'Test Intern',
        dedupe_key: `test:${tag}-${suffix}`,
        ...extra,
      })
      .select()
      .single();
    expect(error).toBeNull();
    postingIds.push(data!.id);
    return data!;
  }

  async function makeSource(postingId: string, scope: string, lastSeen: string, ext: string) {
    const { data, error } = await admin
      .from('posting_sources')
      .insert({
        posting_id: postingId,
        source: 'test',
        scope: `${scope}-${suffix}`,
        external_id: `${ext}-${suffix}`,
        last_seen: lastSeen,
      })
      .select()
      .single();
    expect(error).toBeNull();
    return data!;
  }

  async function makeRun(items: { scope: string; status: 'ok' | 'failed' }[]) {
    const { data: run, error } = await admin
      .from('finder_runs')
      .insert({ trigger: 'test' })
      .select()
      .single();
    expect(error).toBeNull();
    runIds.push(run!.id);
    for (const item of items) {
      const ins = await admin.from('finder_run_items').insert({
        run_id: run!.id,
        source: 'test',
        scope: `${item.scope}-${suffix}`,
        status: item.status,
        error: item.status === 'failed' ? 'boom' : null,
      });
      expect(ins.error).toBeNull();
    }
    return run!;
  }

  async function postingStatus(id: string) {
    const { data } = await admin.from('postings').select('status').eq('id', id).single();
    return data!.status;
  }

  it('finish marks unseen rows of an ok scope gone', async () => {
    const p = await makePosting('gone', { first_seen: ago(3 * DAY), status: 'seen' });
    const src = await makeSource(p.id, 'test:a', ago(DAY), 'g1');
    const run = await makeRun([{ scope: 'test:a', status: 'ok' }]);

    const fin = await admin.rpc('finish_finder_run', { p_run: run.id });
    expect(fin.error).toBeNull();
    expect(await postingStatus(p.id)).toBe('gone');
    const { data: s } = await admin.from('posting_sources').select('gone_at').eq('id', src.id).single();
    expect(s!.gone_at).not.toBeNull();
    const { data: r } = await admin.from('finder_runs').select('*').eq('id', run.id).single();
    expect(r!.status).toBe('finished');
    expect(r!.finished_at).not.toBeNull();
    expect(r!.totals).toMatchObject({ failed_scopes: 0 });
  });

  it('failed scope keeps its postings', async () => {
    const p = await makePosting('failed', { first_seen: ago(3 * DAY), status: 'seen' });
    const src = await makeSource(p.id, 'test:f', ago(DAY), 'f1');
    const run = await makeRun([{ scope: 'test:f', status: 'failed' }]);

    const fin = await admin.rpc('finish_finder_run', { p_run: run.id });
    expect(fin.error).toBeNull();
    expect(await postingStatus(p.id)).toBe('seen');
    const { data: s } = await admin.from('posting_sources').select('gone_at').eq('id', src.id).single();
    expect(s!.gone_at).toBeNull();
    expect((fin.data as { failed_scopes: number }).failed_scopes).toBe(1);
  });

  it('new becomes seen on the next run', async () => {
    const p = await makePosting('newseen', { first_seen: ago(DAY), status: 'new' });
    await makeSource(p.id, 'test:n', ago(-60000), 'n1');
    const run = await makeRun([{ scope: 'test:n', status: 'ok' }]);

    const fin = await admin.rpc('finish_finder_run', { p_run: run.id });
    expect(fin.error).toBeNull();
    expect(await postingStatus(p.id)).toBe('seen');
  });

  it('a posting outside the run scopes keeps status new', async () => {
    const p = await makePosting('outside', { first_seen: ago(DAY), status: 'new' });
    await makeSource(p.id, 'test:other', new Date().toISOString(), 'o1');
    const run = await makeRun([{ scope: 'test:ran', status: 'ok' }]);

    const fin = await admin.rpc('finish_finder_run', { p_run: run.id });
    expect(fin.error).toBeNull();
    expect(await postingStatus(p.id)).toBe('new');
  });

  it('a second live source keeps a posting alive', async () => {
    const p = await makePosting('twosrc', { first_seen: ago(3 * DAY), status: 'seen' });
    await makeSource(p.id, 'test:a2', ago(DAY), 't1');
    await makeSource(p.id, 'test:b2', ago(-60000), 't2');
    const run = await makeRun([
      { scope: 'test:a2', status: 'ok' },
      { scope: 'test:b2', status: 'ok' },
    ]);

    const fin = await admin.rpc('finish_finder_run', { p_run: run.id });
    expect(fin.error).toBeNull();
    expect(await postingStatus(p.id)).toBe('seen');
  });

  it('prune keeps saved matches', async () => {
    const old = ago(61 * DAY);
    const kept = await makePosting('prune-kept', { status: 'gone', last_seen: old });
    const dropped = await makePosting('prune-dropped', { status: 'gone', last_seen: old });
    const m = await admin
      .from('posting_matches')
      .insert({ user_id: user.id, posting_id: kept.id, state: 'saved' });
    expect(m.error).toBeNull();

    const pruned = await admin.rpc('prune_finder_data', { p_key_prefix: 'test:' });
    expect(pruned.error).toBeNull();

    const { data: k } = await admin.from('postings').select('id').eq('id', kept.id);
    const { data: d } = await admin.from('postings').select('id').eq('id', dropped.id);
    expect(k).toHaveLength(1);
    expect(d).toHaveLength(0);
  });

  it('watchers tracks user_companies rows', async () => {
    const name = `test-watch-${suffix}`;
    const { data: c, error } = await admin
      .from('companies')
      .insert({ name, normalized_name: name })
      .select()
      .single();
    expect(error).toBeNull();
    companyIds.push(c!.id);
    expect(c!.watchers).toBe(0);

    const ins = await admin
      .from('user_companies')
      .insert({ user_id: user.id, company_id: c!.id, relation: 'dream' })
      .select()
      .single();
    expect(ins.error).toBeNull();
    const after = await admin.from('companies').select('watchers').eq('id', c!.id).single();
    expect(after.data!.watchers).toBe(1);

    await admin.from('user_companies').delete().eq('id', ins.data!.id);
    const end = await admin.from('companies').select('watchers').eq('id', c!.id).single();
    expect(end.data!.watchers).toBe(0);
  });

  it('authenticated cannot execute finder functions', async () => {
    const fin = await user.client.rpc('finish_finder_run', { p_run: crypto.randomUUID() });
    expect(fin.error).not.toBeNull();
    const pr = await user.client.rpc('prune_finder_data');
    expect(pr.error).not.toBeNull();
  });
});
