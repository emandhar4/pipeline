import type { Page } from '@playwright/test';
import { adminClient, createTestUser, deleteTestUser } from '../integration/helpers';

export type TestUser = { id: string; email: string };

/** Tracks the users a spec creates so `cleanupUsers` can delete them in afterAll. */
export function userPool() {
  const users: TestUser[] = [];
  return {
    async newUser(tag: string): Promise<TestUser> {
      const { id, email } = await createTestUser(tag);
      users.push({ id, email });
      return { id, email };
    },
    async cleanup(): Promise<void> {
      const errors: unknown[] = [];
      for (const u of users.splice(0)) {
        await deleteTestUser(u.id, u.email).catch((e: unknown) => errors.push(e));
      }
      if (errors.length) throw new AggregateError(errors, 'e2e test user cleanup failed');
    },
  };
}

/** Marks a test user's onboarding as finished so the dashboard does not redirect. */
export async function markOnboarded(userId: string): Promise<void> {
  const { error } = await adminClient()
    .from('profiles')
    .update({ onboarding_step: 2 })
    .eq('user_id', userId);
  if (error) throw new Error(`markOnboarded failed: ${error.message}`);
}

async function magicLinkHash(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error || !data.properties) throw new Error(`generateLink failed: ${error?.message}`);
  return data.properties.hashed_token;
}

export async function signIn(page: Page, email: string, next = '/dashboard') {
  const hash = await magicLinkHash(email);
  await page.goto(
    `/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=magiclink&next=${encodeURIComponent(next)}`,
  );
}
