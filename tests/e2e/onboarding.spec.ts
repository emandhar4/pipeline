import { expect, test, type Page } from '@playwright/test';
import { seasonOptions } from '../../src/lib/onboarding/options';
import { signIn, userPool, type TestUser } from './helpers';

// Two users for the whole file, to stay clear of the auth rate limit:
// A finishes onboarding and then edits the profile; B stops after step 1.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const pool = userPool();
let userA: TestUser;
let userB: TestUser;

test.beforeAll(async () => {
  userA = await pool.newUser('e2e-onboard-a');
  userB = await pool.newUser('e2e-onboard-b');
});

test.afterAll(() => pool.cleanup());

async function fillStep1(page: Page, { answerInState = true } = {}) {
  await page.getByLabel('Student looking for an internship').check();
  await page.getByLabel('School', { exact: true }).fill('Example State University');
  await page.getByLabel('Major', { exact: true }).fill('Economics');
  await page.getByLabel('Graduation month').fill('2028-05');
  await page.getByLabel('Citizen or permanent resident').check();
  await page.getByLabel('Home location', { exact: true }).fill('Columbus, OH');
  await page.getByLabel('School location', { exact: true }).fill('Athens, OH');
  if (answerInState) await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await page.getByLabel('Anywhere').check();
  await page.getByRole('button', { name: 'Continue' }).click();
}

function chip(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^${name}`) });
}

test('new user is sent to onboarding and finishes in two steps', async ({ page }) => {
  await signIn(page, userA.email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText('1 of 2')).toBeVisible();

  await fillStep1(page);
  await expect(page.getByText('2 of 2')).toBeVisible();

  await chip(page, 'Data Analysis').click();
  await expect(chip(page, 'Data Analysis')).toHaveAccessibleName(/primary/);
  await chip(page, 'Supply Chain').click();
  await chip(page, 'Supply Chain').click();
  await expect(chip(page, 'Supply Chain')).toHaveAccessibleName(/secondary/);
  await expect(chip(page, 'Supply Chain')).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Prefer', { exact: true }).fill('Healthcare tech');
  await page.getByLabel('Prefer', { exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Remove Healthcare tech' })).toBeVisible();

  // The pay toggle's radios are visually hidden; keyboard focus must still show on the label.
  await page.locator('#pay_amount').focus();
  await page.keyboard.press('Tab');
  const focusedToggle = page.locator('.segment label').filter({ has: page.locator(':focus') });
  await expect(focusedToggle).toHaveCSS('outline-style', 'solid');

  await page.getByLabel('Season').selectOption(seasonOptions(new Date())[0]);
  await page.getByRole('button', { name: 'Finish setup' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('resume at step 2', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, userB.email);
  await expect(page).toHaveURL(/\/onboarding$/);
  // The in-state question appears once both locations are filled, and must be answered.
  await fillStep1(page, { answerInState: false });
  const inState = page.getByRole('group', { name: 'Is your school in your home state?' });
  await expect(inState.getByText('Choose one')).toBeVisible();
  // At 375px the error must be in view, focused, and announced.
  await expect(inState.getByRole('radio', { name: 'Yes', exact: true })).toBeFocused();
  await expect(inState.getByText('Choose one')).toBeInViewport();
  await expect(page.getByText('1 answer needs attention above.')).toBeVisible();
  await expect(page.getByText('1 of 2')).toBeVisible();
  await inState.getByRole('radio', { name: 'Yes', exact: true }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('2 of 2')).toBeVisible();

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText('2 of 2')).toBeVisible();

  await page.goto('/onboarding?step=1');
  await expect(page.getByText('1 of 2')).toBeVisible();
  await expect(page.getByLabel('Major', { exact: true })).toHaveValue('Economics');
  await expect(page.getByLabel('Home location', { exact: true })).toHaveValue('Columbus, OH');
});

test('step 2 requires a primary field', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, userB.email, '/onboarding');
  await expect(page.getByText('2 of 2')).toBeVisible();

  // The industry lists stop at 20: Add disables and a note says why.
  const prefer = page.getByLabel('Prefer', { exact: true });
  for (let i = 1; i <= 20; i++) {
    await prefer.fill(`Industry ${i}`);
    await prefer.press('Enter');
  }
  await expect(page.getByText('Up to 20')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to Prefer' })).toBeDisabled();
  await prefer.fill('Industry 21');
  await prefer.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove Industry 21' })).toHaveCount(0);
  await expect(prefer).toHaveValue('Industry 21');

  // Submitting with that text still pending must not drop it: the submit is blocked here.
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByText('Up to 20 industries. Remove one, or clear this box')).toBeVisible();
  await expect(prefer).toBeFocused();
  await expect(prefer).toHaveValue('Industry 21');
  await prefer.fill('');

  await chip(page, 'Supply Chain').click();
  await chip(page, 'Supply Chain').click();
  await page.getByLabel('Season').selectOption(seasonOptions(new Date())[0]);
  await page.getByRole('button', { name: 'Finish setup' }).click();

  const primaryError = page.getByText('Pick at least one primary field');
  await expect(primaryError).toBeVisible();
  await expect(primaryError).toBeFocused();
  await expect(primaryError).toBeInViewport();
  await expect(page.getByText('1 answer needs attention above.')).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding$/);
  // The chip choice survives the failed submit.
  await expect(chip(page, 'Supply Chain')).toHaveAccessibleName(/secondary/);
});

test('profile edits persist', async ({ page }) => {
  await signIn(page, userA.email, '/profile');
  await expect(page).toHaveURL(/\/profile$/);
  const who = page.getByRole('region', { name: 'Who you are' });
  await expect(who.getByLabel('Major', { exact: true })).toHaveValue('Economics');
  // Step 2 answers are prefilled too.
  await expect(chip(page, 'Data Analysis')).toHaveAccessibleName(/primary/);

  await who.getByLabel('Major', { exact: true }).fill('Applied Mathematics');
  await who.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/profile\?saved=1$/);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Who you are' }).getByLabel('Major', { exact: true }),
  ).toHaveValue('Applied Mathematics');
});

test('typed but un-added text is saved on submit', async ({ page }) => {
  await signIn(page, userA.email, '/profile');
  const what = page.getByRole('region', { name: 'What you want' });
  await what.getByLabel('Avoid', { exact: true }).fill('Tobacco');
  await what.getByLabel('Add your own field').fill('Supply chain analytics');
  await what.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/profile\?saved=1$/);

  await page.reload();
  const after = page.getByRole('region', { name: 'What you want' });
  await expect(after.getByRole('button', { name: 'Remove Tobacco' })).toBeVisible();
  await expect(chip(page, 'Supply chain analytics')).toHaveAccessibleName(/primary/);
});
