import type { QueryClient, QueryKey } from '@tanstack/react-query';

export async function reloadObservedQueries(queryClient: QueryClient, queryKey: QueryKey): Promise<void> {
  await queryClient.cancelQueries({ queryKey });
  await queryClient.refetchQueries({ queryKey, type: 'active' });
}
