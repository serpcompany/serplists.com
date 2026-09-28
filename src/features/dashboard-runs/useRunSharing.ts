import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { createRunSharingActions } from './shareRun';

/** Share and stop-sharing actions for the runs dashboard; both refresh the runs list. */
export function useRunSharing() {
  const queryClient = useQueryClient();
  return useMemo(() => createRunSharingActions(queryClient), [queryClient]);
}
