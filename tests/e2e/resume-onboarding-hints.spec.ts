import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { adminClient } from '../integration/helpers';
import { FICTIONAL_RESUME_LINES, makeResumePdf } from '../fixtures/resume-pdf';
import { currentStep, signIn, userPool, type TestUser } from './helpers';

// One user who saved step 1 (a different school than the resume's) before uploading a resume.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const pool = userPool();
let user: TestUser;

// Set SCREENSHOT_DIR to also save a step-1 hint at 375 wide, light and dark.
const shotDir = process.env.SCREENSHOT_DIR;

test.beforeAll(async () => {
  user = await pool.newUser('e2e-resume-hints');
  const admin = adminClient();
  const { error } = await admin
    .from('profiles')
    .update({
      onboarding_step: 1,
      career_stage: 'intern',
      school: 'Example Community College',
      school_location: 'Springfield, IL',
      school_state: 'IL',
      work_auth: 'citizen_or_pr',
      work_style: 'remote_only',
    })
    .eq('user_id', user.id);
  if (error) throw new Error(`seed profile failed: ${error.message}`);
  const field = await admin
    .from('profile_fields')
    .insert({ user_id: user.id, category_slug: 'marketing', label: 'Marketing', weight: 'primary' });
  if (field.error) throw new Error(`seed field failed: ${field.error.message}`);
});

test.afterAll(() => pool.cleanup());

function chip(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^${name}`) });
}

test('a resume uploaded after step 1 shows hints instead of changing saved answers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const pdf = test.info().outputPath('resume.pdf');
  await writeFile(pdf, await makeResumePdf(FICTIONAL_RESUME_LINES));

  await signIn(page, user.email, '/onboarding');
  await expect(currentStep(page)).toHaveText('What you want');
  const marker = page.getByRole('navigation', { name: 'Setup progress' });
  await expect(marker.getByRole('link', { name: 'Who you are' })).toHaveAttribute(
    'href',
    '/onboarding?step=1',
  );
  await marker.getByRole('link', { name: 'Resume (optional)' }).click();

  await expect(page).toHaveURL(/\/onboarding\?step=resume$/);
  await expect(currentStep(page)).toHaveText('Resume (optional)');
  await expect(
    page.getByText(
      'Your saved answers stay as they are. Pipeline shows what your resume says next to each one.',
    ),
  ).toBeVisible();
  await expect(page.locator('#resume-file')).toBeEnabled();
  await page.locator('#resume-file').setInputFiles(pdf);

  await expect(page).toHaveURL(/\/onboarding\?step=1$/, { timeout: 30_000 });
  await expect(currentStep(page)).toHaveText('Who you are');
  // Nothing was filled: the saved school stays and there is no prefill notice or badge.
  const school = page.getByRole('combobox', { name: 'School', exact: true });
  await expect(school).toHaveValue('Example Community College');
  await expect(page.getByText('from your resume')).toHaveCount(0);
  await expect(page.getByText('from resume', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Graduation month')).toHaveValue('');

  const schoolHint = page.locator('#school-resume-hint');
  await expect(schoolHint).toHaveText(/^Resume says: Georgia Institute of Technology/);
  await expect(school).toHaveAttribute('aria-describedby', /school-resume-hint/);
  // A saved blank gets a hint too, but is not filled.
  await expect(page.locator('#grad_date-resume-hint')).toHaveText('Resume says: May 2027');

  if (shotDir) {
    await schoolHint.scrollIntoViewIfNeeded();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(300); // let colour transitions settle
      await page.screenshot({ path: `${shotDir}/onboarding-step1-hint-375-${scheme}.png` });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }

  await page.getByRole('button', { name: 'Use this', description: /Georgia Institute/ }).click();
  await expect(school).toHaveValue(/^Georgia Institute of Technology/);
  await expect(school).toBeFocused();
  await expect(page.locator('#school-badge')).toHaveText('from resume');
  await expect(page.getByLabel('School location', { exact: true })).toHaveValue('Atlanta, GA');
  await expect(page.getByLabel('School state', { exact: true })).toHaveValue('GA');
  await expect(schoolHint).toHaveCount(0);
  // Other hints are untouched until used.
  await expect(page.getByLabel('Graduation month')).toHaveValue('');

  // Saving keeps the applied school; step 2 then offers the resume's fields over the saved one.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(currentStep(page)).toHaveText('What you want');
  await expect(chip(page, 'Marketing')).toHaveAccessibleName(/primary/);
  await expect(page.locator('#fields-resume-hint')).toHaveText(
    'Resume suggests: Supply Chain (primary), Data Analysis (secondary)',
  );
  await page.getByRole('button', { name: 'Use these' }).click();
  await expect(chip(page, 'Supply Chain')).toHaveAccessibleName(/primary/);
  await expect(chip(page, 'Data Analysis')).toHaveAccessibleName(/secondary/);
  await expect(chip(page, 'Marketing')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('Fields set from your resume. Save to keep them.')).toBeVisible();

  const { data } = await adminClient()
    .from('profiles')
    .select('school, school_state, grad_date')
    .eq('user_id', user.id)
    .single();
  expect(data?.school).toMatch(/^Georgia Institute of Technology/);
  expect(data?.school_state).toBe('GA');
  expect(data?.grad_date).toBeNull();
});
