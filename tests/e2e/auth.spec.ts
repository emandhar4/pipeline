import { expect, test, type Page } from '@playwright/test';
import { adminClient, createTestUser, deleteTestUser } from '../integration/helpers';

type TestUser = { id: string; email: string };
const users: TestUser[] = [];

async function newUser(tag: string): Promise<TestUser> {
  const { id, email } = await createTestUser(tag);
  users.push({ id, email });
  return { id, email };
}

async function magicLinkHash(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error || !data.properties) throw new Error(`generateLink failed: ${error?.message}`);
  return data.properties.hashed_token;
}

async function signIn(page: Page, email: string, next = '/dashboard') {
  const hash = await magicLinkHash(email);
  await page.goto(
    `/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=magiclink&next=${encodeURIComponent(next)}`,
  );
}

test.afterAll(async () => {
  const errors: unknown[] = [];
  for (const u of users.splice(0)) {
    await deleteTestUser(u.id, u.email).catch((e: unknown) => errors.push(e));
  }
  if (errors.length) throw new AggregateError(errors, 'e2e test user cleanup failed');
});

test('signed-out user is sent to login and back', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toBeVisible();

  const user = await newUser('e2e-login');
  await signIn(page, user.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(user.email)).toBeVisible();
});

test('sign out returns to login', async ({ page }) => {
  const user = await newUser('e2e-signout');
  await signIn(page, user.email);
  await expect(page.getByText(user.email)).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});

test('next cannot redirect off-site', async ({ page, baseURL }) => {
  const user = await newUser('e2e-next');
  for (const next of ['https://evil.com', '//evil.com', '/\\evil.com']) {
    await page.context().clearCookies();
    await signIn(page, user.email, next);
    expect(page.url().startsWith(baseURL!)).toBe(true);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  // A signed-in visit to /login?next=<off-site> also stays on-site.
  await page.goto('/login?next=https://evil.com');
  expect(page.url().startsWith(baseURL!)).toBe(true);
});
