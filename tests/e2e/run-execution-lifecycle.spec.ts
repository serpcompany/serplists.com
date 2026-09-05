import { expect, test } from '@playwright/test';

test('shared run loading stays bounded across renders and token changes', async ({ page }, testInfo) => {
  const reads: Record<string, number> = {};
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const token = path.match(/^\/api\/checklists\/shared\/([^/]+)$/)?.[1];
    if (token) {
      reads[token] = (reads[token] ?? 0) + 1;
      // Fail boundedly even on the original resource-exhausting request loop.
      if (reads[token] > 10) return route.abort();
      return route.fulfill({ json: {
        id: `run-${token}`, title: `Shared ${token}`, status: 'in_progress',
        items: [{ id: `item-${token}`, title: `Task ${token}`, completed: false }],
        started_at: '2026-09-01T00:00:00.000Z', revision: 1,
      } });
    }
    return route.fulfill({ json: path.includes('/auth/') ? null : [] });
  });

  try {
    await page.goto('/share/first');
    await expect(page.getByText('Task first', { exact: true }).first()).toBeVisible();
    await page.evaluate(() => {
      history.pushState({}, '', '/share/second');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByText('Task second', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Task first', { exact: true })).toHaveCount(0);
    // Allow queued render/effect work to expose a restarting load effect.
    await page.waitForTimeout(300);
    expect(reads.first).toBeLessThanOrEqual(2);
    expect(reads.second).toBeLessThanOrEqual(2);
  } finally {
    await testInfo.attach('shared-request-counts', {
      body: JSON.stringify(reads), contentType: 'application/json',
    });
    console.log('shared request counts:', JSON.stringify(reads));
  }
});

test('@real-d1 shared and authenticated run loading stay bounded', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_USE_DEV_VARS !== '0');
  const reads: Record<string, number> = {};
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.includes('/checklists/')) reads[path] = (reads[path] ?? 0) + 1;
  });
  await page.goto('/share/coverage-share');
  await expect(page.getByText('Coverage Run', { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(300);
  expect(reads['/api/checklists/shared/coverage-share']).toBeGreaterThan(0);
  expect(reads['/api/checklists/shared/coverage-share']).toBeLessThanOrEqual(2);
  await page.goto('/login');
  await page.locator('#email').fill('coverage-owner@e2e.local');
  await page.locator('#password').fill('password123');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page.getByRole('button', { name: 'Switch workspace' })).toBeVisible();
  await page.goto('/dashboard/runs/coverage-run');
  await expect(page.getByText('Coverage Run', { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(300);
  expect(reads['/api/checklists/coverage-run'] ?? 0).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
  console.log('real local D1 run request counts:', JSON.stringify(reads));
});
