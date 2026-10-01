import { expect, test, type Page } from '@playwright/test';

import { APP_URL } from './support/stack';

const pagesOrigin = new URL(APP_URL).origin;

type ViolationWindow = Window & { __cspViolations?: string[] };

async function stubTheYouTubePlayer(page: Page) {
  await page.route('https://www.youtube.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Stub player</title><body>stub player</body>',
    }),
  );
}

test('bundled public template frames its YouTube video without a CSP violation', async ({
  page,
}) => {
  await stubTheYouTubePlayer(page);
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

  await page.goto(`${pagesOrigin}/profile/serp/full-website-launch-qa-checklist/`);
  await expect(page.getByText('Review launch walkthrough video', { exact: true })).toBeVisible();

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
