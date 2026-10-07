import { APP_QUERY_STALE_TIME_MS, createQueryClient } from '@/lib/queryClient';

export const APP_QUERY_STALE_TIME = APP_QUERY_STALE_TIME_MS;

export const createQueryClientWithAppDefaults = createQueryClient;
