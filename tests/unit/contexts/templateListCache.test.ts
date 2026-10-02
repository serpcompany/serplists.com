import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { refreshAfterTemplateDelete } from '@/contexts/templateListCache';
import { queryKeys } from '@/lib/queryCache';

const clients: QueryClient[] = [];
const unsubscribers: Array<() => void> = [];

afterEach(() => {
  unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  clients.splice(0).forEach((client) => client.clear());
});

const observeOnceLoaded = async (client: QueryClient, queryKey: QueryKey, data: unknown) => {
  const queryFn = vi.fn(async () => data);
  const observer = new QueryObserver(client, { queryKey, queryFn, retry: false });
  unsubscribers.push(observer.subscribe(() => {}));
  await vi.waitFor(() => expect(client.getQueryState(queryKey)?.status).toBe('success'));
  queryFn.mockClear();
  return queryFn;
};

describe('refreshAfterTemplateDelete', () => {
  it('does not refetch the archived template the page still shows, whose 404 would read as not found after a restore, leaves it stale for the next visit, and reloads the lists', async () => {
    const client = new QueryClient();
    clients.push(client);
    const detail = await observeOnceLoaded(client, queryKeys.templateDetail('t1', 'u1'), { id: 't1' });
    const openedBySlug = await observeOnceLoaded(client, queryKeys.templateDetail('launch-qa', 'u1'), { id: 't1' });
    const history = await observeOnceLoaded(client, queryKeys.templateHistoryFor('t1', 'u1'), []);
    const otherDetail = await observeOnceLoaded(client, queryKeys.templateDetail('t2', 'u1'), { id: 't2' });
    const list = await observeOnceLoaded(client, ['templates', 'u1', 'personal'], []);

    refreshAfterTemplateDelete(client, 't1');

    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(otherDetail).toHaveBeenCalledTimes(1));
    expect(detail).not.toHaveBeenCalled();
    expect(openedBySlug).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
    expect(client.getQueryState(queryKeys.templateDetail('t1', 'u1'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.templateDetail('launch-qa', 'u1'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.templateHistoryFor('t1', 'u1'))?.isInvalidated).toBe(true);
  });

  it('marks an unobserved detail entry of the archived template stale', () => {
    const client = new QueryClient();
    clients.push(client);
    client.setQueryData(queryKeys.templateDetail('t1', 'u2'), { id: 't1' });

    refreshAfterTemplateDelete(client, 't1');

    expect(client.getQueryState(queryKeys.templateDetail('t1', 'u2'))?.isInvalidated).toBe(true);
  });
});
