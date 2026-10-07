import { expect, test } from '@playwright/test';
import { loginAs, loginAsAdmin } from './support/sign-in';

const ADMINS_SEEDED_PUBLIC_TEMPLATE_ID = 'template-1';

test("another user's public template opens as a read-only notice, not the editor", async ({ page }) => {
  await loginAs(page, 'john');
  const templateWrites: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname.includes('/api/templates/')) {
      templateWrites.push(request.url());
    }
  });

  await page.goto(`/dashboard/templates/${ADMINS_SEEDED_PUBLIC_TEMPLATE_ID}/edit/`);

  await expect(page.getByText("You can't edit this template")).toBeVisible();
  await expect(page.getByText('Only its owner can edit it.')).toBeVisible();
  await expect(page.getByPlaceholder('Enter template name...')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'View template' }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/templates/${ADMINS_SEEDED_PUBLIC_TEMPLATE_ID}/$`));
  expect(templateWrites).toEqual([]);
});

test('the owner still gets the editor for their template', async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto(`/dashboard/templates/${ADMINS_SEEDED_PUBLIC_TEMPLATE_ID}/edit/`);

  await expect(page.getByPlaceholder('Enter template name...')).toHaveValue('Technical SEO Audit Checklist');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(page.getByText("You can't edit this template")).toHaveCount(0);
});
