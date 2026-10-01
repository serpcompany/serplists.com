import type { QueryClient, QueryKey, Updater } from '@tanstack/react-query';

export async function reloadQuery<TData = unknown>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  update?: Updater<TData | undefined, TData | undefined>,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey, exact: true });
  if (update) queryClient.setQueryData<TData>(queryKey, update);
  await queryClient.invalidateQueries({ queryKey, exact: true });
}
