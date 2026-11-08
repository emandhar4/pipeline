import { expect, test } from '@playwright/test';
import { markOnboarded, signIn, userPool, type TestUser } from './helpers';

const pool = userPool();

/** These tests cover auth, not onboarding, so their users start onboarded. */
async function newUser(tag: string): Promise<TestUser> {
  const user = await pool.newUser(tag);
  await markOnboarded(user.id);
  return user;
}

test.afterAll(() => pool.cleanup());

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
  for (const next of ['https://evil.com', '//evil.com', '/\\evil.com', '/.//evil.com']) {
    await page.context().clearCookies();
    await signIn(page, user.email, next);
    expect(page.url().startsWith(baseURL!)).toBe(true);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  // A signed-in visit to /login?next=<off-site> also stays on-site.
  await page.goto('/login?next=https://evil.com');
  expect(page.url().startsWith(baseURL!)).toBe(true);
});
