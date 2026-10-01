import { expect, test } from '@playwright/test';

import { apiRecord as callApi } from './support/api-requests';
import { loginAsAdmin } from './support/sign-in';

const TITLE_LIMIT_SHARED_BY_RUNS_AND_TEMPLATES = 160;

test('Start Run on a public template with a 160-character title creates the run under a shortened default name', async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = String(Date.now());
  const title = `Long ${stamp} `.padEnd(TITLE_LIMIT_SHARED_BY_RUNS_AND_TEMPLATES, 'x');
  const created = await callApi(page, 'POST', '/templates', {
    title,
    slug: `long-run-name-${stamp}`,
    is_public: true,
    sections: [{ id: 'long-section', title: 'Section', items: [{ id: 'long-item', title: 'Task' }] }],
  });
  const templateId = String(created.id);
  let runId: string | undefined;

  try {
    await page.goto(`/profile/admin/${String(created.slug)}/`);
    await page.getByRole('button', { name: 'Start Run' }).first().click();
    await page.getByRole('dialog', { name: 'Start a Run' }).getByRole('button', { name: 'Start Run' }).click();
    await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+\/$/);
    runId = new URL(page.url()).pathname.split('/').filter(Boolean).pop();

    const run = await callApi(page, 'GET', `/checklists/${runId}`);
    expect(String(run.title).length).toBeLessThanOrEqual(TITLE_LIMIT_SHARED_BY_RUNS_AND_TEMPLATES);
    expect(String(run.title).startsWith(`Long ${stamp}`)).toBe(true);
  } finally {
    if (runId) await callApi(page, 'DELETE', `/checklists/${runId}`);
    await callApi(page, 'DELETE', `/templates/${templateId}`);
  }
});
