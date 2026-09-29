import { expect, test } from '@playwright/test';
import { fillSignInForm } from './support/sign-in';

// The editor opens its form only for someone who can save the template
// (src/features/template-editor/templateEditPermission.ts). Seeded data: template-1 is
// admin@test.com's public "Technical SEO Audit Checklist".

test("another user's public template opens as a read-only notice, not the editor", async ({ page }) => {
  await page.goto('/login');
  await fillSignInForm(page, 'john');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
  const templateWrites: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname.includes('/api/templates/')) {
      templateWrites.push(request.url());
    }
  });

  await page.goto('/dashboard/templates/template-1/edit');

  await expect(page.getByText("You can't edit this template")).toBeVisible();
  await expect(page.getByText('Only its owner can edit it.')).toBeVisible();
  await expect(page.getByPlaceholder('Enter template name...')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'View template' }).click();
  await expect(page).toHaveURL(/\/dashboard\/templates\/template-1$/);
  expect(templateWrites).toEqual([]);
});

test('the owner still gets the editor for their template', async ({ page }) => {
  await page.goto('/login');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });

  await page.goto('/dashboard/templates/template-1/edit');

  await expect(page.getByPlaceholder('Enter template name...')).toHaveValue('Technical SEO Audit Checklist');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(page.getByText("You can't edit this template")).toHaveCount(0);
});
