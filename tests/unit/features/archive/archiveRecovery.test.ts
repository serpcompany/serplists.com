import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseArchiveItems, restoreArchiveItem } from '@/features/archive/archiveRecovery';
import { getTemplateDetailQueryKey } from '@/features/template-detail/templateDetailQuery';
import { queryKeys } from '@/lib/queryKeys';

const clients: QueryClient[] = [];
const newClient = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return client;
};

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

const setup = (overrides: { restoreTemplate?: () => Promise<unknown>; restoreRun?: () => Promise<unknown> } = {}) => {
  const queryClient = newClient();
  const dependencies = {
    queryClient,
    pending: new Set<string>(),
    restoreTemplate: vi.fn(overrides.restoreTemplate ?? (async () => ({ success: true }))),
    restoreRun: vi.fn(overrides.restoreRun ?? (async () => ({ success: true }))),
    userId: 'user-1',
    scopeId: 'personal',
  };
  return { queryClient, dependencies };
};

describe('parseArchiveItems', () => {
  it('maps archived rows and skips rows without an id', () => {
    expect(
      parseArchiveItems(
        [
          { id: 'template-1', title: 'Launch', deleted_at: '2026-07-03T12:00:00.000Z' },
          { id: 'template-2', title: null, updated_at: '2026-07-02T12:00:00.000Z' },
          { title: 'No id' },
        ],
        'template',
      ),
    ).toEqual([
      { id: 'template-1', kind: 'template', title: 'Launch', archivedAt: '2026-07-03T12:00:00.000Z' },
      { id: 'template-2', kind: 'template', title: 'Untitled template', archivedAt: '2026-07-02T12:00:00.000Z' },
    ]);
  });

  it('rejects a response that is not a list instead of showing an empty archive', () => {
    expect(() => parseArchiveItems({ error: 'boom' }, 'run')).toThrow();
  });
});

describe('restoreArchiveItem', () => {
  it('sends one request when the same item is restored twice before the first finishes', async () => {
    let finish: () => void = () => {};
    const { dependencies } = setup({
      restoreRun: () => new Promise((resolve) => { finish = () => resolve({ success: true }); }),
    });

    const first = restoreArchiveItem(dependencies, { id: 'run-1', kind: 'run' });
    const second = restoreArchiveItem(dependencies, { id: 'run-1', kind: 'run' });
    finish();

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(dependencies.restoreRun).toHaveBeenCalledTimes(1);
    expect(dependencies.pending.size).toBe(0);
  });

  it('marks the archive and the lists the item returns to as stale', async () => {
    const { queryClient, dependencies } = setup();
    queryClient.setQueryData(queryKeys.archivedTemplates('user-1', 'personal'), []);
    queryClient.setQueryData(['templates', 'user-1', 'personal'], []);
    queryClient.setQueryData(['runs', 'user-1', 'personal'], []);

    await restoreArchiveItem(dependencies, { id: 'template-1', kind: 'template' });

    expect(dependencies.restoreTemplate).toHaveBeenCalledWith('template-1');
    expect(queryClient.getQueryState(queryKeys.archivedTemplates('user-1', 'personal'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['templates', 'user-1', 'personal'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['runs', 'user-1', 'personal'])?.isInvalidated).toBe(true);
  });

  it('passes the server error on and lets the item be restored again', async () => {
    const { dependencies } = setup({
      restoreRun: async () => {
        throw new Error('Active run limit reached. Upgrade to Pro to restore more checklist runs.');
      },
    });

    await expect(restoreArchiveItem(dependencies, { id: 'run-1', kind: 'run' })).rejects.toThrow('Active run limit reached');
    expect(dependencies.pending.has('run-1')).toBe(false);
  });
});

// A delete from the detail page could cache the archived template as gone (null). After a
// restore the next visit showed "Template Not Found" until its refetch returned.
describe('restoreArchiveItem and cached detail pages', () => {
  it('forgets that the restored template was gone, so it opens with a spinner', async () => {
    const { queryClient, dependencies } = setup();
    queryClient.setQueryData(getTemplateDetailQueryKey('template-1', 'user-1'), null);
    queryClient.setQueryData(getTemplateDetailQueryKey('template-1', 'user-2'), { id: 'template-1' });
    // Opened by slug: the key cannot name the id, and a gone answer holds no data.
    queryClient.setQueryData(getTemplateDetailQueryKey('launch-qa', 'user-1'), null);
    queryClient.setQueryData(getTemplateDetailQueryKey('template-2', 'user-1'), { id: 'template-2' });

    await restoreArchiveItem(dependencies, { id: 'template-1', kind: 'template' });

    expect(queryClient.getQueryState(getTemplateDetailQueryKey('template-1', 'user-1'))).toBeUndefined();
    expect(queryClient.getQueryState(getTemplateDetailQueryKey('template-1', 'user-2'))).toBeUndefined();
    expect(queryClient.getQueryState(getTemplateDetailQueryKey('launch-qa', 'user-1'))).toBeUndefined();
    expect(queryClient.getQueryData(getTemplateDetailQueryKey('template-2', 'user-1'))).toEqual({ id: 'template-2' });
  });

  it('leaves template detail pages alone when a run is restored', async () => {
    const { queryClient, dependencies } = setup();
    queryClient.setQueryData(getTemplateDetailQueryKey('template-1', 'user-1'), null);

    await restoreArchiveItem(dependencies, { id: 'run-1', kind: 'run' });

    expect(queryClient.getQueryData(getTemplateDetailQueryKey('template-1', 'user-1'))).toBeNull();
  });
});
