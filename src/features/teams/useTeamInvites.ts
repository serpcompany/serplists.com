import { useState } from 'react';
import { skipToken, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { useAuth } from '@/contexts/CloudflareAuthContext';

import { reloadObservedQueries } from '@/features/teams/reloadObservedQueries';
import {
  createInviteLink,
  isInviteAlreadyAcceptedError,
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
import { createSingleFlight } from '@/lib/utils/singleFlight';

const inviteApi = {
  createInvite: (teamId: string, payload: { email: string; role: AssignableTeamRole }) =>
    api.createTeamInvite(teamId, payload),
  reissueInvite: (teamId: string, inviteId: string, payload: { role?: AssignableTeamRole }) =>
    api.reissueTeamInviteLink(teamId, inviteId, payload),
};

export function useTeamInvites(activeTeamId: string | null | undefined, canManageTeam: boolean) {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id;
  const [link, setLink] = useState<InviteLink | null>(null);
  const [conflict, setConflict] = useState<PendingInviteConflict | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [reissuingInviteId, setReissuingInviteId] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [linkFlight] = useState(() => createSingleFlight());

  const invitesQuery = useQuery({
    queryKey: queryKeys.teamInvites(userId, activeTeamId ?? undefined),
    queryFn: activeTeamId ? () => api.getTeamInvites(activeTeamId) : skipToken,
    enabled: Boolean(userId && activeTeamId && canManageTeam),
    staleTime: 30 * 1000,
  });

  const [shownTeamId, setShownTeamId] = useState(activeTeamId);
  if (shownTeamId !== activeTeamId) {
    setShownTeamId(activeTeamId);
    setLink(null);
    setConflict(null);
  }

  const reload = (queryKey: QueryKey) => reloadObservedQueries(queryClient, queryKey);
  const reloadInvitesAndActivity = async (teamId: string) => {
    await reload(queryKeys.teamInvites(userId, teamId));
    await reload(queryKeys.teamActivity(userId, teamId));
  };
  const reloadAfterInviteeJoined = async (teamId: string) => {
    await reloadInvitesAndActivity(teamId);
    await reload(queryKeys.teamMembers(userId, teamId));
  };

  const createInvite = (teamId: string, email: string, role: AssignableTeamRole) =>
    linkFlight.run(async () => {
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
    linkFlight.run(async () => {
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
        if (isInviteAlreadyAcceptedError(error)) {
          forgetInvite(inviteId);
          void reloadAfterInviteeJoined(teamId);
        } else if (isInviteGoneError(error)) {
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
    invitesQuery,
    reloadInvites: () => reload(queryKeys.teamInvites(userId, activeTeamId ?? undefined)),
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
