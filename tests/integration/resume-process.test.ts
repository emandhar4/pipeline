import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { newResumePath } from '@/lib/resume/paths';
import { FICTIONAL_RESUME_LINES, makeResumePdf } from '../fixtures/resume-pdf';
import { createTestUser, deleteTestUser } from './helpers';

// process.ts and its imports are server-only; here they only need the client passed in.
vi.mock('server-only', () => ({}));
const { processResume } = await import('@/lib/resume/process');

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

describe('processResume', () => {
  let user: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    user = await createTestUser('resume-process');
    other = await createTestUser('resume-process-other');
  });

  afterAll(async () => {
    const jobs: Promise<unknown>[] = [];
    if (user) jobs.push(deleteTestUser(user.id, user.email));
    if (other) jobs.push(deleteTestUser(other.id, other.email));
    const failed = (await Promise.allSettled(jobs)).filter((r) => r.status === 'rejected');
    if (failed.length) throw new AggregateError(failed.map((f) => f.reason), 'cleanup failed');
  });

  async function resumeRows(u: TestUser) {
    const { data, error } = await u.client.from('resumes').select('*').eq('user_id', u.id);
    if (error) throw new Error(error.message);
    return data;
  }

  it('reads the fixture into suggestions and stores them without touching the profile', async () => {
    const path = newResumePath(user.id, randomUUID());
    const pdf = await makeResumePdf(FICTIONAL_RESUME_LINES);
    const up = await user.client.storage
      .from('resumes')
      .upload(path, pdf, { contentType: 'application/pdf' });
    expect(up.error).toBeNull();

    const before = await user.client.from('profiles').select('*').eq('user_id', user.id).single();
    expect(before.error).toBeNull();

    const result = await processResume(user.client, user.id, path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.suggestions;

    expect(s.school?.name.startsWith('Georgia Institute of Technology')).toBe(true);
    expect(s.school?.id).not.toBeNull();
    expect(s.school?.state).toBe('GA');
    expect(s.major?.title).toContain('Industrial Engineering');
    expect(s.grad_date).toBe('2027-05');
    expect(s.home_state).toBe('OH');
    expect(s.home_location).toBe('Columbus, OH');
    expect(s.fields.map((f) => [f.slug, f.weight])).toEqual([
      ['supply-chain', 'primary'],
      ['data-analysis', 'secondary'],
    ]);

    const rows = await resumeRows(user);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'uploaded', storage_path: path, suggestions: s });

    const after = await user.client.from('profiles').select('*').eq('user_id', user.id).single();
    expect(after.data).toEqual(before.data);
    const fields = await user.client.from('profile_fields').select('*').eq('user_id', user.id);
    expect(fields.error).toBeNull();
    expect(fields.data).toEqual([]);
  });

  it("refuses a path in another user's folder and stores nothing", async () => {
    const countBefore = (await resumeRows(user)).length;
    const result = await processResume(user.client, user.id, newResumePath(other.id, randomUUID()));
    expect(result).toEqual({
      ok: false,
      message: 'Upload failed. Try again in a minute, or skip this step.',
    });
    expect(await resumeRows(user)).toHaveLength(countBefore);
    expect(await resumeRows(other)).toHaveLength(0);
  });

  it('removes an upload that cannot be read', async () => {
    const path = newResumePath(user.id, randomUUID());
    const pdf = await makeResumePdf([], { blank: true });
    const up = await user.client.storage
      .from('resumes')
      .upload(path, pdf, { contentType: 'application/pdf' });
    expect(up.error).toBeNull();
    const countBefore = (await resumeRows(user)).length;

    const result = await processResume(user.client, user.id, path);
    expect(result.ok).toBe(false);

    const listed = await user.client.storage.from('resumes').list(user.id);
    expect(listed.error).toBeNull();
    expect(listed.data?.map((o) => `${user.id}/${o.name}`)).not.toContain(path);
    expect(await resumeRows(user)).toHaveLength(countBefore);
  });
});
