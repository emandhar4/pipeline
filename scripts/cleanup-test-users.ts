// Usage: npx tsx scripts/cleanup-test-users.ts [--dry-run]
// Deletes test auth users and invites whose email ends in @example.test. Nothing else.
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const TEST_SUFFIX = '@example.test';
const dryRun = process.argv.slice(2).includes('--dry-run');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

function isTestEmail(email: string | null | undefined): email is string {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(TEST_SUFFIX);
}

/** Hard stop: refuse to continue if any selected email is not a test address. */
function assertAllTest(emails: (string | null | undefined)[], what: string): void {
  const bad = emails.filter((e) => !isTestEmail(e));
  if (bad.length) {
    throw new Error(`Refusing to continue: ${bad.length} ${what} selected without ${TEST_SUFFIX}`);
  }
}

async function main(): Promise<void> {
  const admin = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });

  const users: { id: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) if (isTestEmail(u.email)) users.push({ id: u.id, email: u.email });
    if (data.users.length < 1000) break;
  }
  assertAllTest(users.map((u) => u.email), 'auth users');

  const invites = await admin.from('invites').select('email').ilike('email', `%${TEST_SUFFIX}`);
  if (invites.error) throw new Error(`read invites failed: ${invites.error.message}`);
  // ilike treats _ as a wildcard, so filter again in code before trusting the list.
  const inviteEmails = invites.data.map((r) => r.email as string).filter(isTestEmail);
  assertAllTest(inviteEmails, 'invites');

  console.log(`Test auth users: ${users.length}`);
  console.log(`Test invites: ${inviteEmails.length}`);
  if (dryRun) {
    console.log('Dry run: nothing deleted.');
    return;
  }

  let failed = 0;
  for (const u of users) {
    assertAllTest([u.email], 'auth users');
    // Remove this test user's resume objects before the user itself.
    const bucket = admin.storage.from('resumes');
    let storageFailed = false;
    for (;;) {
      const listed = await bucket.list(u.id, { limit: 100 });
      if (listed.error) { storageFailed = true; break; }
      if (listed.data.length === 0) break;
      const removed = await bucket.remove(listed.data.map((o) => `${u.id}/${o.name}`));
      if (removed.error) { storageFailed = true; break; }
    }
    if (storageFailed) { failed++; continue; }
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) failed++;
  }
  for (const email of inviteEmails) {
    assertAllTest([email], 'invites');
    const { error } = await admin.from('invites').delete().eq('email', email);
    if (error) failed++;
  }
  console.log(`Deleted ${users.length + inviteEmails.length - failed} rows; ${failed} failed.`);
  if (failed) process.exit(1);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
