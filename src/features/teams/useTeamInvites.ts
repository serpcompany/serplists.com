import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { useAuth } from '@/contexts/CloudflareAuthContext';

import { createSingleFlight } from '@/features/teams/singleFlight';
import {
  createInviteLink,
  isInviteGoneError,
  reissueInviteLink,
  visibleInviteLink,
  withoutRevokedLink,
  type AssignableTeamRole,
  type InviteLink,
  type PendingInviteConflict,
} from '@/features/teams/teamInviteLinks';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

const inviteApi = {
  createInvite: (teamId: string, payload: { email: string; role: AssignableTeamRole }) =>
    api.createTeamInvite(teamId, payload),
  reissueInvite: (teamId: string, inviteId: string, payload: { role?: AssignableTeamRole }) =>
    api.reissueTeamInviteLink(teamId, inviteId, payload),
};

/**
 * Pending invites for the active Organization and the actions a manager takes
 * on them. Actions throw on failure so the screen can report it; create and
 * new-link requests run one at a time, so a double click cannot replace a
 * link twice and leave a dead one on screen.
 */
export function useTeamInvites(activeTeamId: string | null | undefined, canManageTeam: boolean) {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id;
  const [link, setLink] = useState<InviteLink | null>(null);
  const [conflict, setConflict] = useState<PendingInviteConflict | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [reissuingInviteId, setReissuingInviteId] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [linkOnce] = useState(createSingleFlight);

  const invitesQuery = useQuery({
    queryKey: queryKeys.teamInvites(userId, activeTeamId ?? undefined),
    queryFn: () => api.getTeamInvites(activeTeamId as string),
    enabled: Boolean(userId && activeTeamId && canManageTeam),
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    setLink(null);
    setConflict(null);
  }, [activeTeamId]);

  // refetch joins a first load still in flight, which predates the change; cancel it first.
  // Only active queries: an unobserved key keeps the previous user's queryFn.
  const reload = async (queryKey: QueryKey) => {
    await queryClient.cancelQueries({ queryKey });
    await queryClient.refetchQueries({ queryKey, type: 'active' });
  };
  const reloadInvitesAndActivity = async (teamId: string) => {
    await reload(queryKeys.teamInvites(userId, teamId));
    await reload(queryKeys.teamActivity(userId, teamId));
  };

  const createInvite = (teamId: string, email: string, role: AssignableTeamRole) =>
    linkOnce(async () => {
      setIsCreating(true);
      try {
        const result = await createInviteLink(inviteApi, teamId, { email, role });
        if (result.kind === 'created') {
          setLink(result.link);
          setConflict(null);
          await reloadInvitesAndActivity(teamId);
        } else {
          setConflict(result.conflict);
        }
        return result;
      } finally {
        setIsCreating(false);
      }
    });

  const reissueLink = (teamId: string, inviteId: string, role?: AssignableTeamRole) =>
    linkOnce(async () => {
      setReissuingInviteId(inviteId);
      try {
        const nextLink = await reissueInviteLink(inviteApi, teamId, inviteId, role);
        setLink(nextLink);
        setConflict(null);
        await reloadInvitesAndActivity(teamId);
        return nextLink;
      } finally {
        setReissuingInviteId(null);
      }
    });

  // Hide the revoked invite's link (and any offer to replace it) before the
  // reloads, so a failed reload cannot leave a dead link on screen.
  const forgetInvite = (inviteId: string) => {
    setLink((current) => withoutRevokedLink(current, inviteId));
    setConflict((current) => (current?.inviteId === inviteId ? null : current));
  };

  const revokeInvite = async (teamId: string, inviteId: string) => {
    setRevokingInviteId(inviteId);
    try {
      try {
        await api.revokeTeamInvite(teamId, inviteId);
      } catch (error) {
        if (isInviteGoneError(error)) {
          forgetInvite(inviteId);
          void reloadInvitesAndActivity(teamId);
        }
        throw error;
      }
      forgetInvite(inviteId);
      await reloadInvitesAndActivity(teamId);
    } finally {
      setRevokingInviteId(null);
    }
  };

  const invites = invitesQuery.data ?? [];
  const pendingSnapshot = {
    inviteIds: invites.map((invite) => invite.id),
    updatedAt: invitesQuery.dataUpdatedAt,
    isSettled: invitesQuery.isSuccess && !invitesQuery.isFetching,
  };

  return {
    invites,
    isLoadingInvites: invitesQuery.isLoading,
    link: visibleInviteLink(link, activeTeamId, pendingSnapshot),
    conflict: conflict && conflict.teamId === activeTeamId ? conflict : null,
    dismissConflict: () => setConflict(null),
    isCreating,
    reissuingInviteId,
    revokingInviteId,
    createInvite,
    reissueLink,
    revokeInvite,
  };
}
