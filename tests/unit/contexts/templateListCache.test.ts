import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { refreshAfterTemplateDelete } from '@/contexts/templateListCache';
import { getTemplateDetailQueryKey } from '@/features/template-detail/templateDetailQuery';
import { queryKeys } from '@/lib/queryCache';

const clients: QueryClient[] = [];
const unsubscribers: Array<() => void> = [];

afterEach(() => {
  unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  clients.splice(0).forEach((client) => client.clear());
});

// A page observing one key; resolves once its first load has landed.
const observe = async (client: QueryClient, queryKey: QueryKey, data: unknown) => {
  const queryFn = vi.fn(async () => data);
  const observer = new QueryObserver(client, { queryKey, queryFn, retry: false });
  unsubscribers.push(observer.subscribe(() => {}));
  await vi.waitFor(() => expect(client.getQueryState(queryKey)?.status).toBe('success'));
  queryFn.mockClear();
  return queryFn;
};

// Deleting from the detail page ran while that page still observed the template, so the
// ['templates'] invalidation refetched it: a GET that can only 404, whose null answer then
// stayed cached and made the template read "not found" right after a restore.
describe('refreshAfterTemplateDelete', () => {
  it('does not refetch the archived template the page still shows, but reloads the lists', async () => {
    const client = new QueryClient();
    clients.push(client);
    const detail = await observe(client, getTemplateDetailQueryKey('t1', 'u1'), { id: 't1' });
    // The page opened by slug: the key holds the slug, the data holds the id.
    const bySlug = await observe(client, getTemplateDetailQueryKey('launch-qa', 'u1'), { id: 't1' });
    const history = await observe(client, queryKeys.templateHistoryFor('t1', 'u1'), []);
    const otherDetail = await observe(client, getTemplateDetailQueryKey('t2', 'u1'), { id: 't2' });
    const list = await observe(client, ['templates', 'u1', 'personal'], []);

    refreshAfterTemplateDelete(client, 't1');

    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(otherDetail).toHaveBeenCalledTimes(1));
    expect(detail).not.toHaveBeenCalled();
    expect(bySlug).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
    // Still stale, so a later visit (after a restore) loads them again.
    expect(client.getQueryState(getTemplateDetailQueryKey('t1', 'u1'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(getTemplateDetailQueryKey('launch-qa', 'u1'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.templateHistoryFor('t1', 'u1'))?.isInvalidated).toBe(true);
  });

  it('marks an unobserved detail entry of the archived template stale', () => {
    const client = new QueryClient();
    clients.push(client);
    client.setQueryData(getTemplateDetailQueryKey('t1', 'u2'), { id: 't1' });

    refreshAfterTemplateDelete(client, 't1');

    expect(client.getQueryState(getTemplateDetailQueryKey('t1', 'u2'))?.isInvalidated).toBe(true);
  });
});
