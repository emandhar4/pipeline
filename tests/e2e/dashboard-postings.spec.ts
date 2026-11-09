import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { adminClient } from '../integration/helpers';
import { markOnboarded, signIn, userPool, type TestUser } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const pool = userPool();
const suffix = randomBytes(4).toString('hex');
const postingIds: string[] = [];
let complete: TestUser;
let incomplete: TestUser;

const POSTING = {
  company_name: 'Test Co',
  locations: ['San Jose, CA'],
  states: ['CA'],
  countries: ['US'],
  remote: 'onsite',
  level: 'internship',
  terms: [] as string[],
  field_slugs: ['software-engineering'],
  location_unknown: false,
  status: 'new',
};

test.beforeAll(async () => {
  const admin = adminClient();
  complete = await pool.newUser('e2e-postings');
  incomplete = await pool.newUser('e2e-postings-gap');
  await markOnboarded(complete.id);
  await markOnboarded(incomplete.id);

  const profile = await admin
    .from('profiles')
    .update({
      career_stage: 'intern',
      work_style: 'in_person',
      work_states: ['CA'],
      work_anywhere_us: false,
      work_countries: [],
      season: 'Summer 2027',
    })
    .eq('user_id', complete.id);
  if (profile.error) throw new Error(`profile update failed: ${profile.error.message}`);

  const fields = await admin.from('profile_fields').insert([
    {
      user_id: complete.id,
      category_slug: 'software-engineering',
      label: 'Software Engineering',
      weight: 'primary',
    },
    {
      user_id: incomplete.id,
      category_slug: 'software-engineering',
      label: 'Software Engineering',
      weight: 'primary',
    },
  ]);
  if (fields.error) throw new Error(`fields insert failed: ${fields.error.message}`);

  const inserted = await admin
    .from('postings')
    .insert([
      {
        ...POSTING,
        dedupe_key: `test:e2e-pass-${suffix}`,
        title: `Software Engineering Intern ${suffix}`,
        apply_url: `https://example.test/apply/${suffix}`,
      },
      {
        ...POSTING,
        dedupe_key: `test:e2e-fail-${suffix}`,
        title: `Warehouse Associate ${suffix}`,
        apply_url: `https://example.test/other/${suffix}`,
        field_slugs: [],
      },
    ])
    .select('id');
  if (inserted.error) throw new Error(`postings insert failed: ${inserted.error.message}`);
  postingIds.push(...inserted.data.map((r: { id: string }) => r.id));

  const refreshed = await admin.rpc('refresh_matches', { p_user: complete.id });
  if (refreshed.error) throw new Error(`refresh_matches failed: ${refreshed.error.message}`);
});

test.afterAll(async () => {
  try {
    if (postingIds.length) {
      await adminClient().from('postings').delete().in('id', postingIds);
    }
  } finally {
    await pool.cleanup();
  }
});

test('a complete profile sees the one passing posting with its Apply link', async ({ page }) => {
  await signIn(page, complete.email);
  const panel = page.getByRole('region', { name: 'New postings worth it' });
  const link = panel.getByRole('link', { name: `Software Engineering Intern ${suffix}` });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `https://example.test/apply/${suffix}`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const row = panel.locator('li').filter({ hasText: `Software Engineering Intern ${suffix}` });
  await expect(row.getByText('Test Co, San Jose, CA')).toBeVisible();
  await expect(row.getByText('New', { exact: true })).toBeVisible();
  await expect(panel.getByText(`Warehouse Associate ${suffix}`)).toHaveCount(0);
  await expect(panel.getByText('Finish your profile')).toHaveCount(0);
});

test('a profile with no work style is asked to finish it', async ({ page }) => {
  await signIn(page, incomplete.email);
  const panel = page.getByRole('region', { name: 'New postings worth it' });
  const link = panel.getByRole('link', { name: /Finish your profile to see matching postings/ });
  await expect(link).toBeVisible();
  await expect(link).toContainText('work style');
  await expect(link).toHaveAttribute('href', '/profile');
  await expect(panel.getByRole('link', { name: /Software Engineering Intern/ })).toHaveCount(0);
});
