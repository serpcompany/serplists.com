import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

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
