import { vi } from 'vitest';

import type { SqliteD1 } from './sqlite-d1';
import { SECRET_THE_API_ROUTER_VALIDATES, serverContext } from './nextServerContext';

vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', async () => (await import('./nextServerContext')).cloudflareMock);
vi.mock('next/headers', async () => (await import('./nextServerContext')).headersMock);

export { createEdgeCache, SECRET_THE_API_ROUTER_VALIDATES, serverContext, unreachableD1 } from './nextServerContext';

export function serveTheSiteFrom(d1: SqliteD1) {
  serverContext.env = { DB: d1.binding, BETTER_AUTH_SECRET: SECRET_THE_API_ROUTER_VALIDATES };
  serverContext.host = 'serplists.com';
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
}
