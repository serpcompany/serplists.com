import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { z } from 'zod';

export function disableRequestKeepAlive() {
  const agent = playwrightHttpAgent();
  agent.keepAlive = false;
}

type KeepAliveAgent = http.Agent & { keepAlive: boolean };

const isKeepAliveAgent = (agent: unknown): agent is KeepAliveAgent =>
  agent instanceof http.Agent && 'keepAlive' in agent && typeof agent.keepAlive === 'boolean';

const happyEyeballsModule = z.object({ httpHappyEyeballsAgent: z.unknown() }).passthrough();

export function playwrightHttpAgent(): KeepAliveAgent {
  const requireFrom = (dir: string) => createRequire(path.join(dir, 'package.json'));
  const packageDir = (require: NodeJS.Require, name: string) =>
    path.dirname(require.resolve(`${name}/package.json`));
  const testDir = packageDir(createRequire(import.meta.url), '@playwright/test');
  const playwrightDir = packageDir(requireFrom(testDir), 'playwright');
  const coreDir = packageDir(requireFrom(playwrightDir), 'playwright-core');
  const agentModule = happyEyeballsModule.safeParse(requireFrom(coreDir)('./lib/server/utils/happyEyeballs.js'));
  const agent = agentModule.data?.httpHappyEyeballsAgent;
  if (!isKeepAliveAgent(agent)) {
    throw new Error(
      "Playwright's HTTP agent, with its keepAlive setting, is no longer at playwright-core/lib/server/utils/happyEyeballs.js " +
        '(httpHappyEyeballsAgent). Find where its request client gets its agent and update ' +
        'tests/e2e/support/request-connections.ts.',
    );
  }
  return agent;
}
