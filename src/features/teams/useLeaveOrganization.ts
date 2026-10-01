import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { api, type TeamSummary } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

const PERSONAL_CONTEXT_ID = 'personal';

type AfterLeaveDependencies = {
  activeTeamId?: string;
  refreshTeams: () => Promise<TeamSummary[]>;
  selectWorkspace: (workspaceId: string) => void;
};

export async function afterLeavingOrganization(
  teamId: string,
  { activeTeamId, refreshTeams, selectWorkspace }: AfterLeaveDependencies,
): Promise<void> {
  if (activeTeamId === teamId) {
    selectWorkspace(PERSONAL_CONTEXT_ID);
  }

  await refreshTeams().catch(() => undefined);
}

export function useLeaveOrganization() {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id;
  const { activeTeamId, refreshTeams, selectWorkspace } = useWorkspace();

  const mutation = useMutation({
    mutationFn: (teamId: string) => api.leaveTeam(teamId),
    onSuccess: async (_result, teamId) => {
      await afterLeavingOrganization(teamId, { activeTeamId, refreshTeams, selectWorkspace });
      queryClient.removeQueries({ queryKey: queryKeys.teamMembers(userId, teamId) });
    },
  });

  return {
    leaveOrganization: (teamId: string) => mutation.mutateAsync(teamId),
    isLeaving: mutation.isPending,
  };
}
