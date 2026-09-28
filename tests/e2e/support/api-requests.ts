import { expect, type Page, type Request } from '@playwright/test';

/**
 * Counts the page's requests to the API that are still in flight, from the moment it is
 * called. `settled()` waits until none are left and stops counting.
 *
 * The local API runs behind wrangler's dev proxy, which now and then drops a request that
 * arrives while the page has several of its own in flight. It answers 503 "Your worker
 * restarted mid-request" without CORS headers (a GET is held instead and never answered),
 * so a test's page.evaluate(fetch) fails with "TypeError: Failed to fetch". Signing in
 * lands on Account Settings, which loads its sections all at once, so a spec that calls
 * the API from the page right after signing in waits for those requests first.
 */
export function trackApiRequests(page: Page, apiBaseUrl: string) {
  const apiOrigin = new URL(apiBaseUrl).origin;
  const inFlight = new Set<Request>();
  const onRequest = (request: Request) => {
    if (new URL(request.url()).origin === apiOrigin) inFlight.add(request);
  };
  const onDone = (request: Request) => {
    inFlight.delete(request);
  };
  page.on('request', onRequest);
  page.on('requestfinished', onDone);
  page.on('requestfailed', onDone);

  return {
    async settled() {
      await expect.poll(() => inFlight.size, { message: 'API requests still in flight' }).toBe(0);
      page.off('request', onRequest);
      page.off('requestfinished', onDone);
      page.off('requestfailed', onDone);
    },
  };
}
