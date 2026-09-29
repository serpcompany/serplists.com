import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { request } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { disableRequestKeepAlive, playwrightHttpAgent } from '../../e2e/support/request-connections';

// The browser-test API (workerd, behind wrangler's dev proxy) closes a connection that has
// been idle for 5 seconds. A Playwright request sent on a pooled connection at that moment
// fails with "socket hang up" before it reaches the API, so playwright.config.ts makes
// Playwright's request client open a new connection for every request.

let server: http.Server;
let baseUrl: string;
let connections: number;
let keepAliveBefore: boolean;

beforeEach(async () => {
  keepAliveBefore = playwrightHttpAgent().keepAlive;
  connections = 0;
  server = http.createServer((_req, res) => res.end('ok'));
  server.on('connection', () => {
    connections += 1;
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  playwrightHttpAgent().keepAlive = keepAliveBefore;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function connectionsForTwoRequests() {
  const context = await request.newContext();
  try {
    expect((await context.get(`${baseUrl}/one`)).ok()).toBe(true);
    expect((await context.get(`${baseUrl}/two`)).ok()).toBe(true);
  } finally {
    await context.dispose();
  }
  return connections;
}

describe("Playwright's request client connections", () => {
  it('reuses an idle connection unless told not to (why the setting exists)', async () => {
    playwrightHttpAgent().keepAlive = true;
    expect(await connectionsForTwoRequests()).toBe(1);
  });

  it('opens a new connection for every request once disableRequestKeepAlive() ran', async () => {
    disableRequestKeepAlive();
    expect(await connectionsForTwoRequests()).toBe(2);
  });

  it('is turned off by playwright.config.ts before any test runs', () => {
    const config = readFileSync('playwright.config.ts', 'utf8');
    expect(config).toMatch(/^import \{ disableRequestKeepAlive \} from "\.\/tests\/e2e\/support\/request-connections";$/m);
    expect(config).toMatch(/^disableRequestKeepAlive\(\);$/m);
  });
});
