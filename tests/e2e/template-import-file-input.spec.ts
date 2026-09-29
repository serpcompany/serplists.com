import { expect, test, type Page } from '@playwright/test';
import { fillSignInForm } from './support/sign-in';

// Every chosen import file replaces the previous preview, even a rejected one, and the
// file input is cleared after each choice so re-choosing a fixed file fires `change`.
// setInputFiles always dispatches `change`, so the empty input value is the guard for
// Chromium's same-path suppression.

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

const portablePack = (title: string) =>
  JSON.stringify({
    kind: 'serplists-template-pack',
    schemaVersion: '2.0.0',
    exportedAt: '2026-03-22T00:00:00.000Z',
    templates: [{ title, sections: [{ title: 'Prep', items: [{ title: 'Task' }] }] }],
  });

const brokenYaml = ['title: Fixed YAML Template', 'sections:', '  - title: ""', '    items:', '      - title: Task', ''].join('\n');

test('each chosen import file replaces the preview and clears the file input', async ({ page }) => {
  await loginAsAdmin(page);
  await page.route('**/api/billing/status**', (route) =>
    route.fulfill({
      body: JSON.stringify({ billingEnabled: true, plan: 'pro' }),
      contentType: 'application/json',
      status: 200,
    }),
  );

  await page.goto('/dashboard/import-templates');
  const input = page.getByLabel('Select a YAML, JSON, or Markdown template file');
  await expect(input).toBeEnabled({ timeout: 15_000 });

  await input.setInputFiles({
    buffer: Buffer.from(portablePack('File Input Alpha')),
    mimeType: 'application/json',
    name: 'a.json',
  });
  await expect(page.getByText('File Input Alpha')).toBeVisible();
  await expect(input).toHaveValue('');

  await input.setInputFiles({
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, ' '),
    mimeType: 'application/json',
    name: 'big.json',
  });
  await expect(page.getByText('Import file too large (max 2MB)')).toBeVisible();
  await expect(page.getByText('File Input Alpha')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirm Import' })).toHaveCount(0);
  await expect(input).toHaveValue('');

  await input.setInputFiles({ buffer: Buffer.from(brokenYaml), mimeType: 'application/x-yaml', name: 'template.yaml' });
  await expect(page.getByText(/Failed to parse file: Template validation failed: Section 1 > title/)).toBeVisible();
  await expect(input).toHaveValue('');

  await input.setInputFiles({
    buffer: Buffer.from(brokenYaml.replace('title: ""', 'title: Prep')),
    mimeType: 'application/x-yaml',
    name: 'template.yaml',
  });
  await expect(page.getByText('Fixed YAML Template')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm Import' })).toBeEnabled();
  await expect(input).toHaveValue('');
});
