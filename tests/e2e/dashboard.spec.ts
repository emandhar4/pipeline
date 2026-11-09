import { expect, test, type Page } from '@playwright/test';
import { adminClient } from '../integration/helpers';
import { markOnboarded, signIn, userPool, type TestUser } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const pool = userPool();
let user: TestUser;

// Set SCREENSHOT_DIR to also save /dashboard screenshots (375 and 1280 wide, light and dark).
const shotDir = process.env.SCREENSHOT_DIR;

test.beforeAll(async () => {
  user = await pool.newUser('e2e-dashboard');
  await markOnboarded(user.id);
  const { error } = await adminClient()
    .from('profile_fields')
    .insert({ user_id: user.id, category_slug: null, label: 'Data Analysis', weight: 'primary' });
  if (error) throw new Error(`seed field failed: ${error.message}`);
});

test.afterAll(() => pool.cleanup());

async function shots(page: Page, name: string) {
  if (!shotDir) return;
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: width === 375 ? 900 : 800 });
      await page.screenshot({ path: `${shotDir}/dashboard-${name}-${width}-${scheme}.png`, fullPage: true });
    }
  }
}

test('empty dashboard shows honest empty states and a profile-gap prompt', async ({ page }) => {
  await signIn(page, user.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(
    page.getByText('Nothing due. New tasks appear here as you apply and hear back.'),
  ).toBeVisible();
  await expect(page.getByText(/Finish your profile to see matching postings/)).toBeVisible();
  await expect(page.getByText('Applications you add will show up here.')).toBeVisible();
  await expect(page.getByText('Going stale')).toHaveCount(0);
  await shots(page, 'empty');
});

test('a 31-day-old application appears in the funnel and under Going stale', async ({ page }) => {
  const lastActivity = new Date(Date.now() - 31 * 86_400_000).toISOString();
  const { error } = await adminClient().from('applications').insert({
    user_id: user.id,
    company_name: 'Example Corp',
    title: 'Analyst Intern',
    stage: 'applied',
    channel: 'cold',
    last_activity_at: lastActivity,
  });
  if (error) throw new Error(`seed application failed: ${error.message}`);

  await signIn(page, user.email);
  const health = page.getByRole('region', { name: 'Pipeline health' });
  await expect(health.getByRole('listitem').filter({ hasText: 'Applied' })).toContainText(/Applied\s*1/);
  await expect(health.getByRole('heading', { name: 'Going stale' })).toBeVisible();
  await expect(health.getByText('Example Corp')).toBeVisible();
  await expect(health.getByText('31 days quiet')).toBeVisible();
  await expect(page.getByText('Applications you add will show up here.')).toHaveCount(0);
  await expect(page.getByText(/Finish your profile to see matching postings/)).toBeVisible();
  await shots(page, 'stale');
});
