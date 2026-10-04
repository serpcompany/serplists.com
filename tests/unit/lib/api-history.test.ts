import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { HISTORY_DISPLAY_LIMIT } from '@/lib/schemas/historyLimits';

describe('history requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for only the entries the Activity cards show, and the latest 100 after View all activity', async () => {
    const subject = { type: 'user', id: 'user-1' };
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const body = String(url).includes('/templates/')
        ? { templateId: 'template-1', subject, versions: [], events: [] }
        : { checklistId: 'run-1', subject, events: [] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.getTemplateHistory('template-1');
    await api.getChecklistHistory('run-1');
    await api.getTemplateHistory('template-1', { limit: 100 });

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(HISTORY_DISPLAY_LIMIT).toBe(8);
    expect(urls[0]).toMatch(/\/templates\/template-1\/history\?limit=8$/);
    expect(urls[1]).toMatch(/\/checklists\/run-1\/history\?limit=8$/);
    expect(urls[2]).toMatch(/\/templates\/template-1\/history\?limit=100$/);
  });
});
