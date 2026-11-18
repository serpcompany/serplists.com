import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountQueryHook, settle } from '../../../support/queryHookProbe';
import { useProfileDirectory } from '@/features/profile/useProfileDirectory';

const page = {
  collection: 'organizations',
  profiles: [{ handle: 'Acme-Launch', name: 'Acme Launch', avatar_url: null, public_template_count: 2 }],
  next_cursor: 'Acme-Launch',
  previous_cursor: 'Able-Co',
};

const unmounts: Array<() => void> = [];
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
  vi.unstubAllGlobals();
});

function theApiAnswering(...answers: Array<{ status: number; body: unknown }>) {
  const fetchMock = vi.fn<typeof fetch>();
  answers.forEach(({ status, body }) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openTheDirectory(query: Parameters<typeof useProfileDirectory>[0]) {
  const directory = await mountQueryHook(() => useProfileDirectory(query));
  unmounts.push(directory.unmount);
  await act(settle);
  return directory.current;
}

describe('the Profiles directory', () => {
  it('shows a page of profiles with the cursors to the pages around it', async () => {
    const fetchMock = theApiAnswering({ status: 200, body: page });

    const directory = await openTheDirectory({ collection: 'organizations', after: 'Able-Co' });

    expect(new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost').searchParams.get('after')).toBe('Able-Co');
    expect(directory().listQuery).toEqual({ data: page.profiles, isError: false, isLoading: false });
    expect(directory().nextCursor).toBe('Acme-Launch');
    expect(directory().previousCursor).toBe('Able-Co');
  });

  it('shows the failure, and the page once a retry loads it', async () => {
    theApiAnswering({ status: 500, body: { error: 'Database unavailable' } }, { status: 200, body: { ...page, next_cursor: null, previous_cursor: null } });

    const directory = await openTheDirectory({ collection: 'people' });

    expect(directory().listQuery).toEqual({ data: undefined, isError: true, isLoading: false });
    expect(directory().nextCursor).toBeNull();
    expect(directory().previousCursor).toBeNull();

    await act(async () => {
      directory().retry();
      await settle();
    });

    expect(directory().listQuery.data).toEqual(page.profiles);
    expect(directory().listQuery.isError).toBe(false);
  });
});
