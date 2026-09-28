import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api-errors';
import { queryKeys } from '@/lib/queryKeys';

import { parseArchiveItems, restoreArchiveItem, type ArchiveItem } from './archiveRecovery';

// Archived Templates and Runs for the active context. The archive lists read every archived
// row for the owner, so only the archive page loads them.
export function useArchiveRecovery() {
  const { user } = useAuth();
  const { activeTeamId, isWorkspaceLoading, workspaceScopeId } = useWorkspace();
  const queryClient = useQueryClient();
  const params = activeTeamId ? { teamId: activeTeamId } : undefined;
  const enabled = Boolean(user) && !isWorkspaceLoading;

  const templatesQuery = useQuery({
    queryKey: queryKeys.archivedTemplates(user?.id, workspaceScopeId),
    queryFn: async () => parseArchiveItems(await api.getArchivedTemplates(params), 'template'),
    enabled,
    staleTime: 60 * 1000,
  });

  const runsQuery = useQuery({
    queryKey: queryKeys.archivedRuns(user?.id, workspaceScopeId),
    queryFn: async () => parseArchiveItems(await api.getArchivedChecklists(params), 'run'),
    enabled,
    staleTime: 60 * 1000,
  });

  // The ref blocks a second request for the same item before React re-renders; the state
  // disables that item's Restore button.
  const pendingRef = useRef(new Set<string>());
  const [restoringIds, setRestoringIds] = useState<ReadonlySet<string>>(() => new Set());

  const restore = useCallback(
    async (item: ArchiveItem) => {
      if (pendingRef.current.has(item.id)) return;
      setRestoringIds((ids) => new Set(ids).add(item.id));
      try {
        const restored = await restoreArchiveItem(
          {
            queryClient,
            pending: pendingRef.current,
            restoreTemplate: (id) => api.restoreTemplate(id),
            restoreRun: (id) => api.restoreChecklist(id),
            userId: user?.id,
            scopeId: workspaceScopeId,
          },
          item,
        );
        if (restored) {
          toast.success(item.kind === 'template' ? 'Template restored' : 'Run restored');
        }
      } catch (error) {
        // Plan limits and Organization roles come back as 403 with the reason in the message.
        toast.error(
          getApiErrorMessage(error, item.kind === 'template' ? 'Failed to restore template.' : 'Failed to restore run.'),
        );
      } finally {
        setRestoringIds((ids) => {
          const next = new Set(ids);
          next.delete(item.id);
          return next;
        });
      }
    },
    [queryClient, user?.id, workspaceScopeId],
  );

  return {
    archivedTemplates: templatesQuery.data ?? [],
    archivedRuns: runsQuery.data ?? [],
    templatesError: templatesQuery.data ? null : templatesQuery.error,
    runsError: runsQuery.data ? null : runsQuery.error,
    refetchTemplates: () => void templatesQuery.refetch(),
    refetchRuns: () => void runsQuery.refetch(),
    isLoading: templatesQuery.isLoading || runsQuery.isLoading,
    restoringIds,
    restore,
  };
}
