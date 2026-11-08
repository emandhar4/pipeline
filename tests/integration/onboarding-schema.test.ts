import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

type TestUser = { id: string; email: string; client: SupabaseClient };

describe('onboarding schema', () => {
  const created: TestUser[] = [];
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    a = await createTestUser('onb-a');
    created.push(a);
    b = await createTestUser('onb-b');
    created.push(b);
  });

  afterAll(async () => {
    for (const u of created) await deleteTestUser(u.id, u.email);
  });

  it('field_categories has the 21 seeded categories, readable by a user', async () => {
    const res = await a.client.from('field_categories').select('slug');
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(21);
    expect(res.data?.map((r) => r.slug)).toContain('supply-chain');
  });

  it('users cannot write field_categories', async () => {
    const res = await a.client.from('field_categories').insert({ slug: 'x', name: 'X', sort: 99 });
    expect(res.error?.code).toBe('42501');
    const count = await adminClient().from('field_categories').select('*', { count: 'exact', head: true });
    expect(count.count).toBe(21);
  });

  it('profile_fields rejects a case-duplicate label for the same user', async () => {
    const first = await a.client
      .from('profile_fields')
      .insert({ label: 'Consulting', weight: 'primary', category_slug: 'consulting' });
    expect(first.error).toBeNull();
    const second = await a.client
      .from('profile_fields')
      .insert({ label: 'consulting', weight: 'secondary' });
    expect(second.error?.code).toBe('23505');
  });

  it('profile_fields requires weight', async () => {
    const res = await a.client.from('profile_fields').insert({ label: 'No Weight' });
    expect(res.error?.code).toBe('23502');
  });

  it("user B cannot read or overwrite A's profile_fields", async () => {
    const admin = adminClient();
    const seeded = await a.client
      .from('profile_fields')
      .insert({ label: 'Isolation Probe', weight: 'primary' })
      .select('id,label')
      .single();
    expect(seeded.error).toBeNull();
    const id = seeded.data!.id as string;
    const label = seeded.data!.label as string;

    const read = await b.client.from('profile_fields').select('id');
    expect(read.error).toBeNull();
    expect(read.data).toHaveLength(0);

    const upd = await b.client.from('profile_fields').update({ label: 'hacked' }).eq('id', id).select();
    expect(upd.data ?? []).toHaveLength(0);

    const after = await admin.from('profile_fields').select('label').eq('id', id).single();
    expect(after.data?.label).toBe(label);
  });

  it('profiles rejects unknown work_auth', async () => {
    const res = await a.client.from('profiles').update({ work_auth: 'x' }).eq('user_id', a.id);
    expect(res.error?.code).toBe('23514');
  });
});
