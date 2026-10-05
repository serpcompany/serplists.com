import { expect, test } from '@playwright/test';

import { apiJsonAt as callApi } from './support/api-requests';
import { createdOrganization } from './support/api-bodies';
import { expectNoSidewaysScroll } from './support/phone';
import { loginAsAdmin } from './support/sign-in';

test('the footer links the Profiles directory, whose People open their one canonical profile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Profiles', exact: true }).click();

  await expect(page).toHaveURL(/\/profiles\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Profiles' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true');
  const john = page.locator('a[href="/profile/john/"]');
  await expect(john).toContainText('@john', { timeout: 30_000 });
  await expect(john).toContainText(/\d+ public templates?/);

  await john.click();
  await expect(page).toHaveURL(/\/profile\/john\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'John (Free)' })).toBeVisible({ timeout: 30_000 });
});

test('switching to Organizations keeps the page and puts the collection in the address', async ({ page }) => {
  await page.goto('/profiles/');
  await expect(page.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: 'Organizations' }).click();

  await expect(page).toHaveURL(/\/profiles\/\?collection=organizations$/);
  await expect(page.getByRole('tab', { name: 'Organizations' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('a[href="/profile/serp-growth-team/"]')).toBeVisible({ timeout: 30_000 });
});

test('an Organization with a handle is listed under Organizations and opens its public profile', async ({ page, browser }) => {
  await loginAsAdmin(page);
  const handle = `0dir-${Date.now()}`;
  const name = `Directory Org ${handle}`;
  await callApi(page, '/teams', 'POST', createdOrganization, { name, slug: handle });

  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    await guest.goto(`/profiles/?collection=organizations&after=${handle.slice(0, -1)}`);

    const card = guest.locator(`a[href="/profile/${handle}/"]`);
    await expect(card).toContainText(name, { timeout: 30_000 });
    await expect(card).toContainText('0 public templates');
    await expect(guest.getByRole('navigation', { name: 'Organizations pages' }).getByRole('link', { name: 'Previous' })).toBeVisible();

    await card.click();
    await expect(guest).toHaveURL(new RegExp(`/profile/${handle}/$`));
    await expect(guest.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 30_000 });
  } finally {
    await guestContext.close();
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the directory fits the screen, with both collections and their cards in reach', async ({ page }) => {
    await page.goto('/profiles/');

    await expect(page.locator('a[href="/profile/john/"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Organizations' })).toBeVisible();
    await expectNoSidewaysScroll(page);

    await page.getByRole('tab', { name: 'Organizations' }).click();
    await expect(page.locator('a[href="/profile/serp-growth-team/"]')).toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page);
  });
});
