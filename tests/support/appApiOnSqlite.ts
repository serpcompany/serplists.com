import { vi } from 'vitest';

import { sessionMocks } from './mockedSession';
import { apiEnv, TEST_AUTH_SECRET } from './apiEnv';
import { freshApiWorker, silenceLogs } from './apiRouter';
import { InMemoryR2Bucket } from './r2Bucket';
import { SqliteD1 } from './sqlite-d1';

const APP_ORIGIN = 'http://localhost';

async function asTheBrowserSendsIt(request: Request): Promise<Request> {
  if (!request.body) return request;
  const body = await request.arrayBuffer();
  const headers = new Headers(request.headers);
  headers.set('Content-Length', String(body.byteLength));
  return new Request(request.url, { method: request.method, headers, body });
}

const PEOPLE_JOINED_AT = '2026-03-01T00:00:00.000Z';

let d1: SqliteD1;
export let uploads: InMemoryR2Bucket;

export async function answerTheAppFromTheApiOnSqlite(people: readonly string[]): Promise<void> {
  d1 = new SqliteD1();
  uploads = new InMemoryR2Bucket();
  for (const id of people) {
    d1.run(
      'INSERT INTO users (id, email, name, username, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      id, `${id}@example.test`, id, id, PEOPLE_JOINED_AT,
    );
  }
  const worker = await freshApiWorker();
  silenceLogs();
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), APP_ORIGIN);
    if (url.origin !== APP_ORIGIN) return new Response('Not found', { status: 404 });
    return worker.fetch(await asTheBrowserSendsIt(new Request(url, init)), apiEnv({
      DB: d1.binding,
      R2_UPLOADS: uploads,
      BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
    }));
  });
}

export function signedInAs(userId: string | null): void {
  sessionMocks.getSessionUserId.mockResolvedValue(userId);
}

export function closeTheApiDatabase(): void {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  d1.sqlite.close();
}

export function onTheProPlan(userId: string): void {
  d1.run("INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES (?, 'pro', ?)", userId, PEOPLE_JOINED_AT);
}
