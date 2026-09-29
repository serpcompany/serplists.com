import { errors, expect, type APIRequestContext, type Page, type Request } from '@playwright/test';

/** The API the browser tests run against, resolved as playwright.config.ts resolves it. */
export const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.VITE_API_URL ?? 'http://localhost:8788/api';

// A page often sends its next request only once an earlier one has answered, so the
// page's requests count as settled once none has started or ended for this long.
const QUIET_MS = 300;

/**
 * Counts the page's requests to the API that are still in flight, from the moment it is
 * called. `settled()` waits until none are left and none has started or ended for a
 * moment, and stops counting.
 *
 * Signing in lands on Account Settings, which loads its sections all at once, so a spec
 * that calls the API right after signing in lets those requests finish first. A spec also
 * waits here when the next step must be the page's only request, such as a save meant to
 * meet an ended session.
 */
export function trackApiRequests(page: Page, apiBaseUrl: string) {
  const apiOrigin = new URL(apiBaseUrl).origin;
  const inFlight = new Set<Request>();
  let lastChange = Date.now();
  const onRequest = (request: Request) => {
    if (new URL(request.url()).origin !== apiOrigin) return;
    inFlight.add(request);
    lastChange = Date.now();
  };
  const onDone = (request: Request) => {
    if (inFlight.delete(request)) lastChange = Date.now();
  };
  page.on('request', onRequest);
  page.on('requestfinished', onDone);
  page.on('requestfailed', onDone);

  return {
    async settled() {
      await expect
        .poll(() => ({ inFlight: inFlight.size, quiet: Date.now() - lastChange >= QUIET_MS }), {
          message: 'API requests still in flight',
        })
        .toEqual({ inFlight: 0, quiet: true });
      page.off('request', onRequest);
      page.off('requestfinished', onDone);
      page.off('requestfailed', onDone);
    },
  };
}

/** A page or a browser context: its `request` client sends that context's cookies. */
type RequestOwner = { request: APIRequestContext };

export type ApiResult<T> = { status: number; ok: boolean; body: T | null };

type ApiInit = { method?: string; body?: unknown };

// Wrangler 4.54's dev proxy (ProxyWorker) keeps its connections to the worker open between
// requests, and workerd closes one that has been idle for 5 seconds. A request the proxy
// sends on a connection just as it closes fails without reaching the worker; the proxy
// then answers a non-GET with this 503 (the worker did not restart: it labels every
// failed forward that way) and holds a GET until another request reaches it
// (cloudflare/workers-sdk#14641).
const PROXY_DROPPED_REQUEST = 'Your worker restarted mid-request';
const MAX_ATTEMPTS = 3;
// A GET with no answer for this long is sent again (which also releases the held one).
const HELD_GET_TIMEOUT_MS = 10_000;

function parseBody(text: string): unknown {
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Calls the API as the user signed in to `owner` (a page or a browser context), to set up
 * or clean up a test's data, or to read what the server stored. Returns the status and the
 * JSON body (null when there is none), and does not throw on an error status.
 *
 * Use this instead of page.evaluate(fetch): when the dev proxy drops a page's request (see
 * PROXY_DROPPED_REQUEST), a non-GET fails with "TypeError: Failed to fetch" (the 503 has no
 * CORS headers) and a GET waits for the next request. Playwright's request client sends
 * the context's cookies without a CORS preflight, and page.route() does not intercept it;
 * it opens a new connection for every request (request-connections.ts). A request is sent
 * again only when the proxy dropped it: the proxy's own 503 "worker restarted
 * mid-request", or a GET left unanswered. Every answer from the API itself is returned as
 * it is.
 *
 * A test whose subject is a fetch the page itself sends keeps it in page.evaluate and
 * marks it with an `e2e-in-page-fetch:` comment (tests/unit/e2e/e2e-setup-requests.test.ts).
 */
export async function apiRequest<T = unknown>(
  owner: RequestOwner,
  path: string,
  { method = 'GET', body }: ApiInit = {},
): Promise<ApiResult<T>> {
  const url = `${API_BASE_URL}${path}`;
  const resendsWhenHeld = method === 'GET' || method === 'HEAD';

  for (let attempt = 1; ; attempt += 1) {
    const lastAttempt = attempt === MAX_ATTEMPTS;
    let response;
    try {
      response = await owner.request.fetch(url, {
        method,
        ...(body === undefined ? {} : { data: body }),
        ...(resendsWhenHeld && !lastAttempt ? { timeout: HELD_GET_TIMEOUT_MS } : {}),
      });
    } catch (error) {
      if (resendsWhenHeld && !lastAttempt && error instanceof errors.TimeoutError) continue;
      throw error;
    }
    const text = await response.text();
    if (response.status() === 503 && text.startsWith(PROXY_DROPPED_REQUEST) && !lastAttempt) continue;
    return { status: response.status(), ok: response.ok(), body: parseBody(text) as T | null };
  }
}

/** Like apiRequest, but returns the JSON body and throws when the API answers with an error. */
export async function apiJson<T = unknown>(owner: RequestOwner, path: string, init: ApiInit = {}): Promise<T> {
  const { status, ok, body } = await apiRequest<T>(owner, path, init);
  if (!ok) throw new Error(`${init.method ?? 'GET'} ${path} failed: ${status}`);
  return body as T;
}
