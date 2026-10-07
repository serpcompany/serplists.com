import { expect, type APIRequestContext, type Page, type Request } from '@playwright/test';
import { z } from 'zod';

import { API_BASE_URL } from './stack';

export { API_BASE_URL };

const QUIET_MS_BEFORE_SETTLED = 300;

export function trackApiRequests(page: Page, apiBaseUrl: string) {
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
        .poll(() => ({ inFlight: inFlight.size, quiet: Date.now() - lastChange >= QUIET_MS_BEFORE_SETTLED }), {
          message: 'API requests still in flight',
        })
        .toEqual({ inFlight: 0, quiet: true });
      page.off('request', onRequest);
      page.off('requestfinished', onDone);
      page.off('requestfailed', onDone);
    },
  };
}

type PageOrBrowserContext = { request: APIRequestContext };

export type ApiResult<T> = { status: number; ok: boolean; body: T | null };

export type BodySchema<Output> = z.ZodType<Output, z.ZodTypeDef, unknown>;

export const bodyNotRead = z.unknown();

const jsonRecord = z.record(z.unknown());

type ApiInit = { method?: string; body?: unknown };

type PageFetchInit = { method?: string; headers?: Record<string, string>; body?: string; credentials?: RequestCredentials };

function parseBody(text: string): unknown {
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function apiRequest<Output>(
  owner: PageOrBrowserContext,
  path: string,
  schema: BodySchema<Output>,
  { method = 'GET', body }: ApiInit = {},
): Promise<ApiResult<Output>> {
  const response = await owner.request.fetch(`${API_BASE_URL}${path}`, {
    method,
    ...(body === undefined ? {} : { data: body }),
  });
  const parsed = parseBody(await response.text());
  return { status: response.status(), ok: response.ok(), body: parsed === null ? null : schema.parse(parsed) };
}

export async function apiJson<Output>(
  owner: PageOrBrowserContext,
  path: string,
  schema: BodySchema<Output>,
  init: ApiInit = {},
): Promise<Output> {
  const response = await owner.request.fetch(`${API_BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    ...(init.body === undefined ? {} : { data: init.body }),
  });
  if (!response.ok()) throw new Error(`${init.method ?? 'GET'} ${path} failed: ${response.status()}`);
  return schema.parse(parseBody(await response.text()));
}

export async function fetchFromThePageUnderTest(page: Page, url: string, init: PageFetchInit = {}): Promise<ApiResult<unknown>> {
  const { status, ok, text } = await page.evaluate(
    async ({ to, requestInit }) => {
      const response = await fetch(to, requestInit);
      return { status: response.status, ok: response.ok, text: await response.text() };
    },
    { to: url, requestInit: init },
  );
  return { status, ok, body: parseBody(text) };
}

export async function apiJsonAt<Output>(
  owner: PageOrBrowserContext,
  path: string,
  method: string,
  schema: BodySchema<Output>,
  body?: unknown,
): Promise<Output> {
  return apiJson(owner, path, schema, { method, body });
}

export async function apiRecord(owner: PageOrBrowserContext, method: string, path: string, body?: unknown) {
  return apiJson(owner, path, jsonRecord, { method, body });
}
