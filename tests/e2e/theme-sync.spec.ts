import { expect, test, type Page } from '@playwright/test';

// A theme change reaches other tabs only as a `storage` event. The other tab must apply
// it to its page, not just to its toggle label and toasts.

const expectTheme = async (page: Page, theme: 'light' | 'dark') => {
  const html = page.locator('html');
  if (theme === 'dark') {
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  } else {
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
  }
  await expect(
    page
      .locator('header')
      .first()
      .getByRole('button', {
        name: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      }),
  ).toBeVisible();
};

test('a theme chosen in one tab applies to the page in another', async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.setViewportSize({ width: 1280, height: 900 });
  await pageB.setViewportSize({ width: 1280, height: 900 });

  await pageA.goto('/templates');
  await pageB.goto('/templates');
  await expectTheme(pageA, 'light');
  await expectTheme(pageB, 'light');

  await pageA
    .locator('header')
    .first()
    .getByRole('button', { name: 'Switch to dark mode' })
    .click();
  await expectTheme(pageA, 'dark');
  await expectTheme(pageB, 'dark');

  await pageB
    .locator('header')
    .first()
    .getByRole('button', { name: 'Switch to light mode' })
    .click();
  await expectTheme(pageB, 'light');
  await expectTheme(pageA, 'light');
});
