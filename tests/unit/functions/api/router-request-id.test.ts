import { afterEach, describe, expect, it, vi } from 'vitest';

function buildEnv(overrides?: Record<string, unknown>) {
  return {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    ...overrides,
  } as any;
}

describe('API router request id propagation', () => {
  afterEach(() => {
    vi.doUnmock('../../../../functions/api/handlers/templates');
    vi.resetModules();
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
});
