import { expect, type APIRequestContext, type Page, type Request } from '@playwright/test';

import { API_BASE_URL } from './stack';

/** The API the browser tests run against: the app's own origin, under /api. */
export { API_BASE_URL };

// A page often sends its next request only once an earlier one has answered, so the
// page's requests count as settled once none has started or ended for this long.
const QUIET_MS = 300;

/**
 * Counts the page's requests to the API that are still in flight, from the moment it is
 * called. `settled()` waits until none are left and none has started or ended for a
 * moment, and stops counting.
 *
 * Signing in lands on My Templates, which loads its lists and the Ownership Context at
 * once, so a spec that calls the API right after signing in lets those requests finish first. A spec also
 * waits here when the next step must be the page's only request, such as a save meant to
 * meet an ended session.
 */
export function trackApiRequests(page: Page, apiBaseUrl: string) {
  // The pages share the API's origin, so only requests under its path count.
  const api = new URL(apiBaseUrl);
  const apiPath = `${api.pathname.replace(/\/$/, '')}/`;
  const isApiRequest = (url: URL) => url.origin === api.origin && url.pathname.startsWith(apiPath);
  const inFlight = new Set<Request>();
  let lastChange = Date.now();
  const onRequest = (request: Request) => {
    if (!isApiRequest(new URL(request.url()))) return;
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
 * Use this instead of page.evaluate(fetch): Playwright's request client sends the context's
 * cookies without a CORS preflight, page.route() does not intercept it, and a failed call
 * names the request instead of "TypeError: Failed to fetch". It opens a new connection for
 * every request (request-connections.ts).
 *
 * A test whose subject is a fetch the page itself sends keeps it in page.evaluate and
 * marks it with an `e2e-in-page-fetch:` comment (tests/unit/e2e/e2e-setup-requests.test.ts).
 */
export async function apiRequest<T = unknown>(
  owner: RequestOwner,
  path: string,
  { method = 'GET', body }: ApiInit = {},
): Promise<ApiResult<T>> {
  const response = await owner.request.fetch(`${API_BASE_URL}${path}`, {
    method,
    ...(body === undefined ? {} : { data: body }),
  });
  const text = await response.text();
  return { status: response.status(), ok: response.ok(), body: parseBody(text) as T | null };
}

/** Like apiRequest, but returns the JSON body and throws when the API answers with an error. */
export async function apiJson<T = unknown>(owner: RequestOwner, path: string, init: ApiInit = {}): Promise<T> {
  const { status, ok, body } = await apiRequest<T>(owner, path, init);
  if (!ok) throw new Error(`${init.method ?? 'GET'} ${path} failed: ${status}`);
  return body as T;
}
