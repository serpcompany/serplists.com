import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL, apiJsonAt as callApi, bodyNotRead, trackApiRequests } from './support/api-requests';
import { apiTemplateRows, apiTemplateSchema, createdOrganization, createdRunSchema, savedTemplateSchema, templateVersion } from './support/api-bodies';
import { endSessionSilently, fillSignInForm, loginAsAdmin } from './support/sign-in';

async function signInAgainAfterTheSessionEnded(page: Page) {
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByText('Your session ended. Sign in again.')).toBeVisible();
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signOutInAnotherTab(page: Page) {
  const other = await page.context().newPage();
  await other.goto('/dashboard/templates/');
  await other.getByRole('button', { name: 'Account menu' }).click();
  await other.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(other.getByRole('link', { name: 'Log in' }).first()).toBeVisible({ timeout: 15_000 });
  await other.close();
  await page.bringToFront();
}

async function signOutInAnotherTabAndSignInAgainAt(page: Page, backAt: RegExp) {
  await signOutInAnotherTab(page);
  await signInAgainAfterTheSessionEnded(page);
  await expect(page).toHaveURL(backAt, { timeout: 30_000 });
}

async function startSigningOutThenCancelAtThePrompt(page: Page) {
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}

test('edits to an existing template are offered back after another tab signs out', async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page);
  const title = `Kept edits QA ${Date.now()}`;
  const created = await callApi(page, '/templates', 'POST', savedTemplateSchema, {
    title,
    sections: [{ id: `kept-${Date.now()}`, title: 'Checklist', items: [{ id: `kept-task-${Date.now()}`, title: 'Check DNS' }] }],
    is_public: false,
  });

  await page.goto(`/dashboard/templates/${created.id}/edit/`);
  const titleField = page.getByPlaceholder('Enter template name...');
  await expect(titleField).toHaveValue(title);
  await titleField.fill(`${title} (edited)`);

  await signOutInAnotherTabAndSignInAgainAt(page, new RegExp(`/dashboard/templates/${created.id}/edit`));
  await expect(titleField).toHaveValue(title);
  await expect(page.getByText('Unsaved template draft')).toBeVisible();
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(titleField).toHaveValue(`${title} (edited)`);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Template saved').first()).toBeVisible();
  const stored = await callApi(page, `/templates/${created.id}`, 'GET', apiTemplateSchema);
  expect(stored.title).toBe(`${title} (edited)`);

  await page.goto(`/dashboard/templates/${created.id}/edit/`);
  await expect(titleField).toHaveValue(`${title} (edited)`);
  await expect(page.getByText('Unsaved template draft')).toHaveCount(0);

  await callApi(page, `/templates/${created.id}`, 'DELETE', bodyNotRead);
});

test('restored edits to a template saved elsewhere meanwhile get the edit conflict instead of overwriting it', async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page);
  const title = `Kept conflict QA ${Date.now()}`;
  const created = await callApi(page, '/templates', 'POST', savedTemplateSchema, {
    title,
    sections: [{ id: `kept-conflict-${Date.now()}`, title: 'Checklist', items: [{ id: `kept-conflict-task-${Date.now()}`, title: 'Check DNS' }] }],
    is_public: false,
  });
  const loaded = await callApi(page, `/templates/${created.id}`, 'GET', templateVersion);

  await page.goto(`/dashboard/templates/${created.id}/edit/`);
  const titleField = page.getByPlaceholder('Enter template name...');
  await expect(titleField).toHaveValue(title);
  await titleField.fill(`${title} (draft)`);

  await callApi(page, `/templates/${created.id}`, 'PUT', bodyNotRead, {
    title: `${title} (saved elsewhere)`,
    expected_version: loaded.version,
  });

  await signOutInAnotherTabAndSignInAgainAt(page, new RegExp(`/dashboard/templates/${created.id}/edit`));
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
  const stored = await callApi(page, `/templates/${created.id}`, 'GET', apiTemplateSchema);
  expect(stored.title).toBe(`${title} (saved elsewhere)`);

  await callApi(page, `/templates/${created.id}`, 'DELETE', bodyNotRead);
});

test('unsaved task notes survive a cancelled sign-out and are offered back after another tab signs out', async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page);
  const created = await callApi(page, '/checklists', 'POST', createdRunSchema, {
    title: `Kept notes QA ${Date.now()}`,
    sections: [{ id: 'kept', title: 'Section', items: [{ id: 'kept-a', title: 'Task A' }] }],
  });
  const notes = page.getByRole('textbox', { name: 'Task notes' });

  await page.goto(`/dashboard/runs/${created.id}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await notes.fill('Deployed build 42');

  await startSigningOutThenCancelAtThePrompt(page);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await expect(notes).toHaveValue('Deployed build 42');

  await signOutInAnotherTabAndSignInAgainAt(page, new RegExp(`/dashboard/runs/${created.id}`));
  await expect(notes).toHaveValue('Deployed build 42');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Saved to this run')).toBeVisible();

  await callApi(page, `/checklists/${created.id}`, 'DELETE', bodyNotRead);
});

test("a new template's draft kept in an Organization is offered from Personal's editor after signing in again, with a switch back to it", async ({ page, context }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page);
  const organization = await callApi(page, '/teams', 'POST', createdOrganization, {
    name: `Kept draft Org ${Date.now()}`,
  });
  const organizationEditor = `/dashboard/organization/${organization.id}/templates/new/`;
  const organizationEditorLoads = trackApiRequests(page, API_BASE_URL);
  await page.goto(organizationEditor);
  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText(organization.name, {
    timeout: 30_000,
  });
  const title = `Org kept draft QA ${Date.now()}`;
  const titleField = page.getByPlaceholder('Enter template name...');
  await titleField.fill(title);
  await organizationEditorLoads.settled();

  await endSessionSilently(context);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await signInAgainAfterTheSessionEnded(page);

  await expect(page).toHaveURL(new RegExp(`${organizationEditor}$`), { timeout: 30_000 });
  await page.goto('/dashboard/templates/new/');
  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText('Personal', {
    timeout: 30_000,
  });
  await expect(page.getByText(`Unsaved template draft in ${organization.name}`)).toBeVisible();
  await page.getByRole('button', { name: `Switch to ${organization.name}` }).click();
  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText(organization.name);
  await page.getByRole('button', { name: 'Restore draft' }).click();
  await expect(titleField).toHaveValue(title);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/organization/${organization.id}/templates/$`), { timeout: 30_000 });
  const saved = await callApi(page, `/templates?teamId=${organization.id}`, 'GET', apiTemplateRows);
  const created = saved.find((template) => template.title === title);
  expect(created).toBeTruthy();

  await callApi(page, `/templates/${created?.id}`, 'DELETE', bodyNotRead);
});
