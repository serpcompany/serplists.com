import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type { ProfileDirectoryQuery } from '@/lib/schemas/profileDirectory';

const PROFILE_DIRECTORY_STALE_TIME_MS = 5 * 60 * 1000;

const profileDirectoryQueryKey = (query: ProfileDirectoryQuery) =>
  ['profile-directory', query.collection, query.after ?? null, query.before ?? null] as const;

export function useProfileDirectory(query: ProfileDirectoryQuery) {
  const page = useQuery({
    queryKey: profileDirectoryQueryKey(query),
    queryFn: () => api.getProfileDirectory(query),
    staleTime: PROFILE_DIRECTORY_STALE_TIME_MS,
  });

  return {
    listQuery: { data: page.data?.profiles, isError: page.isError, isLoading: page.isLoading },
    nextCursor: page.data?.next_cursor ?? null,
    previousCursor: page.data?.previous_cursor ?? null,
    retry: () => void page.refetch(),
  };
}
