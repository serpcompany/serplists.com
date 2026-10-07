import { QueryClient } from '@tanstack/react-query';

export const APP_QUERY_STALE_TIME_MS = 60 * 1000;

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: APP_QUERY_STALE_TIME_MS,
        retry: 1,
      },
    },
  });
