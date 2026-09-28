import { expect, test, type Page } from '@playwright/test';

// Sign-out and sign-in are SPA navigations, so the React Query cache outlives a session
// (docs/FRONTEND.md). Nothing one user loaded may be shown to, or refetched for, the next
// person who signs in on the same tab. Every step below stays in the app: a page.goto()
// would reload and hide the bug by creating a fresh QueryClient.

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function navigateInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function signIn(page: Page, fillButton: 'Fill Admin' | 'Fill John') {
  await navigateInApp(page, '/login');
  await page.getByRole('button', { name: fillButton }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function signOut(page: Page) {
  await page.locator('header').first().getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible({ timeout: 15_000 });
}

async function createRun(page: Page, title: string): Promise<string> {
  return page.evaluate(async ({ runTitle, apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/checklists`, {
      body: JSON.stringify({
        title: runTitle,
        sections: [{ id: 'switch-section', title: 'Section', items: [{ id: 'switch-task', title: 'Task' }] }],
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) throw new Error(`Failed to create run: ${response.status}`);
    return ((await response.json()) as { id: string }).id;
  }, { runTitle: title, apiBaseUrl: DEV_API_BASE_URL });
}

async function deleteRuns(page: Page, runIds: string[]) {
  await page.evaluate(async ({ ids, apiBaseUrl }) => {
    await Promise.all(ids.map((id) => fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include', method: 'DELETE' })));
  }, { ids: runIds, apiBaseUrl: DEV_API_BASE_URL });
}

test('a user who signs in after another on the same tab never sees the other user\'s runs', async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now();
  const adminRunTitle = `Admin switch run ${suffix}`;
  const johnRunTitle = `John switch run ${suffix}`;

  // Admin loads My Runs, then signs out without a reload.
  await page.goto('/');
  await signIn(page, 'Fill Admin');
  const adminRunId = await createRun(page, adminRunTitle);
  await navigateInApp(page, '/dashboard/runs');
  await expect(page.getByRole('link', { name: adminRunTitle })).toBeVisible({ timeout: 15_000 });
  await signOut(page);

  // John signs in on the same tab and starts a run from a template, which refreshes run lists.
  await signIn(page, 'Fill John');
  const johnRunIds = [await createRun(page, johnRunTitle)];
  await navigateInApp(page, '/profile/admin/sample-technical-seo-audit-checklist');
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+$/, { timeout: 15_000 });
  johnRunIds.push(decodeURIComponent(new URL(page.url()).pathname.split('/').pop() ?? ''));
  await navigateInApp(page, '/dashboard/runs');
  await expect(page.getByRole('link', { name: johnRunTitle })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: adminRunTitle })).toHaveCount(0);
  await deleteRuns(page, johnRunIds);
  await signOut(page);

  // Admin signs back in: My Runs lists Admin's runs, never John's.
  await signIn(page, 'Fill Admin');
  await navigateInApp(page, '/dashboard/runs');
  await expect(page.getByRole('link', { name: adminRunTitle })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: johnRunTitle })).toHaveCount(0);
  await deleteRuns(page, [adminRunId]);
});
