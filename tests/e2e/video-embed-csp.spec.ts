import { expect, test } from '@playwright/test';

// The Vite dev server never applies public/_headers, where the
// Content-Security-Policy lives, so load the page from the wrangler Pages origin.
const pagesOrigin = new URL(
  process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api',
).origin;

type ViolationWindow = Window & { __cspViolations?: string[] };

test('bundled public template frames its YouTube video without a CSP violation', async ({
  page,
}) => {
  // Stub the player so the test does not depend on YouTube being reachable.
  await page.route('https://www.youtube.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Stub player</title><body>stub player</body>',
    }),
  );
  await page.addInitScript(() => {
    const target = window as ViolationWindow;
    target.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      target.__cspViolations?.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
  const refusedFrames: string[] = [];
  page.on('console', (message) => {
    if (/Refused to frame/i.test(message.text())) refusedFrames.push(message.text());
  });

  await page.goto(`${pagesOrigin}/profile/serp/full-website-launch-qa-checklist`);
  await page.getByRole('button', { name: 'Review launch walkthrough video' }).first().click();

  const player = page.locator('iframe[src^="https://www.youtube.com/embed/aqz-KE-bpKQ"]');
  await expect(player).toBeAttached();
  await expect(
    page.frameLocator('iframe[src^="https://www.youtube.com/embed/"]').locator('body'),
  ).toHaveText('stub player');

  const violations = await page.evaluate(
    () => (window as ViolationWindow).__cspViolations ?? [],
  );
  expect(violations.filter((entry) => entry.startsWith('frame-src'))).toEqual([]);
  expect(refusedFrames).toEqual([]);
});
