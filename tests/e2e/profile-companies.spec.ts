import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { adminClient } from '../integration/helpers';
import { markOnboarded, signIn, userPool, type TestUser } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const pool = userPool();
const suffix = randomBytes(4).toString('hex');
const EXAMPLE_CO = `Test- Example Co ${suffix}`;
const OTHER_CO = `Test- Other Co ${suffix}`;
let user: TestUser;

test.beforeAll(async () => {
  user = await pool.newUser('e2e-companies');
  const { error } = await adminClient()
    .from('profiles')
    .update({
      career_stage: 'intern',
      school: 'Example Community College',
      school_location: 'Springfield, IL',
      school_state: 'IL',
      work_auth: 'citizen_or_pr',
      work_style: 'remote_only',
    })
    .eq('user_id', user.id);
  if (error) throw new Error(`seed profile failed: ${error.message}`);
  await markOnboarded(user.id);
});

test.afterAll(async () => {
  try {
    await pool.cleanup();
  } finally {
    // Names are 'Test- …' so the shared rows never touch real companies.
    const { error } = await adminClient().from('companies').delete().in('name', [EXAMPLE_CO, OTHER_CO]);
    if (error) throw new Error(`company cleanup failed: ${error.message}`);
  }
});

test('add by name, reject a bad link, remove', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, user.email, '/profile');
  const section = page.getByRole('region', { name: 'Companies to watch' });
  await expect(section).toBeVisible();

  await section.getByLabel('Company name').fill(EXAMPLE_CO);
  await section.getByRole('button', { name: 'Add company' }).click();
  const item = section.getByRole('listitem').filter({ hasText: EXAMPLE_CO });
  await expect(item).toContainText('Checking in the next run');

  await section.getByLabel('Company name').fill(OTHER_CO);
  await section.getByLabel(/Careers page link/).fill('javascript:x');
  await section.getByRole('button', { name: 'Add company' }).click();
  await expect(
    section.getByText("That link isn't a careers page Pipeline can read. Leave it blank and we'll search by name."),
  ).toBeVisible();
  await expect(section.getByRole('listitem').filter({ hasText: OTHER_CO })).toHaveCount(0);
  // The failed attempt keeps what was typed.
  await expect(section.getByLabel('Company name')).toHaveValue(OTHER_CO);
  await expect(section.getByLabel(/Careers page link/)).toHaveValue('javascript:x');

  await item.getByRole('button', { name: `Remove ${EXAMPLE_CO}` }).click();
  await expect(section.getByText(EXAMPLE_CO)).toHaveCount(0);
});
