import { errors, expect, type APIRequestContext, type Page, type Request } from '@playwright/test';

/** The API the browser tests run against, resolved as playwright.config.ts resolves it. */
export const API_BASE_URL =
  process.env.PLAYWRIGHT_API_URL ?? process.env.VITE_API_URL ?? 'http://localhost:8788/api';

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

/** A page or a browser context: its `request` client sends that context's cookies. */
type RequestOwner = { request: APIRequestContext };

export type ApiResult<T> = { status: number; ok: boolean; body: T | null };

type ApiInit = { method?: string; body?: unknown };

// The dev proxy's own answer to a non-GET request it dropped (wrangler's ProxyWorker).
const PROXY_DROPPED_REQUEST = 'Your worker restarted mid-request';
const MAX_ATTEMPTS = 3;
// The proxy holds a GET it dropped until another request reaches it, so a GET with no
// answer for this long is sent again (which also releases the held one).
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
 * Use this instead of page.evaluate(fetch), which the local dev proxy can drop (see
 * trackApiRequests). Playwright's request client sends the context's cookies without a
 * CORS preflight, and page.route() does not intercept it. A request is sent again only
 * when the proxy dropped it: the proxy's own 503 "worker restarted mid-request", or a GET
 * left unanswered. Every answer from the API itself is returned as it is.
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
