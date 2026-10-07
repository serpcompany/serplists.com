import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import {
  dropTemplateFromCatalog,
  refreshAfterRunDelete,
  refreshAfterTemplateDelete,
} from '@/contexts/templateListCache';
import { queryKeys } from '@/lib/queryKeys';

describe('dropTemplateFromCatalog', () => {
  it('removes a deleted Template from the cached public catalog', () => {
    const client = new QueryClient();
    client.setQueryData(['templates', 'catalog'], [{ id: 'deleted' }, { id: 'kept' }]);

    dropTemplateFromCatalog(client, 'deleted');

    expect(client.getQueryData(['templates', 'catalog'])).toEqual([{ id: 'kept' }]);
    client.clear();
  });

  it('leaves an unloaded catalog unloaded', () => {
    const client = new QueryClient();

    dropTemplateFromCatalog(client, 'deleted');

    expect(client.getQueryData(['templates', 'catalog'])).toBeUndefined();
    client.clear();
  });
});

describe('delete refreshes', () => {
  it('marks every archived templates list stale when a Template is deleted', () => {
    const client = new QueryClient();
    client.setQueryData(['templates', 'catalog'], [{ id: 'deleted' }]);
    client.setQueryData(queryKeys.archivedTemplates('user-1', 'personal'), []);
    client.setQueryData(queryKeys.archivedTemplates('user-1', 'team-1'), []);

    refreshAfterTemplateDelete(client, 'deleted');

    expect(client.getQueryData(['templates', 'catalog'])).toEqual([]);
    expect(client.getQueryState(queryKeys.archivedTemplates('user-1', 'personal'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.archivedTemplates('user-1', 'team-1'))?.isInvalidated).toBe(true);
    client.clear();
  });

  it('keeps the patched catalog fresh when a Template is deleted, since the edge cache can still answer with the pre-delete catalog, and still marks the other lists stale', () => {
    const client = new QueryClient();
    client.setQueryData(['templates', 'catalog'], [{ id: 'deleted' }, { id: 'kept' }]);
    client.setQueryData(['templates', 'user-1', 'personal'], [{ id: 'deleted' }]);

    refreshAfterTemplateDelete(client, 'deleted');

    expect(client.getQueryData(['templates', 'catalog'])).toEqual([{ id: 'kept' }]);
    expect(client.getQueryState(['templates', 'catalog'])?.isInvalidated).toBe(false);
    expect(client.getQueryState(['templates', 'user-1', 'personal'])?.isInvalidated).toBe(true);
    client.clear();
  });

  it('does not refetch a catalog a page is showing when a Template is deleted', async () => {
    const client = new QueryClient();
    client.setQueryData(['templates', 'catalog'], [{ id: 'deleted' }, { id: 'kept' }]);
    const edgeCopyStillListingTheDeletedTemplate = vi.fn().mockResolvedValue([{ id: 'deleted' }, { id: 'kept' }]);
    const observer = new QueryObserver(client, {
      queryKey: ['templates', 'catalog'],
      queryFn: edgeCopyStillListingTheDeletedTemplate,
      staleTime: 5 * 60 * 1000,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    refreshAfterTemplateDelete(client, 'deleted');
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));

    expect(edgeCopyStillListingTheDeletedTemplate).not.toHaveBeenCalled();
    expect(client.getQueryData(['templates', 'catalog'])).toEqual([{ id: 'kept' }]);
    unsubscribe();
    client.clear();
  });

  it('marks the runs and archived runs lists stale when a Run is deleted', () => {
    const client = new QueryClient();
    client.setQueryData(['runs', 'user-1', 'personal'], []);
    client.setQueryData(queryKeys.archivedRuns('user-1', 'personal'), []);

    refreshAfterRunDelete(client);

    expect(client.getQueryState(['runs', 'user-1', 'personal'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.archivedRuns('user-1', 'personal'))?.isInvalidated).toBe(true);
    client.clear();
  });
});
