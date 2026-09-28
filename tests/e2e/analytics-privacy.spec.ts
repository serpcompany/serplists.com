import { expect, test, type Page } from '@playwright/test';

// Tags in the Google Tag Manager container read location.href, so pages whose URL carries
// a share or invite token, a reset token or an email address must not load it at all.

const TAG_HOSTS = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)$/;

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

async function waitForApp(page: Page) {
  await expect(page.locator('#boot-splash')).toHaveCount(0);
}

const SENSITIVE_PAGES = [
  { path: '/share/e2e-analytics-share-token', secret: 'e2e-analytics-share-token' },
  { path: '/team-invites/e2e-analytics-invite-token', secret: 'e2e-analytics-invite-token' },
  { path: '/reset-password?token=E2E_RESET_SENTINEL', secret: 'E2E_RESET_SENTINEL' },
  {
    path: '/login?verify_email=1&email=analytics-e2e%40example.com',
    secret: 'analytics-e2e',
  },
];

test.describe('analytics privacy', () => {
  for (const { path, secret } of SENSITIVE_PAGES) {
    test(`does not load Google Tag Manager on ${path.split('?')[0]}`, async ({ page }) => {
      const requests = await recordTagRequests(page);

      await page.goto(path);
      await waitForApp(page);

      expect(requests).toEqual([]);
      expect(requests.join('\n')).not.toContain(secret);
    });
  }

  test('removes the reset token from the address bar and keeps the form usable', async ({ page }) => {
    await page.goto('/reset-password?token=E2E_RESET_SENTINEL');

    await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
    await expect(page).not.toHaveURL(/token=/);
    await expect(page).toHaveURL(/\/reset-password$/);
  });

  test('moves an email address in an old login link out of the URL', async ({ page }) => {
    await page.goto('/login?verify_email=1&email=analytics-e2e%40example.com');

    await expect(page.getByLabel('Email')).toHaveValue('analytics-e2e@example.com');
    await expect(page).not.toHaveURL(/email=analytics/);
    await expect(page).toHaveURL(/\/login\?verify_email=1$/);
  });

  test('still loads the container on public pages', async ({ page }) => {
    const requests = await recordTagRequests(page);

    await page.goto('/');
    await waitForApp(page);

    await expect.poll(() => requests.some((entry) => entry.includes('gtm.js?id=GTM-PZZFQBGG'))).toBe(true);
  });
});
