import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(): SupabaseClient {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), noSession);
}

export async function createTestUser(
  tag: string,
): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const admin = adminClient();
  const email =
    `pipeline-test+${tag}-${randomBytes(4).toString('hex')}@example.test`.toLowerCase();
  const invited = await admin.from('invites').insert({ email, note: 'integration test' });
  if (invited.error) throw new Error(`invite insert failed: ${invited.error.message}`);
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) {
    const cleanup = await admin.from('invites').delete().eq('email', email);
    throw new Error(
      `createUser failed: ${created.error?.message}` +
        (cleanup.error ? `; invite cleanup failed: ${cleanup.error.message}` : ''),
    );
  }
  const id = created.data.user.id;

  try {
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error || !link.data.properties) {
      throw new Error(`generateLink failed: ${link.error?.message}`);
    }
    const client = createClient(
      env('NEXT_PUBLIC_SUPABASE_URL'),
      env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
      noSession,
    );
    const verified = await client.auth.verifyOtp({
      token_hash: link.data.properties.hashed_token,
      type: 'magiclink',
    });
    if (verified.error) throw new Error(`verifyOtp failed: ${verified.error.message}`);
    return { id, email, client };
  } catch (err) {
    const problems: unknown[] = [err];
    const del = await admin.auth.admin.deleteUser(id).catch((e: unknown) => ({ error: e }));
    if (del.error) problems.push(new Error(`cleanup deleteUser failed: ${String(del.error)}`));
    const inv = await admin.from('invites').delete().eq('email', email);
    if (inv.error) problems.push(new Error(`cleanup invite delete failed: ${inv.error.message}`));
    if (problems.length === 1) throw err;
    throw new AggregateError(problems, 'createTestUser failed and cleanup was incomplete');
  }
}

/** Removes every object under resumes/<userId>/ (admin only). */
export async function removeUserResumeObjects(userId: string): Promise<void> {
  const bucket = adminClient().storage.from('resumes');
  for (;;) {
    const listed = await bucket.list(userId, { limit: 100 });
    if (listed.error) throw new Error(`list resumes failed: ${listed.error.message}`);
    if (listed.data.length === 0) return;
    const removed = await bucket.remove(listed.data.map((o) => `${userId}/${o.name}`));
    if (removed.error) throw new Error(`remove resumes failed: ${removed.error.message}`);
  }
}

export async function deleteTestUser(id: string, email: string): Promise<void> {
  const admin = adminClient();
  const errors: Error[] = [];
  // Storage objects first; deleting the user does not cascade into Storage.
  await removeUserResumeObjects(id);
  const del = await admin.auth.admin.deleteUser(id);
  if (del.error) errors.push(new Error(`deleteUser failed: ${del.error.message}`));
  const inv = await admin.from('invites').delete().eq('email', email.toLowerCase());
  if (inv.error) errors.push(new Error(`delete invite failed: ${inv.error.message}`));
  if (errors.length) throw new AggregateError(errors, 'deleteTestUser failed');
}
