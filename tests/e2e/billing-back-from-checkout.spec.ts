import { expect, test, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';
import { fillSignInForm } from './support/sign-in';

// Pressing Back on Stripe Checkout can restore the page from the back/forward cache,
// with its JavaScript state exactly as it was when the browser left. Buttons that were
// busy opening checkout must be usable again, and the editor must guard new edits.
//
// Checkout answers with a same-page hash link, so the page never unloads, and the test
// then sends the pageshow event a back/forward cache restore sends (Chromium does not
// always keep a page in that cache under test).

const RUN_LIMIT_MESSAGE =
  'Active run limit reached. Upgrade to Pro to create more checklist runs.';
const TEMPLATE_LIMIT_MESSAGE = 'Template limit reached. Upgrade to create more templates.';
const PASSWORD = 'Aa!back-from-checkout-password-12345';

async function stubCheckout(page: Page) {
  await page.route('**/api/billing/checkout', async (route) => {
    await route.fulfill({ json: { url: '#checkout-stubbed' } });
  });
  // Report billing as enabled so the Upgrade action is offered even without Stripe keys.
  await page.route('**/api/billing/status**', async (route) => {
    const response = await route.fetch();
    const status = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...status, billingEnabled: true } });
  });
}

async function restoreFromBackForwardCache(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
}

async function loginAsAdmin(page: Page) {
  await page.goto('/login/');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

// A new account is Free with no templates; Free Personal allows one template.
async function registerFreeAccount(page: Page) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await page.goto('/register/');
  await page.getByLabel('Name').fill('Back From Checkout QA');
  await page.getByLabel('Email').fill(`back-from-checkout+${suffix}@e2e.local`);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#confirmPassword').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({
    timeout: 30_000,
  });
}

async function createTemplateViaApi(page: Page, title: string) {
  await apiJson(page, '/templates', { method: 'POST', body: { title, is_public: false, sections: [] } });
}

// The page a test ends on is often still loading its billing status through the stub.
// Let that request finish, or closing the page fails the stub's route.fetch.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

test('Back from checkout leaves the Start Run dialog usable on My Templates', async ({ page }) => {
  await loginAsAdmin(page);
  // Answer the run start the way a Free context at its active-run limit is answered.
  await page.route('**/api/checklists', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({ code: 'limit_reached', error: RUN_LIMIT_MESSAGE }),
      contentType: 'application/json',
      status: 403,
    });
  });
  await stubCheckout(page);

  await page.goto('/dashboard/templates/');
  await page.getByRole('button', { name: 'Show templates in list view' }).click();
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start a Run' });
  await dialog.getByRole('button', { name: 'Start Run' }).click();

  await expect(page).toHaveURL(/#checkout-stubbed$/);
  // Busy while the browser leaves for Stripe, so a second click cannot open a second session.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();

  await restoreFromBackForwardCache(page);

  await expect(dialog.getByRole('button', { name: 'Start Run' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('Back from checkout offers Upgrade again and guards new edits in the editor', async ({ page }) => {
  await registerFreeAccount(page);
  await createTemplateViaApi(page, 'First template');
  await stubCheckout(page);

  await page.goto('/dashboard/templates/new/');
  await expect(page.getByText(TEMPLATE_LIMIT_MESSAGE)).toBeVisible();
  const title = page.getByPlaceholder('Enter template name...');
  await title.fill('Second template');
  await page.getByRole('button', { name: 'Upgrade to Pro' }).click();

  await expect(page).toHaveURL(/#checkout-stubbed$/);
  await expect(page.getByRole('button', { name: 'Opening checkout...' })).toBeDisabled();

  await restoreFromBackForwardCache(page);

  await expect(page.getByRole('button', { name: 'Upgrade to Pro' })).toBeEnabled();
  // Edits made after coming back are not in the kept draft, so leaving must ask.
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
