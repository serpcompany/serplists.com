import type { Page } from '@playwright/test';

type NextWindow = Window & { next?: { router?: { push: (href: string) => void } } };

/**
 * Opens `path` inside the running app, as an in-app link does: Next.js's router renders it
 * without reloading the document, so in-memory state (React Query's cache, the session)
 * stays. page.goto() would reload and start the app fresh. Next.js exposes its router as
 * window.next.router for debugging; the app itself never uses it.
 *
 * Resolves once the new page is on screen: Next.js fetches it from the server first and
 * changes the address as it shows it. A second navigation sent before that would replace
 * this one, and the page it left would never unmount.
 */
export async function navigateInApp(page: Page, path: string) {
  await page.waitForFunction(() => Boolean((window as NextWindow).next?.router));
  const before = page.url();
  await page.evaluate((to) => (window as NextWindow).next?.router?.push(to), path);
  if (new URL(path, before).href !== before) {
    await page.waitForURL((url) => url.href !== before);
  }
}
