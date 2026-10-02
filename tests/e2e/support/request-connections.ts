import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

export function disableRequestKeepAlive() {
  const agent = playwrightHttpAgent();
  agent.keepAlive = false;
}

type KeepAliveAgent = http.Agent & { keepAlive: boolean };

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
