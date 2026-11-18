import { afterEach, describe, expect, it, vi } from 'vitest';

import { firstOf } from '../../support/elements';

const SITE_CHUNK = `${window.location.origin}/_next/static/chunks/0a1b2c3d.js`;

describe("the browser's instrumentation entry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports an error the site throws once the page has loaded it', async () => {
    const fetchReport = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchReport);
    await import('@/instrumentation-client');

    const error = Object.assign(new TypeError('Cannot save'), { stack: `TypeError: Cannot save\n    at onClick (${SITE_CHUNK}:1:2)` });
    window.dispatchEvent(new ErrorEvent('error', { error, filename: SITE_CHUNK }));

    expect(fetchReport).toHaveBeenCalledTimes(1);
    expect(firstOf(fetchReport.mock.calls)[0]).toBe('/api/client-errors');
  });
});
