import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';

// The run page shows the latest few history events. Without a limit the API reads 50 audit
// rows (and their users) for every run that has had 50 saves.

const stubFetch = () =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ checklistId: 'run-1', subject: { type: 'user', id: 'u1' }, events: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

const requestedUrl = (fetchSpy: ReturnType<typeof stubFetch>) => String(fetchSpy.mock.calls[0]?.[0]);

describe('api.getChecklistHistory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the API for only the requested number of events', async () => {
    const fetchSpy = stubFetch();

    await api.getChecklistHistory('run-1', { limit: 8 });

    expect(requestedUrl(fetchSpy)).toMatch(/\/checklists\/run-1\/history\?limit=8$/);
  });

  it('keeps the API default when no limit is given', async () => {
    const fetchSpy = stubFetch();

    await api.getChecklistHistory('run 1');

    expect(requestedUrl(fetchSpy)).toMatch(/\/checklists\/run%201\/history$/);
  });

  it.each([0, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY])('ignores an invalid limit (%s)', async (limit) => {
    const fetchSpy = stubFetch();

    await api.getChecklistHistory('run-1', { limit });

    expect(requestedUrl(fetchSpy)).toMatch(/\/checklists\/run-1\/history$/);
  });
});
