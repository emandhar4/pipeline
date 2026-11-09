import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { adminClient } from '../integration/helpers';
import { markOnboarded, signIn, userPool, type TestUser } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const pool = userPool();
const suffix = randomBytes(4).toString('hex');
// Each Phase 4 user's field matches one token that only their own test titles contain.
const RK = `rk${suffix}`;
const BR = `br${suffix}`;
const postingIds: string[] = [];
let complete: TestUser;
let incomplete: TestUser;
let ranked: TestUser;
let barred: TestUser;

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
      // Free text that only this spec's passing title contains, so real postings never
      // match and never crowd the score-ordered top 20.
      user_id: complete.id,
      category_slug: null,
      label: `Intern ${suffix}`,
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

  // Phase 4: two more users, each with their own set of dated test postings.
  ranked = await pool.newUser('e2e-ranked');
  barred = await pool.newUser('e2e-barred');
  for (const [u, token] of [[ranked, RK], [barred, BR]] as const) {
    await markOnboarded(u.id);
    const pr = await admin
      .from('profiles')
      .update({
        career_stage: 'intern',
        work_style: 'in_person',
        work_states: ['CA'],
        work_anywhere_us: false,
        work_countries: [],
        season: 'Summer 2027',
      })
      .eq('user_id', u.id);
    if (pr.error) throw new Error(`profile update failed: ${pr.error.message}`);
    // A free-text field that only these test postings' titles contain, so real postings
    // never match and never crowd the top 20.
    const f = await admin.from('profile_fields').insert({
      user_id: u.id,
      category_slug: null,
      label: token,
      weight: 'primary',
    });
    if (f.error) throw new Error(`fields insert failed: ${f.error.message}`);
  }

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const dated = (key: string, title: string, age: number, extra: object = {}) => ({
    ...POSTING,
    dedupe_key: `test:e2e-${key}-${suffix}`,
    title,
    apply_url: `https://example.test/${key}/${suffix}`,
    first_seen: daysAgo(age),
    posted_date: daysAgo(age).slice(0, 10),
    field_slugs: [] as string[],
    ...extra,
  });
  const more = await admin
    .from('postings')
    .insert([
      dated('rk-a', `Alpha ${RK}`, 1),
      dated('rk-b', `Beta ${RK}`, 10),
      dated('rk-c', `Gamma ${RK}`, 60),
      // Same field and brand as the bar role; only pay differs.
      dated('br-hi', `High ${BR}`, 1, { pay_min_cents: 9_000_000, pay_max_cents: 10_000_000, pay_period: 'year' }),
      dated('br-lo', `Low ${BR}`, 1, { pay_min_cents: 4_000_000, pay_max_cents: 5_000_000, pay_period: 'year' }),
    ])
    .select('id');
  if (more.error) throw new Error(`postings insert failed: ${more.error.message}`);
  postingIds.push(...more.data.map((r: { id: string }) => r.id));

  const bar = await admin.from('bars').insert({
    user_id: barred.id,
    company: 'Test Bar Co',
    role: `Engineer ${BR}`,
    pay_cents: 3000,
    pay_period: 'hour',
    role_field_slugs: [],
  });
  if (bar.error) throw new Error(`bar insert failed: ${bar.error.message}`);

  for (const u of [ranked, barred]) {
    const r = await admin.rpc('refresh_matches', { p_user: u.id });
    if (r.error) throw new Error(`refresh_matches failed: ${r.error.message}`);
  }
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
  await expect(row.getByText('Test Co · San Jose, CA')).toBeVisible();
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

const cardFor = (page: import('@playwright/test').Page, title: string) =>
  page
    .getByRole('region', { name: 'New postings worth it' })
    .locator('li')
    .filter({ hasText: title });

test('postings show in score order with the reasons line and score', async ({ page }) => {
  await signIn(page, ranked.email);
  const panel = page.getByRole('region', { name: 'New postings worth it' });
  const items = panel.locator('li').filter({ hasText: RK });
  await expect(items).toHaveCount(3);
  const titles = await items.allTextContents();
  const order = titles
    .map((t) => /^(Alpha|Beta|Gamma)/.exec(t)?.[1])
    .filter((x): x is string => !!x);
  expect(order).toEqual(['Alpha', 'Beta', 'Gamma']);
  const alpha = cardFor(page, `Alpha ${RK}`);
  await expect(alpha.getByText(new RegExp(`Primary field: ${RK} · posted 1 day ago`))).toBeVisible();
  await expect(alpha.getByTitle('Fit score out of 100')).toHaveText('60');
  await expect(cardFor(page, `Beta ${RK}`).getByTitle('Fit score out of 100')).toHaveText('50');
  await expect(cardFor(page, `Gamma ${RK}`).getByTitle('Fit score out of 100')).toHaveText('40');
});

test('with a bar, a posting that does not beat it is hidden and counted', async ({ page }) => {
  await signIn(page, barred.email);
  const panel = page.getByRole('region', { name: 'New postings worth it' });
  const hi = cardFor(page, `High ${BR}`);
  await expect(hi).toBeVisible();
  await expect(hi.getByText(/Beats your offer: better pay/)).toBeVisible();
  await expect(cardFor(page, `Low ${BR}`)).toHaveCount(0);
  // Only this user's matches are counted, and the user has just the two test matches.
  await expect(panel.getByText("1 more matching posting doesn't beat your offer.")).toBeVisible();
});

test('Save shows Saved after a reload and a second press un-saves', async ({ page }) => {
  await signIn(page, ranked.email);
  const card = cardFor(page, `Beta ${RK}`);
  await card.getByRole('button', { name: `Save Beta ${RK}` }).click();
  await expect(card.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(cardFor(page, `Beta ${RK}`).getByText('Saved', { exact: true })).toBeVisible();
  await cardFor(page, `Beta ${RK}`).getByRole('button', { name: `Unsave Beta ${RK}` }).click();
  await expect(cardFor(page, `Beta ${RK}`).getByText('Saved', { exact: true })).toHaveCount(0);
});

test('Hide removes the card and it stays gone after a reload', async ({ page }) => {
  await signIn(page, ranked.email);
  await cardFor(page, `Gamma ${RK}`).getByRole('button', { name: `Hide Gamma ${RK}` }).click();
  await expect(cardFor(page, `Gamma ${RK}`)).toHaveCount(0);
  await page.reload();
  await expect(cardFor(page, `Alpha ${RK}`)).toBeVisible();
  await expect(cardFor(page, `Gamma ${RK}`)).toHaveCount(0);
});
