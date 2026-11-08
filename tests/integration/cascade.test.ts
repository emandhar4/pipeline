import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

const USER_TABLES = [
  'contacts',
  'applications',
  'application_events',
  'tasks',
  'experience_items',
  'posting_matches',
  'ai_jobs',
  'bars',
] as const;

describe('user deletion cascade', () => {
  let user: TestUser | undefined;
  const suffix = randomBytes(4).toString('hex');
  let companyId: string | undefined;
  let postingId: string | undefined;

  beforeAll(async () => {
    user = await createTestUser('cascade');
  });

  afterAll(async () => {
    const admin = adminClient();
    const errors: unknown[] = [];
    if (user) {
      const [r] = await Promise.allSettled([deleteTestUser(user.id, user.email)]);
      if (r.status === 'rejected') errors.push(r.reason);
    }
    if (postingId) {
      const { error } = await admin.from('postings').delete().eq('id', postingId);
      if (error) errors.push(new Error(`postings cleanup failed: ${error.message}`));
    }
    if (companyId) {
      const { error } = await admin.from('companies').delete().eq('id', companyId);
      if (error) errors.push(new Error(`companies cleanup failed: ${error.message}`));
    }
    if (errors.length) throw new AggregateError(errors, 'cleanup failed');
  });

  it('deleting a user removes all their rows', async () => {
    const admin = adminClient();
    const uid = user!.id;
    const ok = (label: string, error: { message: string } | null) =>
      expect(error, `${label}: ${error?.message}`).toBeNull();

    const name = `__test__ cascade ${suffix}`;
    const company = await admin
      .from('companies')
      .insert({ name, normalized_name: name.toLowerCase() })
      .select()
      .single();
    ok('company', company.error);
    companyId = company.data!.id;

    const posting = await admin
      .from('postings')
      .insert({
        company_id: companyId,
        company_name: name,
        title: 'Test Intern',
        apply_url: 'https://example.test/apply',
        dedupe_key: `__test__-cascade-${suffix}`,
      })
      .select()
      .single();
    ok('posting', posting.error);
    postingId = posting.data!.id;

    ok('contacts', (await admin.from('contacts').insert({ user_id: uid, name: 'c' })).error);
    const app = await admin
      .from('applications')
      .insert({ user_id: uid, company_name: name, title: 't' })
      .select()
      .single();
    ok('applications', app.error);
    ok(
      'application_events',
      (
        await admin
          .from('application_events')
          .insert({ user_id: uid, application_id: app.data!.id, kind: 'note' })
      ).error,
    );
    ok('tasks', (await admin.from('tasks').insert({ user_id: uid, title: 't' })).error);
    ok(
      'experience_items',
      (await admin.from('experience_items').insert({ user_id: uid, title: 'e' })).error,
    );
    ok(
      'posting_matches',
      (await admin.from('posting_matches').insert({ user_id: uid, posting_id: postingId })).error,
    );
    ok('ai_jobs', (await admin.from('ai_jobs').insert({ user_id: uid, kind: 'score_fit' })).error);
    ok('bars', (await admin.from('bars').insert({ user_id: uid, company: name })).error);

    // Sanity: every table has exactly one row before deletion.
    for (const table of USER_TABLES) {
      const { count, error } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid);
      ok(`${table} pre-count`, error);
      expect(count, `${table} pre-count`).toBe(1);
    }

    await deleteTestUser(uid, user!.email);
    user = undefined; // already deleted; skip in afterAll

    for (const table of [...USER_TABLES, 'profiles'] as const) {
      const { count, error } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid);
      ok(`${table} post-count`, error);
      expect(count, `${table} should be empty`).toBe(0);
    }
  }, 30_000);
});
