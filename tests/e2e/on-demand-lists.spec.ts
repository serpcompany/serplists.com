import { expect, test } from '@playwright/test';

import { apiJson } from './support/api-requests';
import { apiRunSchema, createdRunSchema, sectionsOfStoredItems } from './support/api-bodies';
import { openRunFromRunsList } from './support/navigation';
import { loginAsAdmin } from './support/sign-in';
import { deleteRun, runIdInTheUrl, startARunFromTheFirstStartRun } from './support/run-saves';
import { createTemplate, deleteTemplate } from './support/template-editor';

test('starts a run from a public template page opened directly', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/profile/admin/sample-technical-seo-audit-checklist/');

  await startARunFromTheFirstStartRun(page);

  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+\/$/);
  await deleteRun(page, runIdInTheUrl(page));
});

test('keeps toggled tasks and advances on a run opened from the runs dashboard', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Toggle QA ${Date.now()}`;
  const { id: runId } = await apiJson(page, '/checklists', createdRunSchema, {
    method: 'POST',
    body: {
      title,
      sections: [{ id: 'toggle-section', title: 'Section', items: [
        { id: 'toggle-one', title: 'First task' },
        { id: 'toggle-two', title: 'Second task' },
      ] }],
    },
  });

  await openRunFromRunsList(page, title);

  const completeTask = async () => {
    const saved = page.waitForResponse(
      (response) => response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Mark Complete' }).click();
    expect((await saved).status()).toBe(200);
  };

  await expect(page.getByRole('heading', { name: 'First task' })).toBeVisible();
  await completeTask();
  await expect(page.getByRole('heading', { name: 'Second task' })).toBeVisible();
  await completeTask();

  const run = await apiJson(page, `/checklists/${runId}`, apiRunSchema);
  const sections = sectionsOfStoredItems(run.items);
  const completed = sections.flatMap((section) => section.items.map((item) => item.isCompleted === true));
  expect(completed).toEqual([true, true]);
  await deleteRun(page, runId);
});

test('saves a template twice from the editor without a conflict or loading a template list', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Editor save QA ${Date.now()}`;
  const templateId = await createTemplate(page, {
    title,
    sections: [{ id: 'save-section', title: 'Section', items: [{ id: 'save-task', title: 'Task' }] }],
  });

  const templateListRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.endsWith('/api/templates') && url.search) templateListRequests.push(url.search);
  });
  await page.goto(`/dashboard/templates/${templateId}/edit/`);
  const nameInput = page.getByPlaceholder('Enter template name...');
  await expect(nameInput).toHaveValue(title);

  for (const suffix of [' v2', ' v3']) {
    await nameInput.fill(`${title}${suffix}`);
    const saved = page.waitForResponse(
      (response) => response.url().includes(`/api/templates/${templateId}`) && response.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: 'Save' }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  }

  expect(templateListRequests).toEqual([]);
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
    await page.goto(`/dashboard/templates/${templateId}/`);
    const visibilitySwitch = page.getByRole('switch');
    await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'false');

    expect(templateRequests.filter(isList)).toEqual([]);
    expect(templateRequests.filter((path) => path === `/api/templates/${templateId}`)).toHaveLength(1);

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
