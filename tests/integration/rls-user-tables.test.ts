import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

describe('per-user tables RLS', () => {
  let a: TestUser;
  let b: TestUser;
  const resumeRuleIds: string[] = [];

  beforeAll(async () => {
    a = await createTestUser('rls-a');
    b = await createTestUser('rls-b');
  });

  afterAll(async () => {
    const admin = adminClient();
    for (const id of resumeRuleIds) await admin.from('resume_rules').delete().eq('id', id);
    if (a) await deleteTestUser(a.id);
    if (b) await deleteTestUser(b.id);
  });

  async function expectIsolated(table: string, row: Record<string, unknown>, change: Record<string, unknown>) {
    const ins = await a.client.from(table).insert(row).select().single();
    expect(ins.error).toBeNull();
    const id = ins.data!.id as string;

    const read = await b.client.from(table).select('*');
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const upd = await b.client.from(table).update(change).eq('id', id).select();
    expect(upd.error).toBeNull();
    expect(upd.data).toEqual([]);

    const own = await a.client.from(table).select('*').eq('id', id).single();
    expect(own.data).toMatchObject(row);
  }

  it('user A cannot read or write user B rows', async () => {
    await expectIsolated('contacts', { name: 'Alice Recruiter' }, { name: 'hijacked' });
    await expectIsolated(
      'applications',
      { company_name: 'Acme', title: 'Intern', stage: 'saved' },
      { title: 'hijacked' },
    );
    await expectIsolated(
      'experience_items',
      { kind: 'project', title: 'Thing' },
      { title: 'hijacked' },
    );
  });

  it('creating a user creates a profile', async () => {
    const { data, error } = await b.client.from('profiles').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].onboarding_step).toBe(0);
  });

  it('global default resume rules are readable, not writable', async () => {
    const admin = adminClient();
    const ins = await admin
      .from('resume_rules')
      .insert({ user_id: null, rules: { test: true }, version: 1 })
      .select()
      .single();
    expect(ins.error).toBeNull();
    resumeRuleIds.push(ins.data!.id);

    const read = await a.client.from('resume_rules').select('*').eq('id', ins.data!.id);
    expect(read.data).toHaveLength(1);

    const upd = await a.client
      .from('resume_rules')
      .update({ version: 99 })
      .eq('id', ins.data!.id)
      .select();
    expect(upd.data).toEqual([]);
  });

  it('backfill covered pre-existing users', async () => {
    const admin: SupabaseClient = adminClient();
    const users: string[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      expect(error).toBeNull();
      users.push(...data.users.map((u) => u.id));
      if (data.users.length < 200) break;
    }
    const { data } = await admin.from('profiles').select('user_id');
    const have = new Set((data ?? []).map((p) => p.user_id));
    expect(users.filter((id) => !have.has(id))).toHaveLength(0);
  });
});
