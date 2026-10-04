import { expect, test } from '@playwright/test';

import { expectNoSidewaysScroll } from './support/phone';
import { loginAsAdmin } from './support/sign-in';

test("a public Template's page links to its live public page, which opens it", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/templates/template-1/');

  const link = page.getByRole('link', { name: 'View public template' });
  await expect(link).toHaveAttribute('href', /^\/profile\/admin\/[^/]+\/$/, { timeout: 30_000 });
  await link.click();

  await expect(page).toHaveURL(/\/profile\/admin\/[^/]+\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Technical SEO Audit Checklist' })).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the link sits beside the Public badge and fits the screen', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard/templates/template-1/');

    await expect(page.getByRole('link', { name: 'View public template' })).toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page);
  });
});
