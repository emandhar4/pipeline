import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { adminClient, createTestUser, deleteTestUser } from './helpers';

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

const PDF = new TextEncoder().encode('%PDF-1.4\n%%EOF\n');
const pdfOpts = { contentType: 'application/pdf' };

describe('resumes storage bucket', () => {
  let a: TestUser;
  let b: TestUser;
  let aPath: string;
  let aDeleted = false;

  beforeAll(async () => {
    a = await createTestUser('resume-a');
    b = await createTestUser('resume-b');
    aPath = `${a.id}/${randomUUID()}.pdf`;
  });

  afterAll(async () => {
    const jobs: Promise<unknown>[] = [];
    if (a && !aDeleted) jobs.push(deleteTestUser(a.id, a.email));
    if (b) jobs.push(deleteTestUser(b.id, b.email));
    const failed = (await Promise.allSettled(jobs)).filter((r) => r.status === 'rejected');
    if (failed.length) throw new AggregateError(failed.map((f) => f.reason), 'cleanup failed');
  });

  it('lets a user upload a PDF to their own folder', async () => {
    const { error } = await a.client.storage.from('resumes').upload(aPath, PDF, pdfOpts);
    expect(error).toBeNull();
  });

  it("blocks uploading into another user's folder", async () => {
    const { error } = await a.client.storage
      .from('resumes')
      .upload(`${b.id}/${randomUUID()}.pdf`, PDF, pdfOpts);
    expect(error).not.toBeNull();
  });

  it("blocks another user from downloading or listing", async () => {
    const dl = await b.client.storage.from('resumes').download(aPath);
    expect(dl.error).not.toBeNull();
    const ls = await b.client.storage.from('resumes').list(a.id);
    expect(ls.error).toBeNull();
    expect(ls.data).toEqual([]);
  });

  it('blocks anonymous downloads', async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await anon.storage.from('resumes').download(aPath);
    expect(error).not.toBeNull();
  });

  it('rejects non-PDF mime types and files over 5 MB', async () => {
    const text = await a.client.storage
      .from('resumes')
      .upload(`${a.id}/${randomUUID()}.pdf`, new TextEncoder().encode('hello'), {
        contentType: 'text/plain',
      });
    expect(text.error).not.toBeNull();
    const big = await a.client.storage
      .from('resumes')
      .upload(`${a.id}/${randomUUID()}.pdf`, new Uint8Array(5 * 1024 * 1024 + 1), pdfOpts);
    expect(big.error).not.toBeNull();
  });

  it('stores suggestions on a resumes row that other users cannot read', async () => {
    const suggestions = [{ id: 's1', text: 'Quantify impact' }];
    const ins = await a.client
      .from('resumes')
      .insert({ kind: 'uploaded', storage_path: aPath, suggestions })
      .select()
      .single();
    expect(ins.error).toBeNull();
    expect(ins.data?.suggestions).toEqual(suggestions);
    const other = await b.client.from('resumes').select('id').eq('id', ins.data!.id);
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
  });

  it("deleteTestUser removes the user's stored objects", async () => {
    const admin = adminClient();
    const before = await admin.storage.from('resumes').list(a.id);
    expect(before.data?.length).toBeGreaterThan(0);
    const aId = a.id;
    await deleteTestUser(a.id, a.email);
    aDeleted = true;
    const after = await admin.storage.from('resumes').list(aId);
    expect(after.error).toBeNull();
    expect(after.data).toEqual([]);
  });
});
