import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { normalizeCompany } from '../../src/lib/companies/normalize';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

const admin = adminClient();
type U = Awaited<ReturnType<typeof createTestUser>>;
let a: U;
let b: U;
const watch = (u: U, name: string, ats: string | null = null, token: string | null = null, url: string | null = null) =>
  u.client.rpc('watch_company', {
    p_name: name,
    p_careers_url: url as string,
    p_ats: ats as string,
    p_token: token as string,
    p_meta: {},
  });

beforeAll(async () => {
  a = await createTestUser('watch-a');
  b = await createTestUser('watch-b');
});

afterAll(async () => {
  // user_companies rows cascade with the users; then the shared test companies.
  for (const u of [a, b]) if (u) await deleteTestUser(u.id, u.email);
  const del = await admin.from('companies').delete().like('name', 'Test- %');
  if (del.error) throw new Error(del.error.message);
});

describe('normalize_company', () => {
  const names = [
    'Acme, Inc.', 'ACME Corporation', 'Acme Group Holdings Inc', 'Johnson & Johnson', 'Company',
    "Macy's", 'Macy’s', 'U.S. Bank', 'Bain & Co', 'AT&T', '  Test-   Spaced   Out  LLC ',
    'Société Générale S.A.',
  ];
  it('agrees with normalizeCompany on 12 names', async () => {
    expect(names).toHaveLength(12);
    for (const n of names) {
      const { data, error } = await a.client.rpc('normalize_company', { p_name: n });
      expect(error).toBeNull();
      expect(data, n).toBe(normalizeCompany(n));
    }
  });
});

describe('watch_company', () => {
  it('creates one company and one user_companies row', async () => {
    const { data: id, error } = await watch(a, 'Test- Example Co');
    expect(error).toBeNull();
    const cos = await admin.from('companies').select('id, normalized_name, coverage, resolved_at').eq('normalized_name', 'test example');
    expect(cos.data).toHaveLength(1);
    expect(cos.data![0]).toMatchObject({ id, coverage: 'unknown', resolved_at: null });
    const uc = await admin.from('user_companies').select('relation').eq('user_id', a.id).eq('company_id', id as string);
    expect(uc.data).toEqual([{ relation: 'target' }]);
    // Repeat add is a no-op.
    expect((await watch(a, 'Test- Example Co')).error).toBeNull();
    const again = await admin.from('user_companies').select('id').eq('user_id', a.id);
    expect(again.data).toHaveLength(1);
  });

  it('shares one company between two users using different spellings', async () => {
    const one = await watch(a, 'Test- Shared, Inc.');
    const two = await watch(b, 'TEST- SHARED');
    expect(one.error).toBeNull();
    expect(two.error).toBeNull();
    expect(two.data).toBe(one.data);
    const co = await admin.from('companies').select('watchers').eq('id', one.data as string).single();
    expect(co.data!.watchers).toBe(2);
  });

  it('writes ATS only for a new or unknown company, never over a covered one', async () => {
    const first = await watch(a, 'Test- Boards Co', 'greenhouse', 'testboards', 'https://boards.greenhouse.io/testboards');
    expect(first.error).toBeNull();
    const row = await admin.from('companies').select('ats, ats_token, coverage').eq('id', first.data as string).single();
    expect(row.data).toMatchObject({ ats: 'greenhouse', ats_token: 'testboards', coverage: 'unknown' });
    // The finder verifies it.
    await admin.from('companies').update({ coverage: 'covered', resolved_at: new Date().toISOString() }).eq('id', first.data as string);
    const second = await watch(b, 'Test- Boards Co', 'lever', 'evil');
    expect(second.error).toBeNull();
    const after = await admin.from('companies').select('ats, ats_token, coverage').eq('id', first.data as string).single();
    expect(after.data).toMatchObject({ ats: 'greenhouse', ats_token: 'testboards', coverage: 'covered' });
  });

  it('rejects a bad name and the 101st company', async () => {
    expect((await watch(a, '   ')).error).not.toBeNull();
    expect((await watch(a, 'x'.repeat(121))).error).not.toBeNull();
    const user = await createTestUser('watch-limit');
    try {
      const rows = Array.from({ length: 100 }, (_, i) => ({ name: `Test- Limit ${i}`, normalized_name: `test-limit ${i}` }));
      const ins = await admin.from('companies').insert(rows).select('id');
      expect(ins.error).toBeNull();
      const links = ins.data!.map((c) => ({ user_id: user.id, company_id: c.id, relation: 'target' as const }));
      expect((await admin.from('user_companies').insert(links)).error).toBeNull();
      const over = await watch(user, 'Test- Limit Extra');
      expect(over.error?.message).toContain('limit');
    } finally {
      await deleteTestUser(user.id, user.email);
    }
  });

  it('is not executable by anon', async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await anon.rpc('watch_company', {
      p_name: 'Test- Anon', p_careers_url: null as unknown as string, p_ats: null as unknown as string,
      p_token: null as unknown as string, p_meta: {},
    });
    expect(error).not.toBeNull();
  });

  it('remove deletes only the caller row; the company remains', async () => {
    const id = (await watch(a, 'Test- Shared')).data as string;
    const del = await a.client.from('user_companies').delete().eq('company_id', id);
    expect(del.error).toBeNull();
    const mine = await admin.from('user_companies').select('id').eq('user_id', a.id).eq('company_id', id);
    const theirs = await admin.from('user_companies').select('id').eq('user_id', b.id).eq('company_id', id);
    expect(mine.data).toHaveLength(0);
    expect(theirs.data).toHaveLength(1);
    expect((await admin.from('companies').select('id').eq('id', id)).data).toHaveLength(1);
  });
});
