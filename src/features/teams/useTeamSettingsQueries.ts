import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

// The lists on the Organization settings card. Keys carry the signed-in user, so someone who
// signs in on the same tab never sees another person's cached invites or member rows.
export function useTeamSettingsQueries({ activeTeamId, canManageTeam }: { activeTeamId?: string; canManageTeam: boolean }) {
  const userId = useAuth().user?.id;
  const queryClient = useQueryClient();
  const signedIn = Boolean(userId);
  const keys = {
    members: queryKeys.teamMembers(userId, activeTeamId),
    invites: queryKeys.teamInvites(userId, activeTeamId),
    activity: queryKeys.teamActivity(userId, activeTeamId),
    incomingInvites: queryKeys.incomingTeamInvites(userId),
  };

  const membersQuery = useQuery({
    queryKey: keys.members,
    queryFn: () => api.getTeamMembers(activeTeamId as string),
    enabled: signedIn && Boolean(activeTeamId),
    staleTime: 60 * 1000,
  });
  const invitesQuery = useQuery({
    queryKey: keys.invites,
    queryFn: () => api.getTeamInvites(activeTeamId as string),
    enabled: signedIn && Boolean(activeTeamId && canManageTeam),
    staleTime: 30 * 1000,
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

  // refetch() joins a first load still in flight, which predates the change; cancel it first.
  const reloadWith = (query: { refetch: () => Promise<unknown> }, queryKey: QueryKey) => async () => {
    await queryClient.cancelQueries({ queryKey });
    await query.refetch();
  };

  return {
    membersQuery,
    invitesQuery,
    activityQuery,
    incomingInvitesQuery,
    reload: {
      members: reloadWith(membersQuery, keys.members),
      invites: reloadWith(invitesQuery, keys.invites),
      activity: reloadWith(activityQuery, keys.activity),
      incomingInvites: reloadWith(incomingInvitesQuery, keys.incomingInvites),
    },
  };
}
