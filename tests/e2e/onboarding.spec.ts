import { expect, test, type Page } from '@playwright/test';
import { seasonOptions } from '../../src/lib/onboarding/options';
import { currentStep, signIn, userPool, type TestUser } from './helpers';

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

async function fillStep1(page: Page, { pickArea = true } = {}) {
  await page.getByLabel('Student looking for an internship').check();

  await page.getByRole('combobox', { name: 'School', exact: true }).fill('georgia tech');
  await page.locator('[role="option"][data-kind="option"]').first().click();
  await expect(page.getByLabel('School location', { exact: true })).toHaveValue('Atlanta, GA');

  await page.getByRole('combobox', { name: 'Major', exact: true }).fill('Underwater Basket Studies');
  await page.getByRole('option', { name: 'Use "Underwater Basket Studies"' }).click();

  await page.getByLabel('Graduation month').fill('2028-05');
  await page.getByLabel('Citizen or permanent resident').check();
  await page.getByLabel('Home city', { exact: true }).fill('Columbus');
  await page.getByLabel('Home state', { exact: true }).selectOption({ label: 'Ohio' });
  await expect(page.getByRole('button', { name: 'Home state (OH)' })).toBeVisible();

  if (pickArea) {
    // Ohio is not added unless "Home state (OH)" is clicked.
    await page.getByRole('button', { name: 'Southeast', exact: true }).click();
    await expect(page.getByText('12 states selected')).toBeVisible();
  }
  await workStyle(page).getByLabel('In person only').check();
  await page.getByRole('button', { name: 'Continue' }).click();
}

function workStyle(page: Page) {
  return page.getByRole('group', { name: 'How do you want to work?' });
}

function chip(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^${name}`) });
}

test('new user is sent to onboarding and finishes after skipping the resume', async ({ page }) => {
  await signIn(page, userA.email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(currentStep(page)).toHaveText('Resume (optional)');
  await page.getByRole('link', { name: 'Skip for now' }).click();
  await expect(currentStep(page)).toHaveText('Who you are');

  await fillStep1(page);
  await expect(currentStep(page)).toHaveText('What you want');

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
  await page.getByRole('link', { name: 'Skip for now' }).click();
  await fillStep1(page);
  await expect(currentStep(page)).toHaveText('What you want');

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(currentStep(page)).toHaveText('What you want');

  await page.goto('/onboarding?step=1');
  await expect(currentStep(page)).toHaveText('Who you are');
  // The picked school is stored under its database name; the free-text major as typed.
  await expect(page.getByRole('combobox', { name: 'School', exact: true })).toHaveValue(
    'Georgia Institute of Technology-Main Campus',
  );
  await expect(page.getByRole('combobox', { name: 'Major', exact: true })).toHaveValue(
    'Underwater Basket Studies',
  );
  await expect(page.getByLabel('Home city', { exact: true })).toHaveValue('Columbus');
  await expect(page.getByLabel('Home state', { exact: true })).toHaveValue('OH');
  await expect(page.getByLabel('School state', { exact: true })).toHaveValue('GA');
  await expect(page.getByText('12 states selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Southeast', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('in person with no places shows the error', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, userB.email, '/onboarding?step=1');
  await expect(currentStep(page)).toHaveText('Who you are');
  // Clear the saved area so nothing is picked.
  await page.getByRole('button', { name: 'Southeast', exact: true }).click();
  await expect(page.getByText('None yet')).toBeVisible();
  await workStyle(page).getByLabel('In person only').check();
  await page.getByRole('button', { name: 'Continue' }).click();

  const error = page.getByText('Pick at least one place, or choose Remote only.');
  // At 375px the error must be in view, focused, and announced.
  await expect(error).toBeVisible();
  await expect(error).toBeFocused();
  await expect(error).toBeInViewport();
  await expect(page.getByText('1 answer needs attention above.')).toBeVisible();
  await expect(currentStep(page)).toHaveText('Who you are');

  await workStyle(page).getByLabel('Remote only').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(currentStep(page)).toHaveText('What you want');
});

test('step 2 requires a primary field', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, userB.email, '/onboarding');
  await expect(currentStep(page)).toHaveText('What you want');

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
  await expect(who.getByRole('combobox', { name: 'Major', exact: true })).toHaveValue(
    'Underwater Basket Studies',
  );
  // Step 2 answers are prefilled too.
  await expect(chip(page, 'Data Analysis')).toHaveAccessibleName(/primary/);

  await who.getByRole('combobox', { name: 'Major', exact: true }).fill('Applied Mathematics');
  await who.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/profile\?saved=1$/);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

  await page.reload();
  await expect(
    page
      .getByRole('region', { name: 'Who you are' })
      .getByRole('combobox', { name: 'Major', exact: true }),
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

test('anywhere in the US overrides states', async ({ page }) => {
  await signIn(page, userA.email, '/profile');
  const who = page.getByRole('region', { name: 'Who you are' });
  await expect(who.getByText('12 states selected')).toBeVisible();
  await expect(who.getByRole('button', { name: 'Southeast', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await who.getByRole('button', { name: 'Anywhere in the US' }).click();
  await expect(who.getByText('Anywhere in the US', { exact: true }).last()).toBeVisible();
  await who.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/profile\?saved=1$/);

  await page.reload();
  const after = page.getByRole('region', { name: 'Who you are' });
  const anywhere = after.getByRole('button', { name: 'Anywhere in the US' });
  await expect(anywhere).toHaveAttribute('aria-pressed', 'true');
  // While it is on, the state controls are disabled and none of them is posted.
  await expect(after.getByRole('button', { name: 'Southeast', exact: true })).toBeDisabled();
  await expect(after.locator('input[name="work_states"]:not(:disabled)')).toHaveCount(0);
  // The saved state list is empty: switching Anywhere off leaves nothing checked.
  await anywhere.click();
  await expect(after.getByText('None yet')).toBeVisible();
  await expect(after.locator('input[name="work_states"]:checked')).toHaveCount(0);
});

test('remote only hides the place picker', async ({ page }) => {
  await signIn(page, userA.email, '/profile');
  const who = page.getByRole('region', { name: 'Who you are' });
  await expect(who.getByRole('group', { name: 'Where can you work?' })).toBeVisible();

  await workStyle(page).getByLabel('Remote only').check();
  await expect(who.getByRole('group', { name: 'Where can you work?' })).toBeHidden();
  await who.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/profile\?saved=1$/);

  await page.reload();
  const after = page.getByRole('region', { name: 'Who you are' });
  await expect(workStyle(page).getByLabel('Remote only')).toBeChecked();
  await expect(after.getByRole('group', { name: 'Where can you work?' })).toBeHidden();
});
