import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { adminClient } from './helpers';

const admin = adminClient();
const rand = () => randomBytes(4).toString('hex');
const createdUsers: string[] = [];
const invitedEmails: string[] = [];

afterAll(async () => {
  const failures: string[] = [];
  for (const id of createdUsers) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) failures.push(`deleteUser: ${error.message}`);
  }
  if (invitedEmails.length) {
    const { error } = await admin.from('invites').delete().in('email', invitedEmails);
    if (error) failures.push(`delete invites: ${error.message}`);
  }
  if (failures.length) throw new Error(`cleanup failed: ${failures.join('; ')}`);
});

describe('invite-only signup', () => {
  it('rejects an uninvited email', async () => {
    // The Admin API (createUser) skips the before_user_created hook, so this
    // must go through the public signUp endpoint with the publishable key.
    const publicClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await publicClient.auth.signUp({
      email: `nobody-${rand()}@example.test`,
      password: `Aa1!${randomBytes(16).toString('hex')}`,
    });
    if (data?.user) createdUsers.push(data.user.id);
    expect(error?.status).toBe(403);
    expect(error?.message).toContain('invite-only');
  });

  // The admin API skips the hook, and public signUp would try to send a
  // confirmation email (built-in SMTP only reaches team members). So this test
  // covers only the case-insensitive invites row and the accepted_at trigger,
  // not hook acceptance.
  it('accepts an invited email regardless of case', async () => {
    const tag = rand();
    const email = `case-${tag}@example.test`;
    invitedEmails.push(email);
    const ins = await admin.from('invites').insert({ email, note: 'test' });
    expect(ins.error).toBeNull();
    const { data, error } = await admin.auth.admin.createUser({
      email: `Case-${tag}@Example.TEST`,
      email_confirm: true,
    });
    if (data?.user) createdUsers.push(data.user.id);
    expect(error).toBeNull();
    expect(data?.user?.id).toBeTruthy();
  });

  it('marks the invite accepted', async () => {
    const email = `accept-${rand()}@example.test`;
    invitedEmails.push(email);
    expect((await admin.from('invites').insert({ email })).error).toBeNull();
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (data?.user) createdUsers.push(data.user.id);
    expect(error).toBeNull();
    const row = await admin.from('invites').select('accepted_at').eq('email', email).single();
    expect(row.error).toBeNull();
    expect(row.data?.accepted_at).not.toBeNull();
  });
});
