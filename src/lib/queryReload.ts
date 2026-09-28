import type { QueryClient, QueryKey, Updater } from '@tanstack/react-query';

// Reloads a query after a write so the result reflects the write.
//
// In TanStack Query v5, refetch() and refetchQueries() join a fetch already in flight
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
  await queryClient.refetchQueries({ queryKey, exact: true });
}
