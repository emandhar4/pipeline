import { expect, test } from '@playwright/test';
import { adminClient } from '../integration/helpers';
import { markOnboarded, signIn, userPool, type TestUser } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const pool = userPool();
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
    const { error } = await adminClient().from('companies').delete().like('name', 'Test- %');
    if (error) throw new Error(`company cleanup failed: ${error.message}`);
  }
});

test('add by name, reject a bad link, remove', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, user.email, '/profile');
  const section = page.getByRole('region', { name: 'Companies to watch' });
  await expect(section).toBeVisible();

  await section.getByLabel('Company name').fill('Test- Example Co');
  await section.getByRole('button', { name: 'Add company' }).click();
  const item = section.getByRole('listitem').filter({ hasText: 'Test- Example Co' });
  await expect(item).toContainText('Checking in the next run');

  await section.getByLabel('Company name').fill('Test- Other Co');
  await section.getByLabel(/Careers page link/).fill('javascript:x');
  await section.getByRole('button', { name: 'Add company' }).click();
  await expect(
    section.getByText("That link isn't a careers page Pipeline can read. Leave it blank and we'll search by name."),
  ).toBeVisible();
  await expect(section.getByRole('listitem').filter({ hasText: 'Test- Other Co' })).toHaveCount(0);
  // The failed attempt keeps what was typed.
  await expect(section.getByLabel('Company name')).toHaveValue('Test- Other Co');
  await expect(section.getByLabel(/Careers page link/)).toHaveValue('javascript:x');

  await item.getByRole('button', { name: 'Remove Test- Example Co' }).click();
  await expect(section.getByText('Test- Example Co')).toHaveCount(0);
});
