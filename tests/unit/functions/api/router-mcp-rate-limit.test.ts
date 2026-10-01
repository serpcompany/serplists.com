import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRESH_ROUTER_IMPORT_TIMEOUT_MS, requestFromIp, silenceRequestLog } from '../../../support/apiRouter';

const WRITE_LIMIT_PER_MINUTE = 120;
const MCP_RUN_KEY_LIMIT_PER_MINUTE = 120;
const MCP_IP_LIMIT_PER_MINUTE = 240;
let ipCounter = 0;

function buildEnv() {
  return {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    PERSONAL_RUN_MCP_ENABLED: 'true',
  } as any;
}

async function loadRouter() {
  const handleAgentMcp = vi.fn(async () => Response.json({ jsonrpc: '2.0', id: 1, result: {} }));
  const handleChecklists = vi.fn(async () => Response.json({ ok: true }));
  vi.doMock('../../../../functions/api/handlers/agentMcp', () => ({ handleAgentMcp }));
  vi.doMock('../../../../functions/api/handlers/checklists', () => ({ handleChecklists }));
  const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');
  const send = (ip: string, method: string, path: string) => apiWorker.fetch(requestFromIp(ip, method, path), buildEnv());
  return { send, handleAgentMcp, handleChecklists };
}

describe('API router MCP rate limit on a deployed host', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  let ip: string;

  beforeEach(() => {
    ipCounter += 1;
    ip = `203.0.113.${ipCounter}`;
    silenceRequestLog();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('../../../../functions/api/handlers/agentMcp');
    vi.doUnmock('../../../../functions/api/handlers/checklists');
    vi.resetModules();
  });

  it("keeps a local agent's MCP calls from blocking the owner's run saves on the same IP", async () => {
    const { send, handleChecklists } = await loadRouter();

    for (let index = 0; index < MCP_RUN_KEY_LIMIT_PER_MINUTE; index += 1) {
      expect((await send(ip, 'POST', 'mcp')).status).toBe(200);
    }

    const save = await send(ip, 'PUT', 'checklists/run-1');
    expect(save.status).toBe(200);
    expect(handleChecklists).toHaveBeenCalledTimes(1);
  });

  it('keeps web saves from using up the MCP budget', async () => {
    const { send, handleAgentMcp } = await loadRouter();

    for (let index = 0; index < WRITE_LIMIT_PER_MINUTE; index += 1) {
      expect((await send(ip, 'PUT', 'checklists/run-1')).status).toBe(200);
    }
    expect((await send(ip, 'PUT', 'checklists/run-1')).status).toBe(429);

    expect((await send(ip, 'POST', 'mcp')).status).toBe(200);
    expect(handleAgentMcp).toHaveBeenCalledTimes(1);
  });

  it('still caps MCP per IP, above one Run Key budget, with a JSON-RPC 429 that never spills over into web saves', async () => {
    const { send, handleAgentMcp } = await loadRouter();

    for (let index = 0; index < MCP_IP_LIMIT_PER_MINUTE; index += 1) {
      expect((await send(ip, 'POST', 'mcp')).status).toBe(200);
    }

    const blocked = await send(ip, 'POST', 'mcp');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(blocked.headers.get('Content-Type')).toContain('application/json');
    expect(await blocked.json()).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Rate limit exceeded' },
    });
    expect(handleAgentMcp).toHaveBeenCalledTimes(MCP_IP_LIMIT_PER_MINUTE);

    const webSaveOnceMcpIsCapped = await send(ip, 'PUT', 'checklists/run-1');
    expect(webSaveOnceMcpIsCapped.status).toBe(200);
  });
});
