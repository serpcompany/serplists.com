import { QueryClient, type QueryKey } from '@tanstack/react-query';

// retryOnMount: false keeps a seeded error visible during a static render instead of
// the optimistic "fetching" state React Query reports for a query about to retry.
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });

// Puts a query into the state React Query v5 leaves after a failed fetch. Pass `data`
// to model a background refresh that failed after an earlier successful load.
export const seedQueryError = (
  queryClient: QueryClient,
  queryKey: QueryKey,
  data?: unknown,
) => {
  const now = Date.now();
  queryClient
    .getQueryCache()
    .build(queryClient, { queryKey })
    .setState({
      data,
      dataUpdatedAt: data === undefined ? 0 : now,
      error: new Error('Request failed'),
      errorUpdateCount: 1,
      errorUpdatedAt: now,
      fetchFailureCount: 1,
      fetchStatus: 'idle',
      status: 'error',
    });
};
