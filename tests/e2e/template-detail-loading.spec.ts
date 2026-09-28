import { expect, test, type Page } from '@playwright/test';

// Template detail pages load their template once. Re-renders from auth, context, list, or
// mutation state must not refetch it or swap the page for its loading spinner, which would
// unmount open dialogs (see src/features/template-detail/useTemplateDetailRecord.ts).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';
const PUBLIC_TEMPLATE_PATH = '/profile/admin/sample-technical-seo-audit-checklist';
const PUBLIC_TEMPLATE_SLUG = 'sample-technical-seo-audit-checklist';

async function login(page: Page, fillButton: 'Fill Admin' | 'Fill John') {
  await page.goto('/login');
  await page.getByRole('button', { name: fillButton }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

function countRequests(page: Page, matches: (url: URL) => boolean) {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && matches(new URL(request.url()))) seen.push(request.url());
  });
  return seen;
}

for (const signedIn of [false, true]) {
  test(`a public template page fetches its template once on a direct visit (${signedIn ? 'signed in' : 'signed out'})`, async ({ page }) => {
    if (signedIn) await login(page, 'Fill Admin');
    const requests = countRequests(page, (url) => url.pathname.endsWith(`/api/templates/slug/${PUBLIC_TEMPLATE_SLUG}`));

    await page.goto(PUBLIC_TEMPLATE_PATH);
    await expect(page.getByRole('button', { name: 'Start Run' }).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    expect(requests).toHaveLength(1);
  });
}

test('the Start Run dialog keeps its typed name when the app refreshes data in the background', async ({ page }) => {
  await login(page, 'Fill John');
  const templateId = await page.evaluate(async ({ apiBaseUrl, slug }) => {
    const response = await fetch(`${apiBaseUrl}/templates/slug/${slug}`, { credentials: 'include' });
    if (!response.ok) throw new Error(`Failed to load template: ${response.status}`);
    return ((await response.json()) as { id: string }).id;
  }, { apiBaseUrl: DEV_API_BASE_URL, slug: PUBLIC_TEMPLATE_SLUG });

  // Another owner's template is not in John's lists, so the page fetches it by id.
  const requests = countRequests(page, (url) => url.pathname.endsWith(`/api/templates/${templateId}`));
  await page.clock.install();
  await page.goto(`/dashboard/templates/${templateId}`);
  await page.getByRole('button', { name: 'Start Run' }).click();
  await page.getByLabel('Run Name').fill('Kept run name');

  // Returning to the tab after a minute refetches the Organization list (60s staleTime).
  const teamsRefetched = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/api/teams'));
  await page.clock.fastForward('02:00');
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await teamsRefetched;

  await expect(page.getByLabel('Run Name')).toHaveValue('Kept run name');
  await expect(page.getByText('Loading template...')).toHaveCount(0);
  expect(requests).toHaveLength(1);
});
