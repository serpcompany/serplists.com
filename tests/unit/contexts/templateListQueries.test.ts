import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildTemplateListQueries } from '@/contexts/TemplatesContext';

const clients: QueryClient[] = [];

// Mirrors the provider (passive observers) plus a page that calls useTemplateLists().
async function requestsFor(params: { ready?: boolean; userId?: string; activeTeamId?: string; catalog?: boolean; page?: boolean }) {
  const fetched: Array<string | undefined> = [];
  const queries = buildTemplateListQueries({
    ready: params.ready ?? true,
    userId: params.userId,
    activeTeamId: params.activeTeamId,
    workspaceScopeId: params.activeTeamId ?? 'personal',
    fetchList: (teamId) => async () => {
      fetched.push(teamId);
      return [];
    },
  });
  const client = new QueryClient();
  clients.push(client);
  const observers = [
    new QueryObserver(client, { ...queries.catalog, enabled: false }),
    new QueryObserver(client, { ...queries.workspace, enabled: false }),
    ...(params.page
      ? [
          new QueryObserver(client, { ...queries.catalog, enabled: queries.ready && params.catalog === true }),
          new QueryObserver(client, queries.workspace),
        ]
      : []),
  ];
  observers.forEach((observer) => observer.subscribe(() => {}));
  await vi.waitFor(() => expect(client.isFetching()).toBe(0));
  return fetched;
}

describe('template list queries', () => {
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  it('fetches nothing on pages that do not read template lists', async () => {
    expect(await requestsFor({})).toEqual([]);
    expect(await requestsFor({ userId: 'user-1', activeTeamId: 'team-1' })).toEqual([]);
  });

  it('waits for the session and workspace before loading any list', async () => {
    expect(await requestsFor({ ready: false, page: true, catalog: true })).toEqual([]);
  });

  it('makes one catalog request for visitors, with no workspace request', async () => {
    expect(await requestsFor({ page: true, catalog: true })).toEqual([undefined]);
    expect(await requestsFor({ page: true })).toEqual([]);
  });

  it('shares one request between the catalog and the Personal workspace', async () => {
    expect(await requestsFor({ userId: 'user-1', page: true, catalog: true })).toEqual([undefined]);
    expect(await requestsFor({ userId: 'user-1', page: true })).toEqual([undefined]);
  });

  it('loads the Organization list, and the catalog only when the page asks for it', async () => {
    expect(await requestsFor({ userId: 'user-1', activeTeamId: 'team-1', page: true })).toEqual(['team-1']);
    expect((await requestsFor({ userId: 'user-1', activeTeamId: 'team-1', page: true, catalog: true })).sort()).toEqual(
      ['team-1', undefined].sort(),
    );
  });
});
