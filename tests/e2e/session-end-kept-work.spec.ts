import { expect, test, type Page } from '@playwright/test';

import { trackApiRequests } from './support/api-requests';

// A session that ends in the background (a sign-out in another tab, an expired or revoked
// session) unmounts every signed-in page and sends the tab to /login without a question. Unsaved
// work is kept on the tab first and offered back after sign-in (src/lib/navigation/leaveGuard.ts).
// Tab 1 is never reloaded here.

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function signIn(page: Page) {
  const apiRequests = trackApiRequests(page, DEV_API_BASE_URL);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible({ timeout: 30_000 });
  // Let the landing page's requests finish before the test calls the API, which the local
  // dev proxy can drop in a burst (see support/api-requests.ts).
  await apiRequests.settled();
}

// On /login, where RequireAuth sent the tab: signing in returns to the page it was on.
async function signInAgain(page: Page) {
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByText('Your session ended. Sign in again.')).toBeVisible();
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signOutInAnotherTab(page: Page) {
  const other = await page.context().newPage();
  await other.goto('/dashboard/templates');
  await other.locator('header').first().getByRole('button', { name: 'Account menu' }).click();
  await other.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(other.getByRole('link', { name: 'Log in' }).first()).toBeVisible({ timeout: 15_000 });
  await other.close();
  await page.bringToFront();
}

async function callApi<T>(page: Page, path: string, method: string, body?: unknown): Promise<T> {
  return page.evaluate(async ({ apiBaseUrl, requestPath, requestMethod, requestBody }) => {
    const response = await fetch(`${apiBaseUrl}${requestPath}`, {
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: requestMethod,
    });
    if (!response.ok) throw new Error(`${requestMethod} ${requestPath} failed: ${response.status}`);
    return response.json();
  }, { apiBaseUrl: DEV_API_BASE_URL, requestPath: path, requestMethod: method, requestBody: body }) as Promise<T>;
}

test('edits to an existing template are offered back after another tab signs out', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const title = `Kept edits QA ${Date.now()}`;
  const created = await callApi<{ id: string }>(page, '/templates', 'POST', {
    title,
    sections: [{ id: `kept-${Date.now()}`, title: 'Checklist', items: [{ id: `kept-task-${Date.now()}`, title: 'Check DNS' }] }],
    is_public: false,
  });

  await page.goto(`/dashboard/templates/${created.id}/edit`);
  const titleField = page.getByPlaceholder('Enter template name...');
  await expect(titleField).toHaveValue(title);
  await titleField.fill(`${title} (edited)`);

  await signOutInAnotherTab(page);
  await signInAgain(page);

  await expect(page).toHaveURL(new RegExp(`/dashboard/templates/${created.id}/edit`), { timeout: 30_000 });
  await expect(titleField).toHaveValue(title);
  await expect(page.getByText('Unsaved template draft')).toBeVisible();
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(titleField).toHaveValue(`${title} (edited)`);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Template saved').first()).toBeVisible();
  const stored = await callApi<{ title: string }>(page, `/templates/${created.id}`, 'GET');
  expect(stored.title).toBe(`${title} (edited)`);

  // Saved: the draft is not offered again.
  await page.goto(`/dashboard/templates/${created.id}/edit`);
  await expect(titleField).toHaveValue(`${title} (edited)`);
  await expect(page.getByText('Unsaved template draft')).toHaveCount(0);

  await callApi(page, `/templates/${created.id}`, 'DELETE');
});

// The kept edits were made on the version the editor had loaded. Restored, they save against
// that version, so a save made elsewhere meanwhile ends in the edit conflict, not an overwrite.
test('restored edits to a template saved elsewhere meanwhile get the edit conflict', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const title = `Kept conflict QA ${Date.now()}`;
  const created = await callApi<{ id: string }>(page, '/templates', 'POST', {
    title,
    sections: [{ id: `kept-conflict-${Date.now()}`, title: 'Checklist', items: [{ id: `kept-conflict-task-${Date.now()}`, title: 'Check DNS' }] }],
    is_public: false,
  });
  const loaded = await callApi<{ version: number }>(page, `/templates/${created.id}`, 'GET');

  await page.goto(`/dashboard/templates/${created.id}/edit`);
  const titleField = page.getByPlaceholder('Enter template name...');
  await expect(titleField).toHaveValue(title);
  await titleField.fill(`${title} (draft)`);

  // Another tab saves the template while these edits are unsaved: its version moves on.
  await callApi(page, `/templates/${created.id}`, 'PUT', {
    title: `${title} (saved elsewhere)`,
    expected_version: loaded.version,
  });

  await signOutInAnotherTab(page);
  await signInAgain(page);

  await expect(page).toHaveURL(new RegExp(`/dashboard/templates/${created.id}/edit`), { timeout: 30_000 });
  await expect(titleField).toHaveValue(`${title} (saved elsewhere)`);
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(titleField).toHaveValue(`${title} (draft)`);

  const saveResponse = page.waitForResponse(
    (response) => response.url().includes(`/api/templates/${created.id}`) && response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = await saveResponse;
  expect(saved.request().postDataJSON()).toMatchObject({ expected_version: loaded.version });
  expect(saved.status()).toBe(409);
  await expect(page.getByRole('button', { name: 'Load latest version' })).toBeVisible();
  const stored = await callApi<{ title: string }>(page, `/templates/${created.id}`, 'GET');
  expect(stored.title).toBe(`${title} (saved elsewhere)`);

  await callApi(page, `/templates/${created.id}`, 'DELETE');
});

test('unsaved task notes are offered back after another tab signs out', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const created = await callApi<{ id: string }>(page, '/checklists', 'POST', {
    title: `Kept notes QA ${Date.now()}`,
    sections: [{ id: 'kept', title: 'Section', items: [{ id: 'kept-a', title: 'Task A' }] }],
  });
  const notes = page.getByRole('textbox', { name: 'Task notes' });

  await page.goto(`/dashboard/runs/${created.id}`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await notes.fill('Deployed build 42');

  // Signing out in this tab asks first.
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.locator('header').first().getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await expect(notes).toHaveValue('Deployed build 42');

  await signOutInAnotherTab(page);
  await signInAgain(page);

  await expect(page).toHaveURL(new RegExp(`/dashboard/runs/${created.id}`), { timeout: 30_000 });
  await expect(notes).toHaveValue('Deployed build 42');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Saved to this run')).toBeVisible();

  await callApi(page, `/checklists/${created.id}`, 'DELETE');
});

// A confirmed sign-out returns the tab to Personal, so the new-template draft kept in an
// Organization is offered from Personal with a switch back to its Organization.
test("a new template's draft kept in an Organization is offered after signing in again", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const organization = await callApi<{ id: string; name: string }>(page, '/teams', 'POST', {
    name: `Kept draft Org ${Date.now()}`,
  });
  await page.evaluate((teamId) => window.localStorage.setItem('serplists.activeWorkspaceId', teamId), organization.id);
  await page.goto('/dashboard/templates/new');
  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText(organization.name, {
    timeout: 30_000,
  });
  const title = `Org kept draft QA ${Date.now()}`;
  const titleField = page.getByPlaceholder('Enter template name...');
  await titleField.fill(title);

  // The session ends on the server; Save gets a 401 and the tab signs out.
  await context.clearCookies();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await signInAgain(page);

  await expect(page).toHaveURL(/\/dashboard\/templates\/new/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText('Personal');
  await expect(page.getByText(`Unsaved template draft in ${organization.name}`)).toBeVisible();
  await page.getByRole('button', { name: `Switch to ${organization.name}` }).click();
  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText(organization.name);
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(titleField).toHaveValue(title);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/templates$/, { timeout: 30_000 });
  const saved = await callApi<Array<{ id: string; title: string }>>(page, `/templates?teamId=${organization.id}`, 'GET');
  const created = saved.find((template) => template.title === title);
  expect(created).toBeTruthy();

  await callApi(page, `/templates/${created?.id}`, 'DELETE');
});
