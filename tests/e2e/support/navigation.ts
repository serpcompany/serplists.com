import type { Page } from '@playwright/test';

type NextWindow = Window & { next?: { router?: { push: (href: string) => void } } };

async function waitForNextRouter(page: Page) {
  await page.waitForFunction(() => Boolean((window as NextWindow).next?.router));
}

async function waitUntilTheNewPageShows(page: Page, previousUrl: string) {
  await page.waitForURL((url) => url.href !== previousUrl);
}

export async function navigateInApp(page: Page, path: string) {
  await waitForNextRouter(page);
  const before = page.url();
  await page.evaluate((to) => (window as NextWindow).next?.router?.push(to), path);
  const leavesThePage = new URL(path, before).href !== before;
  if (leavesThePage) await waitUntilTheNewPageShows(page, before);
}

export async function openRunFromRunsList(page: Page, title: string) {
  await page.goto('/dashboard/runs/');
  await page.getByRole('link', { name: title }).click();
}

export async function returnToTabAfter(page: Page, timeAway: string) {
  await page.clock.fastForward(timeAway);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));
}
