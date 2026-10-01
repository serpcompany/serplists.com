import { expect, test, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';
import { answerRunStartsAtActiveRunLimit, reportBillingEnabled, TEMPLATE_LIMIT_MESSAGE } from './support/billing';
import { loginAsAdmin, registerNewAccount, uniqueSuffix } from './support/sign-in';
import { startARunFromTheFirstStartRun } from './support/run-saves';

const PASSWORD = 'Aa!back-from-checkout-password-12345';

async function stubCheckoutWithSamePageLink(page: Page) {
  await page.route('**/api/billing/checkout', async (route) => {
    await route.fulfill({ json: { url: '#checkout-stubbed' } });
  });
  await reportBillingEnabled(page);
}

async function sendBackForwardCacheRestore(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
}

async function registerFreeAccount(page: Page) {
  await registerNewAccount(page, {
    name: 'Back From Checkout QA',
    email: `back-from-checkout+${uniqueSuffix()}@e2e.local`,
    password: PASSWORD,
  });
}

async function reachFreeTemplateLimit(page: Page) {
  await apiJson(page, '/templates', { method: 'POST', body: { title: 'First template', is_public: false, sections: [] } });
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

test('Back from checkout leaves the Start Run dialog usable on My Templates', async ({ page }) => {
  await loginAsAdmin(page);
  await answerRunStartsAtActiveRunLimit(page);
  await stubCheckoutWithSamePageLink(page);

  await page.goto('/dashboard/templates/');
  await page.getByRole('button', { name: 'Show templates in list view' }).click();
  const dialog = await startARunFromTheFirstStartRun(page);

  await expect(page).toHaveURL(/#checkout-stubbed$/);
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();

  await sendBackForwardCacheRestore(page);

  await expect(dialog.getByRole('button', { name: 'Start Run' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('Back from checkout offers Upgrade again and guards new edits in the editor', async ({ page }) => {
  await registerFreeAccount(page);
  await reachFreeTemplateLimit(page);
  await stubCheckoutWithSamePageLink(page);

  await page.goto('/dashboard/templates/new/');
  await expect(page.getByText(TEMPLATE_LIMIT_MESSAGE)).toBeVisible();
  const title = page.getByPlaceholder('Enter template name...');
  await title.fill('Second template');
  await page.getByRole('button', { name: 'Upgrade to Pro' }).click();

  await expect(page).toHaveURL(/#checkout-stubbed$/);
  await expect(page.getByRole('button', { name: 'Opening checkout...' })).toBeDisabled();

  await sendBackForwardCacheRestore(page);

  await expect(page.getByRole('button', { name: 'Upgrade to Pro' })).toBeEnabled();
  await title.fill('Second template, edited after checkout');
  let confirmMessage: string | null = null;
  page.once('dialog', async (confirm) => {
    confirmMessage = confirm.message();
    await confirm.dismiss();
  });
  await page.getByRole('button', { name: 'Back to templates' }).click();

  await expect.poll(() => confirmMessage).toContain('unsaved template changes');
  await expect(page).toHaveURL(/\/dashboard\/templates\/new/);
  await expect(title).toHaveValue('Second template, edited after checkout');
});
