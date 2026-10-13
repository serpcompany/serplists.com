import { expect, test, type Page, type Request } from '@playwright/test';

import { clientErrorReportSchema } from '../../src/lib/schemas/clientErrorReport';
import { TAG_HOSTS } from './support/analytics';

const SITE_BUNDLE_FRAME = /^at (?:.+ \()?\/_next\/static\/[^\s()]+:\d+:\d+\)?$/m;

const isErrorReport = (request: Request) => new URL(request.url()).pathname === '/api/client-errors';

async function recordTagRequests(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.route(
    (url) => TAG_HOSTS.test(url.hostname),
    async (route) => {
      const request = route.request();
      requests.push(`${request.url()} ${request.postData() ?? ''}`);
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    },
  );
  return requests;
}

async function waitUntilTagManagerCouldHaveLoaded(page: Page) {
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle');
}

const SENSITIVE_PAGES = [
  { path: '/share/e2e-analytics-share-token/', secret: 'e2e-analytics-share-token' },
  { path: '/team-invites/e2e-analytics-invite-token/', secret: 'e2e-analytics-invite-token' },
  { path: '/reset-password/?token=E2E_RESET_SENTINEL', secret: 'E2E_RESET_SENTINEL' },
  {
    path: '/login/?verify_email=1&email=analytics-e2e%40example.com',
    secret: 'analytics-e2e',
  },
  {
    path: '/login/?verified=1&next=%2Fteam-invites%2Fe2e-analytics-next-token',
    secret: 'e2e-analytics-next-token',
  },
];

const pathWithoutSecretValues = (path: string): string => {
  const queryStart = path.indexOf('?');
  if (queryStart === -1) return path;
  const pathname = path.slice(0, queryStart);
  const keys = [...new URLSearchParams(path.slice(queryStart + 1)).keys()];
  return keys.length > 0 ? `${pathname}?${keys.join('&')}` : pathname;
};

test.describe('analytics privacy', () => {
  for (const { path, secret } of SENSITIVE_PAGES) {
    test(`does not load Google Tag Manager on ${pathWithoutSecretValues(path)}`, async ({ page }) => {
      const requests = await recordTagRequests(page);

      await page.goto(path);
      await waitUntilTagManagerCouldHaveLoaded(page);

      expect(requests).toEqual([]);
      expect(requests.join('\n')).not.toContain(secret);
    });
  }

  test('removes the reset token from the address bar and keeps the form usable', async ({ page }) => {
    await page.goto('/reset-password/?token=E2E_RESET_SENTINEL');

    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
    await expect(page).not.toHaveURL(/token=/);
    await expect(page).toHaveURL(/\/reset-password\/$/);
  });

  test('moves an email address in an old login link out of the URL, with its one-shot notice parameter', async ({ page }) => {
    await page.goto('/login/?verify_email=1&email=analytics-e2e%40example.com');

    await expect(page.getByLabel('Email')).toHaveValue('analytics-e2e@example.com');
    await expect(page).not.toHaveURL(/email=analytics/);
    await expect(page).toHaveURL(/\/login\/$/);
  });

  test('still loads the container on public pages', async ({ page }) => {
    const requests = await recordTagRequests(page);

    await page.goto('/');
    await waitUntilTagManagerCouldHaveLoaded(page);

    await expect.poll(() => requests.some((entry) => entry.includes('gtm.js?id=GTM-PZZFQBGG'))).toBe(true);
  });
});

test.describe('error reports', () => {
  test("reports a site script's error once, by frames, never its message", async ({ page }) => {
    await recordTagRequests(page);
    const reports: Request[] = [];
    page.on('request', (request) => {
      if (isErrorReport(request)) reports.push(request);
    });
    await page.goto('/templates/');
    await page.waitForFunction(() => Object.hasOwn(window.history, 'pushState'));
    const reported = page.waitForResponse((response) => isErrorReport(response.request()));

    const uncaught = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          window.addEventListener('error', (event) => resolve(event.message), { once: true });
          setTimeout(() => window.history.pushState({ notCloneable: () => undefined }, ''));
        }),
    );

    const response = await reported;
    const body = response.request().postData() ?? '';
    const report = clientErrorReportSchema.strict().parse(JSON.parse(body));
    expect(response.status()).toBe(204);
    expect(reports).toHaveLength(1);
    expect(report).toMatchObject({ kind: 'error', name: 'DataCloneError', path: '/templates/' });
    expect(report.stack).toMatch(SITE_BUNDLE_FRAME);
    expect(uncaught).toContain('pushState');
    expect(body).not.toContain(uncaught.slice(uncaught.indexOf(': ') + 2));
  });
});
