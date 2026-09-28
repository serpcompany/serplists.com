import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';
import { onUnauthorizedResponse } from '@/lib/unauthorizedResponses';

// A 401 means the request carried no valid session: it expired, or it was revoked from another
// device. The API client reports it so AuthProvider can re-check the session and sign the tab
// out, instead of leaving it "signed in" while every request fails.

const respond = (status: number, body: unknown = { error: 'Unauthorized' }) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

describe('API client 401 reporting', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a 401 once per request and still rejects with the ApiError', async () => {
    respond(401);
    const listener = vi.fn();
    const stop = onUnauthorizedResponse(listener);

    const request = api.getTemplates({ scope: 'personal' });

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('reports a 401 from a form upload', async () => {
    respond(401);
    const listener = vi.fn();
    const stop = onUnauthorizedResponse(listener);

    await expect(api.uploadToR2({ bucket: 'avatars', file: new File(['x'], 'x.png') })).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it.each([403, 404, 429, 500])('does not report a %s', async (status) => {
    respond(status, { error: 'Nope' });
    const listener = vi.fn();
    const stop = onUnauthorizedResponse(listener);

    await expect(api.getTemplates({ scope: 'personal' })).rejects.toMatchObject({ status });
    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it('stops reporting to a listener that unsubscribed', async () => {
    respond(401);
    const listener = vi.fn();
    onUnauthorizedResponse(listener)();

    await expect(api.getTemplates()).rejects.toMatchObject({ status: 401 });
    expect(listener).not.toHaveBeenCalled();
  });
});
