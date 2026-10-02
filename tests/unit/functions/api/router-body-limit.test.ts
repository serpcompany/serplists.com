import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRESH_ROUTER_IMPORT_TIMEOUT_MS, freshApiWorker, silenceRequestLog } from '../../../support/apiRouter';
import { apiEnv } from '../../../support/apiEnv';
import { collectGarbageAndRunFinalizers } from '../../../support/garbageCollection';

const MB = 1024 * 1024;
const HANDLER_MODULES = {
  templates: '../../../../functions/api/handlers/templates',
  checklists: '../../../../functions/api/handlers/checklists',
  teams: '../../../../functions/api/handlers/teams',
  uploads: '../../../../functions/api/handlers/uploads',
  stripe: '../../../../functions/api/handlers/stripe',
} as const;

function buildEnv() {
  return apiEnv({ BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' });
}

function chunkedBody(totalBytes: number): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(64 * 1024).fill(0x61);
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunk.byteLength, totalBytes - sent);
      controller.enqueue(chunk.subarray(0, size));
      sent += size;
    },
  });
}

function chunkedText(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function request(
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: BodyInit } = {},
): Request {
  const requestInit: RequestInit & { duplex?: 'half' } = {
    method,
    ...(init.headers === undefined ? {} : { headers: init.headers }),
    ...(init.body === undefined ? {} : { body: init.body }),
    ...(init.body instanceof ReadableStream ? { duplex: 'half' } : {}),
  };
  return new Request(`http://localhost/api/${path}`, requestInit);
}

describe('API router request body limit', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  const handlers = {
    handleTemplates: vi.fn(async () => Response.json({ ok: true })),
    handleChecklists: vi.fn(async (_request: Request) => Response.json({ ok: true })),
    handleTeams: vi.fn(async () => Response.json({ ok: true })),
    handleUploads: vi.fn(async () => Response.json({ ok: true })),
    handleStripe: vi.fn(async (req: Request) => Response.json({ received: (await req.text()).length })),
  };

  async function send(req: Request) {
    const apiWorker = await freshApiWorker();
    return apiWorker.fetch(req, buildEnv());
  }

  beforeEach(() => {
    for (const handler of Object.values(handlers)) handler.mockClear();
    vi.doMock(HANDLER_MODULES.templates, () => ({ handleTemplates: handlers.handleTemplates }));
    vi.doMock(HANDLER_MODULES.checklists, () => ({ handleChecklists: handlers.handleChecklists }));
    vi.doMock(HANDLER_MODULES.teams, () => ({ handleTeams: handlers.handleTeams }));
    vi.doMock(HANDLER_MODULES.uploads, () => ({ handleUploads: handlers.handleUploads }));
    vi.doMock(HANDLER_MODULES.stripe, () => ({ handleStripe: handlers.handleStripe }));
    silenceRequestLog();
  });

  afterEach(() => {
    for (const modulePath of Object.values(HANDLER_MODULES)) vi.doUnmock(modulePath);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each([
    ['text/plain', { 'Content-Type': 'text/plain' }],
    ['no Content-Type', {}],
    ['mixed-case JSON', { 'Content-Type': 'Application/JSON; charset=utf-8' }],
  ])('rejects an oversized declared body sent as %s', async (_label, headers) => {
    const response = await send(
      request('POST', 'templates', {
        headers: { ...headers, 'Content-Length': String(1.5 * MB) },
        body: new Uint8Array(16),
      }),
    );

    expect(response.status).toBe(413);
    expect(response.headers.get('X-Request-Id')).toBeTruthy();
    expect(handlers.handleTemplates).not.toHaveBeenCalled();
  });

  it('rejects an oversized streamed body to the unauthenticated shared run route', async () => {
    const response = await send(request('PUT', 'checklists/shared/anything', { body: chunkedBody(1.5 * MB) }));

    expect(response.status).toBe(413);
    expect(handlers.handleChecklists).not.toHaveBeenCalled();
  });

  it('rejects an oversized text/plain body without a Content-Length', async () => {
    const response = await send(
      request('POST', 'teams', { headers: { 'Content-Type': 'text/plain' }, body: 'a'.repeat(1.5 * MB) }),
    );

    expect(response.status).toBe(413);
    expect(handlers.handleTeams).not.toHaveBeenCalled();
  });

  it('rejects oversized DELETE bodies and counts bytes when Content-Length is malformed', async () => {
    const deleteResponse = await send(request('DELETE', 'templates/abc', { body: chunkedBody(1.5 * MB) }));
    const malformedResponse = await send(
      request('POST', 'templates', {
        headers: { 'Content-Length': 'not-a-number' },
        body: chunkedBody(1.5 * MB),
      }),
    );

    expect(deleteResponse.status).toBe(413);
    expect(malformedResponse.status).toBe(413);
    expect(handlers.handleTemplates).not.toHaveBeenCalled();
  });

  it.each([
    ['declared', { 'Content-Type': 'application/json', 'Content-Length': String(20 * 1024) }, new Uint8Array(16)],
    ['streamed', { 'Content-Type': 'application/json' }, chunkedBody(20 * 1024)],
  ])('caps %s auth bodies at 16KB before Better Auth parses them', async (_label, headers, body) => {
    const response = await send(request('POST', 'auth/update-user', { headers, body }));

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'Payload too large (max 16KB)' });
  });

  it('allows up to 2MB for Template backups', async () => {
    const allowed = await send(request('POST', 'templates/backup', { body: chunkedBody(1.5 * MB) }));
    const rejected = await send(request('POST', 'templates/backup', { body: chunkedBody(2 * MB + 1) }));

    expect(allowed.status).toBe(200);
    expect(rejected.status).toBe(413);
    expect(handlers.handleTemplates).toHaveBeenCalledTimes(1);
  });

  it('lets multipart uploads through up to the upload cap', async () => {
    const allowed = await send(
      request('POST', 'uploads', {
        headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(5 * MB) },
        body: new Uint8Array(16),
      }),
    );
    const rejected = await send(
      request('POST', 'uploads', {
        headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(60 * MB) },
        body: new Uint8Array(16),
      }),
    );

    expect(allowed.status).toBe(200);
    expect(rejected.status).toBe(413);
    expect(handlers.handleUploads).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no Content-Length', {}],
    ['a malformed Content-Length', { 'Content-Length': 'lots' }],
  ])('refuses an upload streamed with %s before the handler parses it, since counting it would buffer up to 51MB', async (_label, headers) => {
    const response = await send(
      request('POST', 'uploads', {
        headers: { 'Content-Type': 'multipart/form-data; boundary=x', ...headers },
        body: chunkedBody(60 * MB),
      }),
    );

    expect(response.status).toBe(411);
    expect(await response.json()).toMatchObject({ error: 'Content-Length required' });
    expect(handlers.handleUploads).not.toHaveBeenCalled();
  });

  it('hands the handler a body sent without a Content-Length that it can still read after an await and a garbage collection', async () => {
    const payload = JSON.stringify({ sections: [{ id: 's1', items: [] }] });
    handlers.handleChecklists.mockImplementationOnce(async (req: Request) => {
      await collectGarbageAndRunFinalizers();
      return Response.json({ received: await req.text() });
    });

    const response = await send(request('PUT', 'checklists/shared/anything', { body: chunkedText(payload) }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: payload });
  });

  it('keeps small bodies readable for the handler', async () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
    const response = await send(
      request('POST', 'stripe/webhook', { headers: { 'Content-Type': 'application/json' }, body: payload }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: payload.length });
  });
});
