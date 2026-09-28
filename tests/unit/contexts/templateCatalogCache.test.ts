import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { dropTemplateFromCatalog } from '@/contexts/templateListCache';

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
