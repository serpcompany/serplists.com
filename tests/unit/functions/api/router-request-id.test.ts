import { afterEach, describe, expect, it, vi } from 'vitest';
import { FRESH_ROUTER_IMPORT_TIMEOUT_MS } from '../../../support/apiRouter';

function buildEnv(overrides?: Record<string, unknown>) {
  return {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    ...overrides,
  } as any;
}

describe('API router request id propagation', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  afterEach(() => {
    vi.doUnmock('../../../../functions/api/handlers/templates');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("tags what a handler logs with the request's id, the one the response carries", async () => {
    vi.doMock('../../../../functions/api/handlers/templates', async () => {
      const { log } = await import('../../../../functions/api/utils/logger');
      return {
        handleTemplates: vi.fn(async () => {
          await Promise.resolve();
          log('info', 'handler_line');
          return Response.json({});
        }),
      };
    });
    const lines: string[] = [];
    vi.spyOn(console, 'info').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');

    const response = await apiWorker.fetch(new Request('http://localhost/api/templates'), buildEnv());

    const logged = lines.map((line) => JSON.parse(line) as { message: string; requestId?: string });
    expect(logged.find((entry) => entry.message === 'handler_line')?.requestId).toBe(response.headers.get('X-Request-Id'));
  });

  it('passes the generated request id through to routed handlers', async () => {
    vi.doMock('../../../../functions/api/handlers/templates', () => ({
      handleTemplates: vi.fn((request: Request) =>
        Response.json({
          requestId: request.headers.get('X-Request-Id'),
        }),
      ),
    }));

    const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');

    const response = await apiWorker.fetch(
      new Request('http://localhost/api/templates', {
        headers: {
          'X-Request-Id': 'client-provided-request-id',
        },
      }),
      buildEnv(),
    );

    const responseRequestId = response.headers.get('X-Request-Id');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(responseRequestId).toBeTruthy();
    expect(data.requestId).toBe(responseRequestId);
    expect(data.requestId).not.toBe('client-provided-request-id');
  });

  it('drops a client X-Forwarded-Host so no handler builds URLs from it, but keeps X-Forwarded-For for local rate limits', async () => {
    vi.doMock('../../../../functions/api/handlers/templates', () => ({
      handleTemplates: vi.fn((request: Request) =>
        Response.json({
          forwardedHost: request.headers.get('X-Forwarded-Host'),
          forwardedFor: request.headers.get('X-Forwarded-For'),
        }),
      ),
    }));

    const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');
    const response = await apiWorker.fetch(
      new Request('http://localhost/api/templates', {
        headers: { 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-For': '203.0.113.7' },
      }),
      buildEnv(),
    );

    expect(await response.json()).toEqual({ forwardedHost: null, forwardedFor: '203.0.113.7' });
  });

  it('keeps personal run MCP routes off on remote hosts unless explicitly enabled', async () => {
    const handleAgentMcp = vi.fn(() => Response.json({ ok: true }));
    vi.doMock('../../../../functions/api/handlers/agentMcp', () => ({ handleAgentMcp }));

    const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');
    const response = await apiWorker.fetch(
      new Request('https://staging.serplists.com/api/mcp', { method: 'POST' }),
      {} as any,
    );

    expect(response.status).toBe(404);
    expect(handleAgentMcp).not.toHaveBeenCalled();
  });

  it('allows explicit remote enablement and explicit local disablement', async () => {
    const handleAgentMcp = vi.fn(() => Response.json({ ok: true }));
    vi.doMock('../../../../functions/api/handlers/agentMcp', () => ({ handleAgentMcp }));

    const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');
    const enabledResponse = await apiWorker.fetch(
      new Request('https://staging.serplists.com/api/mcp', { method: 'POST' }),
      buildEnv({ PERSONAL_RUN_MCP_ENABLED: 'true' }),
    );
    const disabledResponse = await apiWorker.fetch(
      new Request('http://localhost/api/mcp', { method: 'POST' }),
      buildEnv({ PERSONAL_RUN_MCP_ENABLED: 'false' }),
    );

    expect(enabledResponse.status).toBe(200);
    expect(disabledResponse.status).toBe(404);
    expect(handleAgentMcp).toHaveBeenCalledOnce();
  });
});
