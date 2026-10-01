import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

import {
  canRestoreArchiveItem,
  describeRestoreError,
  getArchiveListState,
  parseArchiveItems,
  restoreArchiveItem,
  type ArchiveItem,
} from './archiveRecovery';

export function useArchiveRecovery() {
  const { user } = useAuth();
  const userId = user?.id;
  const { activeTeamId, getPermissions, isWorkspaceLoading, workspaceScopeId } = useWorkspace();
  const permissions = getPermissions(activeTeamId);
  const canRestoreTemplates = canRestoreArchiveItem(permissions, 'template');
  const canRestoreRuns = canRestoreArchiveItem(permissions, 'run');
  const queryClient = useQueryClient();
  const params = activeTeamId ? { teamId: activeTeamId } : undefined;
  const enabled = Boolean(user) && !isWorkspaceLoading;

  const templatesQuery = useQuery({
    queryKey: queryKeys.archivedTemplates(userId, workspaceScopeId),
    queryFn: async () => parseArchiveItems(await api.getArchivedTemplates(params), 'template'),
    enabled,
    staleTime: 60 * 1000,
  });

  const runsQuery = useQuery({
    queryKey: queryKeys.archivedRuns(userId, workspaceScopeId),
    queryFn: async () => parseArchiveItems(await api.getArchivedChecklists(params), 'run'),
    enabled,
    staleTime: 60 * 1000,
  });

  const restoringIdsRef = useRef(new Set<string>());
  const [restoringIds, setRestoringIds] = useState<ReadonlySet<string>>(() => new Set());

  const restore = useCallback(
    async (item: ArchiveItem) => {
      const allowed = item.kind === 'template' ? canRestoreTemplates : canRestoreRuns;
      if (restoringIdsRef.current.has(item.id) || !allowed) return;
      setRestoringIds((ids) => new Set(ids).add(item.id));
      try {
        const restored = await restoreArchiveItem(
          {
            queryClient,
            restoringIds: restoringIdsRef.current,
            restoreTemplate: (id) => api.restoreTemplate(id),
            restoreRun: (id) => api.restoreChecklist(id),
            userId,
            scopeId: workspaceScopeId,
          },
          item,
        );
        if (restored) {
          toast.success(item.kind === 'template' ? 'Template restored' : 'Run restored');
        }
      } catch (error) {
        toast.error(describeRestoreError(error, item.kind));
      } finally {
        setRestoringIds((ids) => {
          const next = new Set(ids);
          next.delete(item.id);
          return next;
        });
      }
    },
    [canRestoreRuns, canRestoreTemplates, queryClient, userId, workspaceScopeId],
  );

  return {
    archivedTemplates: templatesQuery.data ?? [],
    archivedRuns: runsQuery.data ?? [],
    templatesState: getArchiveListState(templatesQuery),
    runsState: getArchiveListState(runsQuery),
    templatesError: templatesQuery.error,
    runsError: runsQuery.error,
    refetchTemplates: () => void templatesQuery.refetch(),
    refetchRuns: () => void runsQuery.refetch(),
    canRestoreTemplates,
    canRestoreRuns,
    restoringIds,
    restore,
  };
}
