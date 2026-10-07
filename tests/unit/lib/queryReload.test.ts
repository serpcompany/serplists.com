import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { reloadQuery } from '@/lib/queryReload';

import { deferred } from '../../support/deferred';

const queryKey = ['agent-keys'];

const startFirstLoadLikeAMountedUseQuery = (queryClient: QueryClient, queryFn: () => Promise<string[]>) => {
  const observer = new QueryObserver(queryClient, { queryKey, queryFn });
  const unsubscribe = observer.subscribe(() => undefined);
  return { observer, unsubscribe };
};

describe('reloadQuery', () => {
  it('pins why the helper exists: refetch() joins a first load already in flight', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const staleList = deferred<string[]>();
    const queryFn = vi.fn().mockReturnValueOnce(staleList.promise).mockResolvedValue(['key-new']);
    const { observer, unsubscribe } = startFirstLoadLikeAMountedUseQuery(queryClient, queryFn);

    const refetched = observer.refetch();
    staleList.resolve([]);
    await refetched;

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKey)).toEqual([]);
    unsubscribe();
  });

  it('fetches again after a write instead of joining the first load that predates it', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const staleList = deferred<string[]>();
    const queryFn = vi.fn().mockReturnValueOnce(staleList.promise).mockResolvedValue(['key-new']);
    const { unsubscribe } = startFirstLoadLikeAMountedUseQuery(queryClient, queryFn);

    const reloaded = reloadQuery(queryClient, queryKey);
    staleList.resolve([]);
    await reloaded;

    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(queryKey)).toEqual(['key-new']);
    unsubscribe();
  });

  it('shows the written item from the update until the fresh list lands', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const staleList = deferred<string[]>();
    const freshList = deferred<string[]>();
    const queryFn = vi.fn().mockReturnValueOnce(staleList.promise).mockReturnValueOnce(freshList.promise);
    const { unsubscribe } = startFirstLoadLikeAMountedUseQuery(queryClient, queryFn);

    const reloaded = reloadQuery<string[]>(queryClient, queryKey, (keys = []) => ['key-new', ...keys]);
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    expect(queryClient.getQueryData(queryKey)).toEqual(['key-new']);

    staleList.resolve([]);
    await Promise.resolve();
    expect(queryClient.getQueryData(queryKey)).toEqual(['key-new']);

    freshList.resolve(['key-new', 'key-old']);
    await reloaded;
    expect(queryClient.getQueryData(queryKey)).toEqual(['key-new', 'key-old']);
    unsubscribe();
  });

  it('refetches a query that already has data', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryFn = vi.fn().mockResolvedValueOnce(['key-old']).mockResolvedValueOnce(['key-old', 'key-new']);
    const { unsubscribe } = startFirstLoadLikeAMountedUseQuery(queryClient, queryFn);
    await vi.waitFor(() => expect(queryClient.getQueryData(queryKey)).toEqual(['key-old']));

    await reloadQuery(queryClient, queryKey);

    expect(queryClient.getQueryData(queryKey)).toEqual(['key-old', 'key-new']);
    unsubscribe();
  });

  it("marks a query no page shows stale instead of refetching it with the last page's query function", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryFn = vi.fn().mockResolvedValue(['key-old']);
    const { unsubscribe } = startFirstLoadLikeAMountedUseQuery(queryClient, queryFn);
    await vi.waitFor(() => expect(queryClient.getQueryData(queryKey)).toEqual(['key-old']));
    unsubscribe();

    await reloadQuery(queryClient, queryKey);

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
  });
});
