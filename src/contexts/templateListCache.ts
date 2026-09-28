import type { QueryClient } from '@tanstack/react-query';

// Marks every runs list stale and refetches only the ones a page is showing; the rest refetch
// when a page mounts them again. Never force-refetch inactive runs keys: an unobserved key keeps
// the queryFn (and `user`) of the render that last observed it, so after a sign-out and a
// sign-in in the same tab it would fetch the new session's runs into the old user's key.
export const refreshRunLists = (queryClient: QueryClient): Promise<void> =>
  queryClient.invalidateQueries({ queryKey: ['runs'] });
