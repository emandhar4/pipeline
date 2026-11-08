import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

let user: { id: string; email: string; client: SupabaseClient };
let anon: SupabaseClient;
let schoolsSeeded = false;

beforeAll(async () => {
  user = await createTestUser('lookups');
  anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { count, error } = await adminClient().from('schools').select('*', { count: 'exact', head: true });
  if (error) throw new Error(`schools count failed: ${error.message}`);
  schoolsSeeded = (count ?? 0) > 0;
});

afterAll(async () => {
  if (user) await deleteTestUser(user.id, user.email);
});

const names = (rows: { name: string }[] | null) => (rows ?? []).map((r) => r.name);

describe('search_schools', () => {
  // skipIf would be evaluated before beforeAll runs, so skip at runtime instead.
  it('finds Georgia Tech in the top 3', async (ctx) => {
    if (!schoolsSeeded) return ctx.skip();
    const { data, error } = await user.client.rpc('search_schools', { q: 'georgia tech' });
    expect(error).toBeNull();
    expect(names(data).slice(0, 3).some((n) => n.startsWith('Georgia Institute of Technology'))).toBe(true);
  });

  it('ohio state returns at most 8 rows, first is Ohio State University', async (ctx) => {
    if (!schoolsSeeded) return ctx.skip();
    const { data, error } = await user.client.rpc('search_schools', { q: 'ohio state' });
    expect(error).toBeNull();
    expect(data.length).toBeLessThanOrEqual(8);
    expect(names(data)[0]).toContain('Ohio State University');
  });

  for (const q of ['%', '_', '  ', '\t\n', 'x'.repeat(500)]) {
    it(`returns [] without error for ${JSON.stringify(q.length > 10 ? q.slice(0, 5) + '...' : q)}`, async () => {
      const { data, error } = await user.client.rpc('search_schools', { q });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  }

  it('is denied to anon', async () => {
    const { error } = await anon.rpc('search_schools', { q: 'georgia' });
    expect(error).not.toBeNull();
  });
});

describe('search_majors', () => {
  it('finds supply chain (52.0203)', async () => {
    const { data, error } = await user.client.rpc('search_majors', { q: 'supply chain' });
    expect(error).toBeNull();
    expect((data as { cip_code: string }[]).map((r) => r.cip_code)).toContain('52.0203');
  });

  it('econ puts an Economics title first', async () => {
    const { data, error } = await user.client.rpc('search_majors', { q: 'econ' });
    expect(error).toBeNull();
    expect((data as { title: string }[])[0].title.startsWith('Economics')).toBe(true);
  });

  it('treats % and _ literally', async () => {
    for (const q of ['%', '_']) {
      const { data, error } = await user.client.rpc('search_majors', { q });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });
});

describe('majors access', () => {
  it('anon cannot read majors', async () => {
    const { data, error } = await anon.from('majors').select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it('authenticated user cannot insert', async () => {
    const { error } = await user.client
      .from('majors')
      .insert({ cip_code: '99.9999', title: 'Test Major', family: '99' });
    expect(error).not.toBeNull();
  });
});
