import { expect, test } from '@playwright/test';
import { adminClient } from '../integration/helpers';
import { markOnboarded, signIn, userPool, type TestUser } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const pool = userPool();
let user: TestUser;

test.beforeAll(async () => {
  user = await pool.newUser('e2e-bar');
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
    const { error } = await adminClient().from('companies').delete().like('name', 'Test- %');
    if (error) throw new Error(`company cleanup failed: ${error.message}`);
  }
});

test('save a bar, see it after reload, remove it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, user.email, '/profile');
  const section = page.getByRole('region', { name: 'Your bar' });
  await expect(section).toBeVisible();

  // An empty bar is refused and announced.
  await section.getByRole('button', { name: 'Save bar' }).click();
  await expect(section.getByText('Add the company, the role or the pay.')).toBeVisible();

  await section.getByLabel('Company').fill('Test- Bar Co');
  await section.getByLabel('Role').fill('Software Engineer Intern');
  await section.getByLabel('Pay').fill('$30/hr');
  await section.getByRole('button', { name: 'Save bar' }).click();
  await expect(section.getByRole('button', { name: 'Remove bar' })).toBeVisible();

  await page.reload();
  const again = page.getByRole('region', { name: 'Your bar' });
  await expect(again.getByLabel('Company')).toHaveValue('Test- Bar Co');
  await expect(again.getByLabel('Role')).toHaveValue('Software Engineer Intern');
  await expect(again.getByLabel('Pay')).toHaveValue('$30/hr');

  await again.getByRole('button', { name: 'Remove bar' }).click();
  await expect(again.getByRole('button', { name: 'Remove bar' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Your bar' }).getByLabel('Company')).toHaveValue('');
});

test('mark a watched company as a dream company and keep it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, user.email, '/profile');
  const section = page.getByRole('region', { name: 'Companies to watch' });
  await section.getByLabel('Company name').fill('Test- Dream Co');
  await section.getByRole('button', { name: 'Add company' }).click();
  const item = section.getByRole('listitem').filter({ hasText: 'Test- Dream Co' });
  await expect(item).toBeVisible();
  const picker = item.getByLabel('Relation to Test- Dream Co');
  await expect(picker).toHaveValue('target');
  await expect(section.getByText("Rejected hides this company's postings. Capped ranks them lower.")).toBeVisible();

  await picker.selectOption({ label: 'Dream company' });
  await expect
    .poll(async () => {
      const { data } = await adminClient().from('user_companies').select('relation').eq('user_id', user.id);
      return data?.[0]?.relation;
    })
    .toBe('dream');

  await page.reload();
  const kept = page
    .getByRole('region', { name: 'Companies to watch' })
    .getByLabel('Relation to Test- Dream Co');
  await expect(kept).toHaveValue('dream');
});
