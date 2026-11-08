import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { seasonOptions } from '../../src/lib/onboarding/options';
import { FICTIONAL_RESUME_LINES, makeResumePdf } from '../fixtures/resume-pdf';
import { currentStep, signIn, userPool, type TestUser } from './helpers';

// One user for the file: a bad file and "Skip for now" first, then the real resume.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const pool = userPool();
let user: TestUser;

// Set SCREENSHOT_DIR to also save the resume step at 375 wide, light and dark.
const shotDir = process.env.SCREENSHOT_DIR;

test.beforeAll(async () => {
  user = await pool.newUser('e2e-onboard-resume');
});

test.afterAll(() => pool.cleanup());

function chip(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^${name}`) });
}

test('a file that is not a PDF is refused, and skipping goes to step 1 with nothing filled', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, user.email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'Start with your resume' })).toBeVisible();
  await expect(currentStep(page)).toHaveText('Resume (optional)');

  if (shotDir) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(300); // let colour transitions settle
      await page.screenshot({ path: `${shotDir}/onboarding-resume-375-${scheme}.png`, fullPage: true });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }

  // A text file renamed to .pdf.
  const txt = test.info().outputPath('notes.pdf');
  await writeFile(txt, 'Just some notes, not a PDF.\n');
  await expect(page.locator('#resume-file')).toBeEnabled();
  await page.locator('#resume-file').setInputFiles(txt);
  await expect(page.locator('[data-form-error]')).toHaveText(
    "That file isn't a PDF. Upload a PDF, or skip this step.",
  );

  await page.getByRole('link', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/onboarding\?step=1$/);
  await expect(currentStep(page)).toHaveText('Who you are');
  await expect(page.getByText('from your resume')).toHaveCount(0);
  await expect(page.getByText('from resume', { exact: true })).toHaveCount(0);
});

test('a resume fills in step 1 and suggests fields in step 2', async ({ page }) => {
  const pdf = test.info().outputPath('resume.pdf');
  await writeFile(pdf, await makeResumePdf(FICTIONAL_RESUME_LINES));

  await signIn(page, user.email, '/onboarding');
  // Skipping saved nothing, so the resume step is still the start.
  await expect(page.getByRole('heading', { name: 'Start with your resume' })).toBeVisible();
  await expect(page.locator('#resume-file')).toBeEnabled();
  await page.locator('#resume-file').setInputFiles(pdf);

  await expect(page).toHaveURL(/\/onboarding\?step=1$/, { timeout: 30_000 });
  await expect(currentStep(page)).toHaveText('Who you are');
  await expect(page.getByRole('status')).toHaveText(
    'We filled in 7 answers from your resume. Check them before you continue.',
  );
  await expect(page.getByText('from resume', { exact: true })).toHaveCount(7);
  await expect(page.getByRole('combobox', { name: 'School', exact: true })).toHaveValue(
    /^Georgia Institute of Technology/,
  );
  await expect(page.getByLabel('School location', { exact: true })).toHaveValue('Atlanta, GA');
  await expect(page.getByLabel('School state', { exact: true })).toHaveValue('GA');
  await expect(page.getByRole('combobox', { name: 'Major', exact: true })).toHaveValue(
    /Industrial Engineering/,
  );
  await expect(page.getByLabel('Graduation month')).toHaveValue('2027-05');
  await expect(page.getByLabel('Home city', { exact: true })).toHaveValue('Columbus, OH');
  await expect(page.getByLabel('Home state', { exact: true })).toHaveValue('OH');
  await expect(page.getByLabel('Home state', { exact: true }).locator('option:checked')).toHaveText(
    'Ohio',
  );

  // The rest is the user's to answer.
  await page.getByLabel('Student looking for an internship').check();
  await page.getByLabel('Citizen or permanent resident').check();
  await page
    .getByRole('group', { name: 'How do you want to work?' })
    .getByLabel('Remote only')
    .check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(currentStep(page)).toHaveText('What you want');
  await expect(page.getByRole('status')).toHaveText(
    "Suggested from your resume: Supply Chain (primary), Data Analysis (secondary). Change anything that's off.",
  );
  await expect(chip(page, 'Supply Chain')).toHaveAccessibleName(/primary/);
  await expect(chip(page, 'Data Analysis')).toHaveAccessibleName(/secondary/);

  await page.getByLabel('Season').selectOption(seasonOptions(new Date())[0]);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Saved for real, and the profile page shows no resume badges.
  await page.goto('/profile');
  const who = page.getByRole('region', { name: 'Who you are' });
  await expect(who.getByRole('combobox', { name: 'School', exact: true })).toHaveValue(
    /^Georgia Institute of Technology/,
  );
  await expect(who.getByLabel('Graduation month')).toHaveValue('2027-05');
  await expect(who.getByLabel('Home state', { exact: true })).toHaveValue('OH');
  await expect(page.getByText('from resume', { exact: true })).toHaveCount(0);
  await expect(chip(page, 'Supply Chain')).toHaveAccessibleName(/primary/);
  await expect(chip(page, 'Data Analysis')).toHaveAccessibleName(/secondary/);
});
