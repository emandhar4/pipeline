import { randomBytes } from 'node:crypto';
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
    const { data, error } = await admin.auth.admin.createUser({
      email: `nobody-${rand()}@example.test`,
      email_confirm: true,
    });
    if (data?.user) createdUsers.push(data.user.id);
    expect(error?.message).toContain('invite-only');
  });

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
