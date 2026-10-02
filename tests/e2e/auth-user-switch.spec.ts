import { expect, test, type Page } from '@playwright/test';

import { apiJson, apiRequest, bodyNotRead } from './support/api-requests';
import { createdRunSchema } from './support/api-bodies';
import { navigateInApp } from './support/navigation';
import { signOutFromTheAccountMenu as signOut, submitTheSignInForm, type TestUser } from './support/sign-in';
import { runIdInTheUrl, startARunFromTheFirstStartRun } from './support/run-saves';

async function signIn(page: Page, user: TestUser) {
  await navigateInApp(page, '/login/');
  await submitTheSignInForm(page, user);
}

async function createRun(page: Page, title: string): Promise<string> {
  const run = await apiJson(page, '/checklists', createdRunSchema, {
    method: 'POST',
    body: {
      title,
      sections: [{ id: 'switch-section', title: 'Section', items: [{ id: 'switch-task', title: 'Task' }] }],
    },
  });
  return run.id;
}

async function startRunFromTemplate(page: Page, templatePath: string): Promise<string> {
  await navigateInApp(page, templatePath);
  await startARunFromTheFirstStartRun(page);
  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+\/$/, { timeout: 15_000 });
  return runIdInTheUrl(page);
}

async function deleteRuns(page: Page, runIds: string[]) {
  await Promise.all(runIds.map((id) => apiRequest(page, `/checklists/${id}`, bodyNotRead, { method: 'DELETE' })));
}

test('a user who signs in after another on the same tab never sees the other user\'s runs, even after a run start refreshes the lists', async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now();
  const adminRunTitle = `Admin switch run ${suffix}`;
  const johnRunTitle = `John switch run ${suffix}`;

  await page.goto('/');
  await signIn(page, 'admin');
  const adminRunId = await createRun(page, adminRunTitle);
  await navigateInApp(page, '/dashboard/runs/');
  await expect(page.getByRole('link', { name: adminRunTitle })).toBeVisible({ timeout: 15_000 });
  await signOut(page);

  await signIn(page, 'john');
  const johnRunIds = [
    await createRun(page, johnRunTitle),
    await startRunFromTemplate(page, '/profile/admin/sample-technical-seo-audit-checklist/'),
  ];
  await navigateInApp(page, '/dashboard/runs/');
  await expect(page.getByRole('link', { name: johnRunTitle })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: adminRunTitle })).toHaveCount(0);
  await deleteRuns(page, johnRunIds);
  await signOut(page);

  await signIn(page, 'admin');
  await navigateInApp(page, '/dashboard/runs/');
  await expect(page.getByRole('link', { name: adminRunTitle })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: johnRunTitle })).toHaveCount(0);
  await deleteRuns(page, [adminRunId]);
});
