import { QueryClient, type QueryKey } from '@tanstack/react-query';

export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });

export const seedQueryError = (
  queryClient: QueryClient,
  queryKey: QueryKey,
  dataOfAnEarlierSuccessfulLoad?: unknown,
) => {
  const now = Date.now();
  queryClient
    .getQueryCache()
    .build(queryClient, { queryKey })
    .setState({
      data: dataOfAnEarlierSuccessfulLoad,
      dataUpdatedAt: dataOfAnEarlierSuccessfulLoad === undefined ? 0 : now,
      error: new Error('Request failed'),
      errorUpdateCount: 1,
      errorUpdatedAt: now,
      fetchFailureCount: 1,
      fetchStatus: 'idle',
      status: 'error',
    });
};
