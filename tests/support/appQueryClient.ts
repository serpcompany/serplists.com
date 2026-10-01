import { QueryClient } from '@tanstack/react-query';

export const APP_QUERY_STALE_TIME = 60 * 1000;

export const createQueryClientWithAppDefaults = () =>
  new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: APP_QUERY_STALE_TIME } } });
