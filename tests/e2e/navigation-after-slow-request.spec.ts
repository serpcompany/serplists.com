import { expect, test, type Page } from '@playwright/test';

// Pages that await a request and then navigate (Start Run to the new run, Save to the
// template list) must not pull a user who already left back to that destination: React
// Router still runs a navigate() from a page that is gone.

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function deleteRun(page: Page, runId: string) {
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
}

async function deleteTemplate(page: Page, templateId: string) {
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/templates/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: templateId, apiBaseUrl: DEV_API_BASE_URL });
}

async function createTemplateViaApi(page: Page, title: string): Promise<string> {
  return page.evaluate(async ({ templateTitle, apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/templates`, {
      body: JSON.stringify({
        is_public: false,
        sections: [{ id: 'slow-section', title: 'Prep', items: [{ id: 'slow-task', title: 'First task' }] }],
        title: templateTitle,
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) throw new Error(`Failed to create template: ${response.status}`);
    return ((await response.json()) as { id: string }).id;
  }, { templateTitle: title, apiBaseUrl: DEV_API_BASE_URL });
}

// Holds the next run creation until release() and records the created run's id.
async function holdRunCreation(page: Page) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const created: { runId: string | null } = { runId: null };

  await page.route('**/api/checklists', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    await held;
    const response = await route.fetch();
    const body = (await response.json()) as { id?: string };
    created.runId = body.id ?? null;
    await route.fulfill({ response });
  });

  return { created, release };
}

test('stays on the page the user went Back to when a public Start Run finishes', async ({ page }) => {
  await loginAsAdmin(page);
  const { created, release } = await holdRunCreation(page);

  await page.goto('/templates');
  await page.goto('/profile/admin/sample-technical-seo-audit-checklist');
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  await page.goBack();
  await expect(page).toHaveURL(/\/templates$/);

  release();
  await expect.poll(() => created.runId).toBeTruthy();
  // Give a late navigation the chance to happen before checking it did not.
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/templates$/);

  await deleteRun(page, created.runId ?? '');
});

test('stays on the page the user went Back to when a template Start Run finishes', async ({ page }) => {
  await loginAsAdmin(page);
  const templateId = await createTemplateViaApi(page, `QA slow run ${Date.now()}`);
  const { created, release } = await holdRunCreation(page);

  await page.goto('/dashboard/templates');
  await page.goto(`/dashboard/templates/${templateId}`);
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  await page.getByRole('button', { name: 'Start Checklist' }).click();
  await expect(page.getByRole('button', { name: 'Creating...' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/templates$/);

  release();
  await expect.poll(() => created.runId).toBeTruthy();
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/dashboard\/templates$/);

  await deleteRun(page, created.runId ?? '');
  await deleteTemplate(page, templateId);
});

test('opens the new run when the user waits on the template page', async ({ page }) => {
  await loginAsAdmin(page);
  const templateId = await createTemplateViaApi(page, `QA run stays ${Date.now()}`);

  await page.goto(`/dashboard/templates/${templateId}`);
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  await page.getByRole('button', { name: 'Start Checklist' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+$/);

  await deleteRun(page, decodeURIComponent(new URL(page.url()).pathname.split('/').pop() ?? ''));
  await deleteTemplate(page, templateId);
});
