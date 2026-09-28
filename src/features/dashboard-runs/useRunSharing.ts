import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { createRunSharingActions } from './shareRun';

/** The runs dashboard's Stop sharing action; it refreshes the runs list once the API confirms. */
export function useRunSharing() {
  const queryClient = useQueryClient();
  return useMemo(() => createRunSharingActions(queryClient), [queryClient]);
}
