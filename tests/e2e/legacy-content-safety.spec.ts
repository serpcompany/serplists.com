import { test, expect, login, endpoint } from './fixtures/real-d1';
import { recordRouteScenarios } from '../../scripts/data/route-coverage-evidence.mjs';

test('@real-d1 invalid stored legacy content is an error, never an editable empty checklist', async ({ page, context }) => {
  test.skip(process.env.PLAYWRIGHT_ROUTE_NEGATIVE === '1');
  await login(page, 'legacy');
  const beforeTemplate = await (await context.request.get(`${endpoint}/templates/legacy-invalid-template`)).json();
  const beforeRun = await (await context.request.get(`${endpoint}/checklists/legacy-invalid-run`)).json();
  expect(beforeTemplate.content_error).toBe('invalid_checklist_content');
  expect(beforeTemplate.sections).toBeUndefined();
  await page.goto('/dashboard/templates');
  await expect(page.getByText('Valid Legacy Template', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Some templates contain invalid content' })).toBeVisible();
  await page.goto('/dashboard/templates/legacy-invalid-template/edit');
  await expect(page.getByText('Unable to load template', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /save changes|save template/i })).toHaveCount(0);
  const duplicateBefore = await (await context.request.get(`${endpoint}/templates/legacy-duplicate-template`)).json();
  await page.goto('/dashboard/templates/legacy-duplicate-template/edit');
  await expect(page.getByText('Unable to load template', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  expect(await (await context.request.get(`${endpoint}/templates/legacy-duplicate-template`)).json()).toEqual(duplicateBefore);
  await page.goto('/dashboard/templates/legacy-invalid-template');
  await expect(page.getByRole('alert').filter({ hasText: 'This checklist contains invalid content' })).toBeVisible();
  await page.goto('/dashboard/runs');
  await expect(page.getByText('Valid Legacy Run', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Some runs contain invalid content' })).toBeVisible();
  await page.goto('/dashboard/runs/legacy-invalid-run');
  await expect(page.getByText(/This checklist contains invalid content/).first()).toBeVisible();
  await page.goto('/dashboard/templates/legacy-valid-template');
  await expect(page.getByText('Legacy text remains readable', { exact: true })).toBeVisible();
  expect(await (await context.request.get(`${endpoint}/templates/legacy-invalid-template`)).json()).toEqual(beforeTemplate);
  expect(await (await context.request.get(`${endpoint}/checklists/legacy-invalid-run`)).json()).toEqual(beforeRun);
  recordRouteScenarios(['legacy-content-safety']);
});

test('@real-d1 editing and saving a template retains opaque legacy extensions', async ({ page, context }) => {
  test.skip(process.env.PLAYWRIGHT_ROUTE_NEGATIVE === '1');
  await login(page);
  const sections = [{ id: 'extension-section', title: 'Section', extension: { keep: 'section' }, items: [{
    id: 'extension-item', title: 'Task', extension: ['item'], contents: [{
      type: 'text', value: 'Keep text', extension: { keep: 'content' },
    }, { id: '1-1-content-1', type: 'text', value: 'Keep collision control', extension: 'second-content' }],
  }] }];
  const response = await context.request.post(`${endpoint}/templates`, { data: { title: 'Extension browser proof', sections, is_public: false } });
  expect(response.status()).toBe(200);
  const created = await response.json();
  try {
    await page.goto(`/dashboard/templates/${created.id}/edit`);
    await page.getByPlaceholder('Enter template name...').fill('Extension browser proof edited');
    const saved = page.waitForResponse(response => response.url().endsWith(`/templates/${created.id}`) && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await saved).status()).toBe(200);
    const stored = await (await context.request.get(`${endpoint}/templates/${created.id}`)).json();
    expect(stored.title).toBe('Extension browser proof edited');
    expect(stored.sections[0].extension).toEqual({ keep: 'section' });
    expect(stored.sections[0].items[0].extension).toEqual(['item']);
    expect(stored.sections[0].items[0].contents[0].extension).toEqual({ keep: 'content' });
    expect(stored.sections[0].items[0].contents[0].value).toBe('Keep text');
    expect(stored.sections[0].items[0].contents[1].id).toBe('1-1-content-1');
    expect(stored.sections[0].items[0].contents[0].id).not.toBe('1-1-content-1');
    expect(stored.sections[0].items[0].contents[1].extension).toBe('second-content');
    recordRouteScenarios(['legacy-extension-save']);
  } finally {
    expect((await context.request.delete(`${endpoint}/templates/${created.id}`)).status()).toBe(200);
  }
});
