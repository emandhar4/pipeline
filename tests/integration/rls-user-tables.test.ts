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
    const jobs: Promise<unknown>[] = resumeRuleIds.map(async (id) => {
      const { error } = await admin.from('resume_rules').delete().eq('id', id);
      if (error) throw new Error(`resume_rules cleanup failed: ${error.message}`);
    });
    if (a) jobs.push(deleteTestUser(a.id));
    if (b) jobs.push(deleteTestUser(b.id));
    const failed = (await Promise.allSettled(jobs)).filter((r) => r.status === 'rejected');
    if (failed.length) throw new AggregateError(failed.map((f) => f.reason), 'cleanup failed');
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
      .insert({ user_id: null, rules: { __test__: true }, version: 1 })
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
    const { data, error } = await admin.rpc('count_users_without_profile');
    expect(error).toBeNull();
    expect(Number(data)).toBe(0);
  });
});
