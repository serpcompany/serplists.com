import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { markListsStaleForWorkspaceSwitch } from '@/contexts/templateListCache';

const STALE_TIME = 5 * 60 * 1000;
const clients: QueryClient[] = [];

// selectWorkspace runs inside the click handler, before React re-renders: the page's list
// observers are still on the old context's keys, with queryFns that name the old context.
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const fetchers = {
    templatesA: vi.fn(async () => [{ id: 'org-template' }]),
    runsA: vi.fn(async () => [{ id: 'org-run' }]),
    templatesPersonal: vi.fn(async () => [{ id: 'personal-template' }]),
    runsPersonal: vi.fn(async () => [{ id: 'personal-run' }]),
    catalog: vi.fn(async () => [{ id: 'public-template' }]),
  };
  const listQueries = (scope: 'team-a' | 'personal') => ({
    templates: {
      queryKey: ['templates', 'user-1', scope] as QueryKey,
      queryFn: scope === 'team-a' ? fetchers.templatesA : fetchers.templatesPersonal,
      staleTime: STALE_TIME,
    },
    runs: {
      queryKey: ['runs', 'user-1', scope] as QueryKey,
      queryFn: scope === 'team-a' ? fetchers.runsA : fetchers.runsPersonal,
      staleTime: STALE_TIME,
    },
  });
  const page = {
    templates: new QueryObserver(client, listQueries('team-a').templates),
    runs: new QueryObserver(client, listQueries('team-a').runs),
    catalog: new QueryObserver(client, { queryKey: ['templates', 'catalog'], queryFn: fetchers.catalog, staleTime: STALE_TIME }),
  };
  const unsubscribe = Object.values(page).map((observer) => observer.subscribe(() => {}));
  const moveTo = (scope: 'team-a' | 'personal') => {
    page.templates.setOptions(listQueries(scope).templates);
    page.runs.setOptions(listQueries(scope).runs);
  };
  const clearCalls = () => Object.values(fetchers).forEach((fetcher) => fetcher.mockClear());
  const totalCalls = () => Object.values(fetchers).reduce((sum, fetcher) => sum + fetcher.mock.calls.length, 0);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { client, fetchers, moveTo, clearCalls, totalCalls, settle, unsubscribe };
}

async function loadedOnOrganization() {
  const context = setup();
  // Personal lists were loaded a minute ago and are still inside their staleTime.
  context.client.setQueryData(['templates', 'user-1', 'personal'], [{ id: 'old-personal-template' }]);
  context.client.setQueryData(['runs', 'user-1', 'personal'], [{ id: 'old-personal-run' }]);
  await vi.waitFor(() => expect(context.totalCalls()).toBe(3));
  await context.settle();
  context.clearCalls();
  return context;
}

describe('markListsStaleForWorkspaceSwitch', () => {
  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  it('does not refetch the lists of the context being left, or the catalog', async () => {
    const { fetchers, settle, unsubscribe } = await loadedOnOrganization();

    markListsStaleForWorkspaceSwitch(clients[0], { fromWorkspaceId: 'team-a', toWorkspaceId: 'personal' });
    await settle();

    expect(fetchers.templatesA).not.toHaveBeenCalled();
    expect(fetchers.runsA).not.toHaveBeenCalled();
    expect(fetchers.catalog).not.toHaveBeenCalled();
    unsubscribe.forEach((stop) => stop());
  });

  it('loads the new context once when the page moves to it, even from a fresh cache', async () => {
    const { client, fetchers, moveTo, settle, unsubscribe } = await loadedOnOrganization();

    markListsStaleForWorkspaceSwitch(client, { fromWorkspaceId: 'team-a', toWorkspaceId: 'personal' });
    moveTo('personal');
    await vi.waitFor(() => expect(client.getQueryData(['runs', 'user-1', 'personal'])).toEqual([{ id: 'personal-run' }]));
    await settle();

    expect(fetchers.templatesPersonal).toHaveBeenCalledTimes(1);
    expect(fetchers.runsPersonal).toHaveBeenCalledTimes(1);
    expect(fetchers.templatesA).not.toHaveBeenCalled();
    expect(fetchers.runsA).not.toHaveBeenCalled();
    expect(fetchers.catalog).not.toHaveBeenCalled();

    // Switching back inside the staleTime still loads the Organization's lists again.
    markListsStaleForWorkspaceSwitch(client, { fromWorkspaceId: 'personal', toWorkspaceId: 'team-a' });
    moveTo('team-a');
    await vi.waitFor(() => expect(fetchers.runsA).toHaveBeenCalledTimes(1));
    expect(fetchers.templatesA).toHaveBeenCalledTimes(1);
    expect(fetchers.catalog).not.toHaveBeenCalled();
    unsubscribe.forEach((stop) => stop());
  });

  it('fetches nothing when the context already selected is selected again', async () => {
    const { client, settle, totalCalls, unsubscribe } = await loadedOnOrganization();

    markListsStaleForWorkspaceSwitch(client, { fromWorkspaceId: 'team-a', toWorkspaceId: 'team-a' });
    await settle();

    expect(totalCalls()).toBe(0);
    expect(client.getQueryState(['templates', 'user-1', 'team-a'])?.isInvalidated).toBe(false);
    unsubscribe.forEach((stop) => stop());
  });
});
