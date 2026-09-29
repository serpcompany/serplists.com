import { expect, test, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';
import { fillSignInForm } from './support/sign-in';

// A template title may use the whole 160-character limit that run titles share, so the
// default run name shortens the title instead of failing (src/lib/runs/runName.ts).

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function callApi(page: Page, method: string, path: string, body?: unknown) {
  return apiJson<Record<string, unknown>>(page, path, { method, body });
}

test('Start Run on a public template with a 160-character title creates the run', async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = String(Date.now());
  const title = `Long ${stamp} `.padEnd(160, 'x');
  const created = await callApi(page, 'POST', '/templates', {
    title,
    slug: `long-run-name-${stamp}`,
    is_public: true,
    sections: [{ id: 'long-section', title: 'Section', items: [{ id: 'long-item', title: 'Task' }] }],
  });
  const templateId = String(created.id);
  let runId: string | undefined;

  try {
    await page.goto(`/profile/admin/${String(created.slug)}`);
    await page.getByRole('button', { name: 'Start Run' }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+$/);
    runId = new URL(page.url()).pathname.split('/').pop();

    const run = await callApi(page, 'GET', `/checklists/${runId}`);
    expect(String(run.title).length).toBeLessThanOrEqual(160);
    expect(String(run.title).startsWith(`Long ${stamp}`)).toBe(true);
  } finally {
    if (runId) await callApi(page, 'DELETE', `/checklists/${runId}`);
    await callApi(page, 'DELETE', `/templates/${templateId}`);
  }
});
