import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { reloadObservedQueries } from '@/features/teams/reloadObservedQueries';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useTeamSettingsQueries({ activeTeamId, canManageTeam }: { activeTeamId?: string; canManageTeam: boolean }) {
  const userId = useAuth().user?.id;
  const queryClient = useQueryClient();
  const signedIn = Boolean(userId);
  const keys = {
    members: queryKeys.teamMembers(userId, activeTeamId),
    activity: queryKeys.teamActivity(userId, activeTeamId),
    incomingInvites: queryKeys.incomingTeamInvites(userId),
    invites: queryKeys.teamInvites(userId, activeTeamId),
  };

  const membersQuery = useQuery({
    queryKey: keys.members,
    queryFn: () => api.getTeamMembers(activeTeamId as string),
    enabled: signedIn && Boolean(activeTeamId),
    staleTime: 60 * 1000,
  });
  const activityQuery = useQuery({
    queryKey: keys.activity,
    queryFn: () => api.getTeamActivity(activeTeamId as string),
    enabled: signedIn && Boolean(activeTeamId && canManageTeam),
    staleTime: 30 * 1000,
  });
  const incomingInvitesQuery = useQuery({
    queryKey: keys.incomingInvites,
    queryFn: () => api.getIncomingTeamInvites(),
    enabled: signedIn,
    staleTime: 30 * 1000,
  });

  const cancelThenRefetch = (query: { refetch: () => Promise<unknown> }, queryKey: QueryKey) => async () => {
    await queryClient.cancelQueries({ queryKey });
    await query.refetch();
  };

  return {
    membersQuery,
    activityQuery,
    incomingInvitesQuery,
    reload: {
      members: cancelThenRefetch(membersQuery, keys.members),
      activity: cancelThenRefetch(activityQuery, keys.activity),
      incomingInvites: cancelThenRefetch(incomingInvitesQuery, keys.incomingInvites),
      invites: () => reloadObservedQueries(queryClient, keys.invites),
    },
  };
}
