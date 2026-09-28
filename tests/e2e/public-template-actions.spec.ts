import { expect, test, type Page } from '@playwright/test';

// Start Run and Save on a public template page act once per click intent
// (src/pages/PublicTemplate.tsx, src/components/template/PublicTemplateView.tsx).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';
const PUBLIC_TEMPLATE_PATH = '/profile/serp/ultimate-camping-checklist';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function openPublicTemplate(page: Page) {
  await page.goto(PUBLIC_TEMPLATE_PATH);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ultimate Camping Checklist' }),
  ).toBeVisible();
}

test('a double click on the header Start Run creates one run', async ({ page }) => {
  await loginAsAdmin(page);
  const runCreates: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/api/checklists')) {
      runCreates.push(request.url());
    }
  });

  await openPublicTemplate(page);
  // The sticky header button comes first in the page; the bottom call-to-action is second.
  await page.getByRole('button', { name: 'Start Run' }).first().dblclick();
  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+$/);
  expect(runCreates).toHaveLength(1);

  const runId = new URL(page.url()).pathname.split('/').pop();
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
});
