import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';
import { readProfileDirectoryQuery } from '@/lib/schemas/profileDirectory';

const page = {
  collection: 'organizations',
  profiles: [{ handle: 'Acme-Launch', name: 'Acme Launch', avatar_url: null, public_template_count: 2 }],
  next_cursor: 'Acme-Launch',
  previous_cursor: null,
};

const fetchAnswering = (body: unknown) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const requestedUrl = (fetchMock: ReturnType<typeof vi.fn>) => new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost');

describe('api.getProfileDirectory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the collection and cursor the page shows, and nothing for the first page of People', async () => {
    const organizations = fetchAnswering(page);
    expect(await api.getProfileDirectory({ collection: 'organizations', after: 'a b' })).toEqual(page);
    expect(requestedUrl(organizations).pathname).toMatch(/\/profiles$/);
    expect(Object.fromEntries(requestedUrl(organizations).searchParams)).toEqual({ collection: 'organizations', after: 'a b' });

    const people = fetchAnswering({ ...page, collection: 'people' });
    await api.getProfileDirectory({ collection: 'people' });
    expect(requestedUrl(people).search).toBe('');
  });

  it('refuses an answer that is not a directory page', async () => {
    fetchAnswering({ ...page, profiles: [{ handle: 'acme', public_template_count: -1 }] });

    await expect(api.getProfileDirectory({ collection: 'organizations' })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('the address of a Profiles page', () => {
  it.each([
    ['', { collection: 'people' }],
    ['?collection=organizations&before=acme', { collection: 'organizations', before: 'acme' }],
    ['?collection=teams', { collection: 'people' }],
    ['?after=a&before=b', { collection: 'people' }],
  ])('reads %j as %j', (search, query) => {
    expect(readProfileDirectoryQuery(new URLSearchParams(search))).toEqual(query);
  });
});
