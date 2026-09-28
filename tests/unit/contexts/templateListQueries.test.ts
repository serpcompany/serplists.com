import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildTemplateListQueries } from '@/contexts/TemplatesContext';

const clients: QueryClient[] = [];

// Mirrors the provider (passive observers) plus a page that calls useTemplateLists().
async function requestsFor(params: { ready?: boolean; userId?: string; activeTeamId?: string; catalog?: boolean; page?: boolean }) {
  const fetched: string[] = [];
  const queries = buildTemplateListQueries({
    ready: params.ready ?? true,
    userId: params.userId,
    activeTeamId: params.activeTeamId,
    workspaceScopeId: params.activeTeamId ?? 'personal',
    fetchList: (request) => async () => {
      fetched.push(request.teamId ? `teamId=${request.teamId}` : `scope=${request.scope}`);
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
  return fetched.sort();
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
    expect(await requestsFor({ ready: false, userId: 'user-1', page: true, catalog: true })).toEqual([]);
  });

  it('requests the shared public catalog for visitors, with no workspace list', async () => {
    expect(await requestsFor({ page: true, catalog: true })).toEqual(['scope=public']);
    expect(await requestsFor({ page: true })).toEqual([]);
  });

  it('requests only the Personal templates unless the page shows the catalog', async () => {
    expect(await requestsFor({ userId: 'user-1', page: true })).toEqual(['scope=personal']);
    expect(await requestsFor({ userId: 'user-1', page: true, catalog: true })).toEqual(['scope=personal', 'scope=public']);
  });

  it('requests the Organization list, and the catalog only when the page asks for it', async () => {
    expect(await requestsFor({ userId: 'user-1', activeTeamId: 'team-1', page: true })).toEqual(['teamId=team-1']);
    expect(await requestsFor({ userId: 'user-1', activeTeamId: 'team-1', page: true, catalog: true })).toEqual(
      ['scope=public', 'teamId=team-1'],
    );
  });

  it('shares one catalog key across users because the catalog is the same for everyone', () => {
    const fetchList = () => async () => [];
    const visitor = buildTemplateListQueries({ ready: true, workspaceScopeId: 'personal', fetchList });
    const member = buildTemplateListQueries({ ready: true, userId: 'user-1', workspaceScopeId: 'personal', fetchList });
    expect(member.catalog.queryKey).toEqual(visitor.catalog.queryKey);
  });
});
