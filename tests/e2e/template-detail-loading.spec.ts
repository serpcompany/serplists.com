import { expect, test, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';
import { PAST_THE_TEAMS_LIST_STALE_TIME, returnToTabAfter } from './support/navigation';
import { loginAs } from './support/sign-in';

const PUBLIC_TEMPLATE_PATH = '/profile/admin/sample-technical-seo-audit-checklist';
const PUBLIC_TEMPLATE_SLUG = 'sample-technical-seo-audit-checklist';

function countRequests(page: Page, matches: (url: URL) => boolean) {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && matches(new URL(request.url()))) seen.push(request.url());
  });
  return seen;
}

for (const signedIn of [false, true]) {
  test(`a public template page fetches its template once on a direct visit (${signedIn ? 'signed in' : 'signed out'})`, async ({ page }) => {
    if (signedIn) await loginAs(page, 'admin');
    const requests = countRequests(page, (url) => url.pathname.endsWith(`/api/templates/slug/${PUBLIC_TEMPLATE_SLUG}`));

    await page.goto(PUBLIC_TEMPLATE_PATH);
    await expect(page.getByRole('button', { name: 'Start Run' }).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    expect(requests).toHaveLength(1);
  });
}

test('the Start a Run dialog keeps its typed name when the app refreshes data in the background', async ({ page }) => {
  await loginAs(page, 'john');
  const { id: templateId } = await apiJson<{ id: string }>(page, `/templates/slug/${PUBLIC_TEMPLATE_SLUG}`);

  const readsById = countRequests(page, (url) => url.pathname.endsWith(`/api/templates/${templateId}`));
  await page.clock.install();
  await page.goto(`/dashboard/templates/${templateId}/`);
  await page.getByRole('button', { name: 'Start Run' }).click();
  await page.getByLabel('Run name', { exact: true }).fill('Kept run name');

  const teamsRefetched = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/api/teams'));
  await returnToTabAfter(page, PAST_THE_TEAMS_LIST_STALE_TIME);
  await teamsRefetched;

  await expect(page.getByLabel('Run name', { exact: true })).toHaveValue('Kept run name');
  await expect(page.getByText('Loading template...')).toHaveCount(0);
  expect(readsById).toHaveLength(1);
});
