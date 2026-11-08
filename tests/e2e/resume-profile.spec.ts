import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { adminClient } from '../integration/helpers';
import { FICTIONAL_RESUME_LINES, makeResumePdf } from '../fixtures/resume-pdf';
import { markOnboarded, signIn, userPool, type TestUser } from './helpers';

// One finished user with no resume: the dashboard nudge, then an upload from the profile.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const pool = userPool();
let user: TestUser;

// Set SCREENSHOT_DIR to also save the profile's Resume section at 375 wide, light and dark.
const shotDir = process.env.SCREENSHOT_DIR;

test.beforeAll(async () => {
  user = await pool.newUser('e2e-resume-profile');
  const admin = adminClient();
  const { error } = await admin
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

test.afterAll(() => pool.cleanup());

test('a finished user without a resume is nudged, uploads on the profile and applies a hint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const pdf = test.info().outputPath('resume.pdf');
  await writeFile(pdf, await makeResumePdf(FICTIONAL_RESUME_LINES));

  await signIn(page, user.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  const today = page.getByRole('region', { name: 'Today' });
  const nudge = today.getByRole('link', {
    name: 'Add your resume so Pipeline can suggest answers and fields.',
  });
  await expect(nudge).toHaveAttribute('href', '/profile#resume');
  await nudge.click();

  await expect(page).toHaveURL(/\/profile#resume$/);
  const resume = page.getByRole('region', { name: 'Resume' });
  await expect(
    resume.getByText(
      'Upload your resume and Pipeline suggests answers from it. Nothing changes until you save.',
    ),
  ).toBeVisible();
  await expect(resume.getByRole('link', { name: 'Skip for now' })).toHaveCount(0);
  await expect(page.locator('#school-resume-hint')).toHaveCount(0);

  if (shotDir) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(300);
      await resume.screenshot({ path: `${shotDir}/profile-resume-empty-375-${scheme}.png` });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }

  // A wrong file gets the message without onboarding's "skip this step".
  const txt = test.info().outputPath('notes.pdf');
  await writeFile(txt, 'Just some notes, not a PDF.\n');
  await expect(page.locator('#resume-file')).toBeEnabled();
  await page.locator('#resume-file').setInputFiles(txt);
  await expect(page.locator('[data-form-error]')).toHaveText("That file isn't a PDF. Upload a PDF.");

  await page.locator('#resume-file').setInputFiles(pdf);
  await expect(page).toHaveURL(/\/profile\?resume=1#who-heading$/, { timeout: 30_000 });
  await expect(
    page.getByText('We read your resume. Its suggestions are shown next to your answers below.'),
  ).toBeVisible();
  await expect(resume.getByText(/^Last read [A-Z][a-z]{2} \d{1,2}, \d{4}\.$/)).toBeVisible();
  await expect(resume.getByText('Upload a newer resume')).toBeVisible();

  const who = page.getByRole('region', { name: 'Who you are' });
  const school = who.getByRole('combobox', { name: 'School', exact: true });
  await expect(school).toHaveValue('Example Community College');
  await expect(page.locator('#school-resume-hint')).toHaveText(
    /^Resume says: Georgia Institute of Technology/,
  );
  await expect(page.locator('#fields-resume-hint')).toHaveText(
    'Resume suggests: Supply Chain (primary), Data Analysis (secondary)',
  );

  if (shotDir) {
    await page.locator('#resume').scrollIntoViewIfNeeded();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${shotDir}/profile-resume-read-375-${scheme}.png`, fullPage: true });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }

  await who.getByRole('button', { name: 'Use this', description: /Georgia Institute/ }).click();
  await expect(school).toHaveValue(/^Georgia Institute of Technology/);
  await expect(page.locator('#school-badge')).toHaveText('from resume');
  // Not saved yet.
  const before = await adminClient().from('profiles').select('school').eq('user_id', user.id).single();
  expect(before.data?.school).toBe('Example Community College');

  await who.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/profile\?saved=1$/);
  await expect(school).toHaveValue(/^Georgia Institute of Technology/);
  await expect(page.locator('#school-resume-hint')).toHaveCount(0);
  await expect(page.getByText('from resume', { exact: true })).toHaveCount(0);
  const after = await adminClient()
    .from('profiles')
    .select('school, school_state')
    .eq('user_id', user.id)
    .single();
  expect(after.data?.school).toMatch(/^Georgia Institute of Technology/);
  expect(after.data?.school_state).toBe('GA');

  // With a resume read, the dashboard no longer nudges.
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText('Add your resume so Pipeline can suggest answers and fields.')).toHaveCount(0);
});
