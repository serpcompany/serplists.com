import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';

describe('api.getTeamActivity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests only the events the Organization settings page shows', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.getTeamActivity('team 1');

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.pathname).toMatch(/\/teams\/team%201\/activity$/);
    expect(url.searchParams.get('limit')).toBe('10');
  });
});
