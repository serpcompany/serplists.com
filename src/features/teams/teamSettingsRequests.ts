import { api, type TeamMemberStatus } from '@/lib/api';
import type { AssignableTeamRole } from '@/features/teams/teamInviteLinks';
import type { TeamSettingsUpdate } from '@/features/teams/teamSettingsUpdate';

export const saveTeamSettings = (teamId: string, update: TeamSettingsUpdate) => api.updateTeam(teamId, update);

export const acceptIncomingTeamInvite = (inviteId: string) => api.acceptIncomingTeamInvite(inviteId);

export const updateTeamMember = (
  teamId: string,
  memberId: string,
  updates: { role?: AssignableTeamRole; status?: TeamMemberStatus },
) => api.updateTeamMember(teamId, memberId, updates);

export const transferTeamOwnership = (teamId: string, memberId: string) =>
  api.transferTeamOwnership(teamId, memberId);
