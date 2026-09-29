import { expect, test, type Page } from '@playwright/test';

import { apiJson, apiRequest } from './support/api-requests';

// Template and run lists load only on pages that show them (docs/FRONTEND.md). These
// flows must not depend on a list another page happened to load earlier.

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function deleteRun(page: Page, runId: string) {
  await apiRequest(page, `/checklists/${runId}`, { method: 'DELETE' });
}

async function deleteTemplate(page: Page, templateId: string) {
  await apiRequest(page, `/templates/${templateId}`, { method: 'DELETE' });
}

async function createTemplate(page: Page, body: Record<string, unknown>): Promise<string> {
  return (await apiJson<{ id: string }>(page, '/templates', { method: 'POST', body })).id;
}

test('starts a run from a public template page opened directly', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/profile/admin/sample-technical-seo-audit-checklist');

  await page.getByRole('button', { name: 'Start Run' }).first().click();

  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+$/);
  await deleteRun(page, decodeURIComponent(new URL(page.url()).pathname.split('/').pop() ?? ''));
});

test('keeps toggled tasks and advances on a run opened from the runs dashboard', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Toggle QA ${Date.now()}`;
  const { id: runId } = await apiJson<{ id: string }>(page, '/checklists', {
    method: 'POST',
    body: {
      title,
      sections: [{ id: 'toggle-section', title: 'Section', items: [
        { id: 'toggle-one', title: 'First task' },
        { id: 'toggle-two', title: 'Second task' },
      ] }],
    },
  });

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

  type Sections = Array<{ items: Array<{ isCompleted?: boolean }> }>;
  const run = await apiJson<{ items: string | Sections }>(page, `/checklists/${runId}`);
  const sections = (typeof run.items === 'string' ? JSON.parse(run.items) : run.items) as Sections;
  const completed = sections.flatMap((section) => section.items.map((item) => item.isCompleted === true));
  expect(completed).toEqual([true, true]);
  await deleteRun(page, runId);
});

test('saves a template twice from the editor without loading a template list', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Editor save QA ${Date.now()}`;
  const templateId = await createTemplate(page, {
    title,
    sections: [{ id: 'save-section', title: 'Section', items: [{ id: 'save-task', title: 'Task' }] }],
  });

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
  await deleteTemplate(page, templateId);
});

test('opens a template detail page with one request for that template and no list', async ({ page }) => {
  await loginAsAdmin(page);
  const templateId = await createTemplate(page, {
    title: `Detail Load QA ${Date.now()}`,
    is_public: false,
    sections: [{ id: 'detail-section', title: 'Section', items: [{ id: 'detail-item', title: 'Task' }] }],
  });

  const templateRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.startsWith('/api/templates')) {
      templateRequests.push(`${url.pathname}${url.search}`);
    }
  });
  const isList = (path: string) => path === '/api/templates' || path.startsWith('/api/templates?');

  try {
    await page.goto(`/dashboard/templates/${templateId}`);
    const visibilitySwitch = page.getByRole('switch');
    await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'false');

    expect(templateRequests.filter(isList)).toEqual([]);
    expect(templateRequests.filter((path) => path === `/api/templates/${templateId}`)).toHaveLength(1);

    // Each change refetches the one template, so the next change is accepted too.
    for (const [nextChecked, message] of [['true', 'Template is now public'], ['false', 'Template is now private']] as const) {
      const saved = page.waitForResponse(
        (response) => response.url().includes(`/api/templates/${templateId}`) && response.request().method() === 'PUT',
      );
      await visibilitySwitch.click();
      expect((await saved).status()).toBe(200);
      await expect(page.getByText(message)).toBeVisible();
      await expect(visibilitySwitch).toHaveAttribute('aria-checked', nextChecked);
    }

    expect(templateRequests.filter(isList)).toEqual([]);
  } finally {
    await deleteTemplate(page, templateId);
  }
});
