import type { QueryClient, QueryKey, Updater } from '@tanstack/react-query';

// Reloads a query after a write so the result reflects the write.
//
// In TanStack Query v5, refetch() (and refetching by key) joins a fetch already in flight
// when the query has no data yet (its first load), and fetchQuery() joins any fetch in
// flight. That fetch read the server before the write, so it would put the old list
// back. Cancel it first (the query reverts to its state before that fetch), apply
// `update` so the written item shows at once, then fetch again.
export async function reloadQuery<TData = unknown>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  update?: Updater<TData | undefined, TData | undefined>,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey, exact: true });
  if (update) queryClient.setQueryData<TData>(queryKey, update);
  // Fetches again only while a page shows the query; an unshown key is just marked stale, so
  // it never refetches with the queryFn (and user) of the page that last read it.
  await queryClient.invalidateQueries({ queryKey, exact: true });
}
