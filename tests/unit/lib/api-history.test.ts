import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { HISTORY_DISPLAY_LIMIT } from '@/lib/history';

describe('history requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for only the entries the Changelog cards show', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL) => new Response(JSON.stringify({ versions: [], events: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.getTemplateHistory('template-1');
    await api.getChecklistHistory('run-1');

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(HISTORY_DISPLAY_LIMIT).toBe(8);
    expect(urls[0]).toMatch(/\/templates\/template-1\/history\?limit=8$/);
    expect(urls[1]).toMatch(/\/checklists\/run-1\/history\?limit=8$/);
  });
});
