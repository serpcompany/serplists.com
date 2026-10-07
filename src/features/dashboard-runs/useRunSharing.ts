import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { createRunSharingActions } from './shareRun';

export function useRunSharing() {
  const queryClient = useQueryClient();
  return useMemo(() => createRunSharingActions(queryClient), [queryClient]);
}
