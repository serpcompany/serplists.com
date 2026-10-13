import { afterEach, describe, expect, it, vi } from 'vitest';
import { FRESH_ROUTER_IMPORT_TIMEOUT_MS, freshApiWorker, silenceRequestLog } from '../../../support/apiRouter';
import { apiEnv, TEST_AUTH_SECRET } from '../../../support/apiEnv';
import type { Env } from '@functions/api/types';

const RUN_KEY_ROUTES = [
  ['POST', 'mcp'],
  ['GET', 'agent-keys'],
  ['POST', 'agent-keys'],
  ['DELETE', 'agent-keys/key-1'],
] as const;

const REMOTE_HOST = 'https://staging.serplists.com';
const LOCAL_HOST = 'http://localhost';

async function aRouterWithRunKeyHandlersThatAnswer() {
  const handleAgentKeys = vi.fn(() => Response.json([]));
  const handleAgentMcp = vi.fn(() => Response.json({ jsonrpc: '2.0', id: 1, result: {} }));
  vi.doMock('../../../../functions/api/handlers/agent-keys', () => ({ handleAgentKeys }));
  vi.doMock('../../../../functions/api/handlers/agentMcp', () => ({ handleAgentMcp }));
  const apiWorker = await freshApiWorker();
  const statusesOn = async (host: string, vars: Partial<Env>) => {
    const statuses: number[] = [];
    for (const [method, path] of RUN_KEY_ROUTES) {
      const response = await apiWorker.fetch(new Request(`${host}/api/${path}`, { method }), apiEnv({ BETTER_AUTH_SECRET: TEST_AUTH_SECRET, ...vars }));
      statuses.push(response.status);
    }
    return statuses;
  };
  return { statusesOn, handlerCalls: () => handleAgentKeys.mock.calls.length + handleAgentMcp.mock.calls.length };
}

describe('Run Key routes where Run Keys are off', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  afterEach(() => {
    vi.doUnmock('../../../../functions/api/handlers/agent-keys');
    vi.doUnmock('../../../../functions/api/handlers/agentMcp');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('answer 404 on the MCP endpoint and the Agent Access API without running their handlers, which answer once Run Keys are on', async () => {
    silenceRequestLog();
    const router = await aRouterWithRunKeyHandlersThatAnswer();
    const everyRoute = (status: number) => RUN_KEY_ROUTES.map(() => status);

    expect(await router.statusesOn(REMOTE_HOST, {})).toEqual(everyRoute(404));
    expect(await router.statusesOn(LOCAL_HOST, { PERSONAL_RUN_MCP_ENABLED: 'false' })).toEqual(everyRoute(404));
    expect(router.handlerCalls()).toBe(0);

    expect(await router.statusesOn(REMOTE_HOST, { PERSONAL_RUN_MCP_ENABLED: 'true' })).toEqual(everyRoute(200));
    expect(router.handlerCalls()).toBe(RUN_KEY_ROUTES.length);
  });
});
