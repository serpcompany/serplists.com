import { expect, test, type Page } from '@playwright/test';

// Template and run lists load only on pages that show them (docs/FRONTEND.md). These
// flows must not depend on a list another page happened to load earlier.

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

test('starts a run from a public template page opened directly', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/profile/admin/technical-seo-audit-checklist');

  await page.getByRole('button', { name: 'Start Run' }).first().click();

  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+$/);
  await deleteRun(page, decodeURIComponent(new URL(page.url()).pathname.split('/').pop() ?? ''));
});

test('keeps toggled tasks and advances on a run opened from the runs dashboard', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Toggle QA ${Date.now()}`;
  const runId = await page.evaluate(async ({ runTitle, apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/checklists`, {
      body: JSON.stringify({
        title: runTitle,
        sections: [{ id: 'toggle-section', title: 'Section', items: [
          { id: 'toggle-one', title: 'First task' },
          { id: 'toggle-two', title: 'Second task' },
        ] }],
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) throw new Error(`Failed to create run: ${response.status}`);
    return ((await response.json()) as { id: string }).id;
  }, { runTitle: title, apiBaseUrl: DEV_API_BASE_URL });

  // The runs dashboard loads the run list; open the run in the same app session.
  await page.goto('/dashboard/runs');
  await page.getByRole('link', { name: title }).click();

  const completeTask = async () => {
    const saved = page.waitForResponse(
      (response) => response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Mark Complete' }).click();
    expect((await saved).status()).toBe(200);
  };

  // Completing a task moves straight on to the next one.
  await expect(page.getByRole('heading', { name: 'First task' })).toBeVisible();
  await completeTask();
  await expect(page.getByRole('heading', { name: 'Second task' })).toBeVisible();
  await completeTask();

  const completed = await page.evaluate(async ({ id, apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include' });
    const run = (await response.json()) as { items: string | Array<{ items: Array<{ isCompleted?: boolean }> }> };
    const sections = typeof run.items === 'string' ? JSON.parse(run.items) : run.items;
    return sections.flatMap((section: { items: Array<{ isCompleted?: boolean }> }) => section.items.map((item) => item.isCompleted === true));
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
  expect(completed).toEqual([true, true]);
  await deleteRun(page, runId);
});

test('saves a template twice from the editor without loading a template list', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Editor save QA ${Date.now()}`;
  const templateId = await page.evaluate(async ({ templateTitle, apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/templates`, {
      body: JSON.stringify({
        title: templateTitle,
        sections: [{ id: 'save-section', title: 'Section', items: [{ id: 'save-task', title: 'Task' }] }],
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) throw new Error(`Failed to create template: ${response.status}`);
    return ((await response.json()) as { id: string }).id;
  }, { templateTitle: title, apiBaseUrl: DEV_API_BASE_URL });

  // The editor loads its template by id; a list request (?scope= or ?teamId=) is waste.
  const listRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.endsWith('/api/templates') && url.search) listRequests.push(url.search);
  });
  await page.goto(`/dashboard/templates/${templateId}/edit`);
  const nameInput = page.getByPlaceholder('Enter template name...');
  await expect(nameInput).toHaveValue(title);

  for (const suffix of [' v2', ' v3']) {
    await nameInput.fill(`${title}${suffix}`);
    const saved = page.waitForResponse(
      (response) => response.url().includes(`/api/templates/${templateId}`) && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Save' }).click();
    // The second save sends the version the first one returned, so neither is a 409.
    expect((await saved).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  }

  expect(listRequests).toEqual([]);
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/templates/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: templateId, apiBaseUrl: DEV_API_BASE_URL });
});
