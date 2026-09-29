import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Makes Playwright's request client (page.request, context.request, the `request`
 * fixture, route.fetch) open a new connection for every request instead of reusing idle
 * ones. playwright.config.ts calls it, so it runs in the runner and in every worker.
 *
 * The local API is wrangler's dev server, and workerd closes a keep-alive connection
 * that has been idle for 5 seconds. Playwright's shared HTTP agent keeps idle
 * connections with no time limit of its own, so a request sent about 5 seconds after
 * the previous one can go out on a connection the server is closing, and fails at once
 * with "socket hang up" (ECONNRESET) without reaching the API. On a new connection the
 * server reads the request before any idle timer applies. Playwright has no option for
 * this, so the flag is set on its agent: tests/unit/e2e/request-connections.test.ts
 * fails if an upgrade moves the agent or stops using it.
 */
export function disableRequestKeepAlive() {
  const agent = playwrightHttpAgent();
  agent.keepAlive = false;
}

// Node's http.Agent reads `keepAlive` when a request starts and ends; @types/node omits it.
type KeepAliveAgent = http.Agent & { keepAlive: boolean };

/** The http.Agent that Playwright's request client sends every http:// request through. */
export function playwrightHttpAgent(): KeepAliveAgent {
  const requireFrom = (dir: string) => createRequire(path.join(dir, 'package.json'));
  const packageDir = (require: NodeJS.Require, name: string) =>
    path.dirname(require.resolve(`${name}/package.json`));
  const testDir = packageDir(createRequire(import.meta.url), '@playwright/test');
  const playwrightDir = packageDir(requireFrom(testDir), 'playwright');
  const coreDir = packageDir(requireFrom(playwrightDir), 'playwright-core');
  const agentModule = requireFrom(coreDir)('./lib/server/utils/happyEyeballs.js') as {
    httpHappyEyeballsAgent?: unknown;
  };
  const agent = agentModule.httpHappyEyeballsAgent;
  if (!(agent instanceof http.Agent)) {
    throw new Error(
      "Playwright's HTTP agent is no longer at playwright-core/lib/server/utils/happyEyeballs.js " +
        '(httpHappyEyeballsAgent). Find where its request client gets its agent and update ' +
        'tests/e2e/support/request-connections.ts.',
    );
  }
  return agent as KeepAliveAgent;
}
