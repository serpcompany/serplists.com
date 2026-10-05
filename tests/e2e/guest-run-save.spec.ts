import { expect, test } from '@playwright/test';

import { answerRunStartsAtActiveRunLimit, countCheckoutsSentTo, reportBillingEnabled } from './support/billing';
import { GUEST_RUN_PATH, GUEST_TEMPLATE_PATH, startTheGuestRun, theRunPageHeader } from './support/guest-runs';
import { deleteRun, runIdInTheUrl } from './support/run-saves';
import { fillSignInForm, loginAs } from './support/sign-in';

const BROWSER_ONLY_NOTICE = 'Your run of this Template is saved in this browser only.';

test('a visitor who logs in from the guest run saves it into their account, progress and notes included', async ({ page }) => {
  await startTheGuestRun(page, 'Lake weekend to keep');
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Pack sleeping gear' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Task notes' }).fill('Two sleeping bags');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByRole('button', { name: 'Save notes' })).toBeDisabled();

  await theRunPageHeader(page).getByRole('link', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/login\/\?next=%2Fprofile%2Fserp%2Fultimate-camping-checklist%2Frun%2F$/);
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${GUEST_RUN_PATH}$`));

  await theRunPageHeader(page).getByRole('button', { name: 'Save to account' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+\/$/);
  await expect(page.getByText('Run saved to your account')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Lake weekend to keep' })).toBeVisible();
  await expect(theRunPageHeader(page)).toContainText('1 of 4 tasks finished');
  await expect(page.getByRole('textbox', { name: 'Task notes' })).toHaveValue('Two sleeping bags');
  const runId = runIdInTheUrl(page);

  await page.goto(GUEST_TEMPLATE_PATH);
  await expect(page.getByRole('button', { name: 'Start Run' }).first()).toBeEnabled();
  await expect(page.getByText(BROWSER_ONLY_NOTICE)).toHaveCount(0);

  await deleteRun(page, runId);
});

test('a signed-in user at the active-run limit is sent to checkout from the Template page and keeps the guest run', async ({ page }) => {
  await startTheGuestRun(page, 'Lake weekend at the limit');
  await loginAs(page, 'admin');
  await reportBillingEnabled(page);
  await answerRunStartsAtActiveRunLimit(page);
  const checkout = await countCheckoutsSentTo(page, '/pricing/?checkout=stubbed');

  await page.goto(GUEST_TEMPLATE_PATH);
  await expect(page.getByText(BROWSER_ONLY_NOTICE)).toBeVisible();
  await page.getByRole('button', { name: 'Save to account' }).click();

  await expect(page).toHaveURL(/checkout=stubbed/);
  expect(checkout.requests).toBe(1);
  await page.goto(GUEST_RUN_PATH);
  await expect(page.getByRole('heading', { level: 1, name: 'Lake weekend at the limit' })).toBeVisible();
});
