import { z } from "zod";

import {
  createdTeamInviteSchema,
  teamInvitePreviewSchema,
  type CreatedTeamInvite,
} from "@/lib/schemas/teamInvite";
import { successResponseSchema } from "@/lib/schemas/apiResponses";
import { teamActivityEventSchema } from "@/lib/schemas/historyResponses";
import {
  acceptedTeamInviteSchema,
  incomingTeamInviteSchema,
  teamDetailSchema,
  teamInviteSchema,
  teamMemberSchema,
  teamSummarySchema,
  transferredTeamOwnershipSchema,
  updatedTeamSchema,
  type TeamRole,
  type TeamMemberStatus,
} from "@/lib/schemas/teamResponses";
import { apiRequest } from "@/lib/api/request";

export type { TeamActivityEvent } from "@/lib/schemas/historyResponses";
export type {
  AcceptedTeamInvite,
  IncomingTeamInvite,
  TeamMember,
  TeamMemberStatus,
  TeamRole,
  TeamSummary,
} from "@/lib/schemas/teamResponses";
export type { CreatedTeamInvite };

const ORGANIZATION_SETTINGS_ACTIVITY_SHOWN = 10;

export const teamsApi = {
  async getTeams() {
    return apiRequest('/teams', z.array(teamSummarySchema));
  },

  async createTeam(payload: { name: string; slug?: string | undefined }) {
    return apiRequest('/teams', teamSummarySchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getTeam(teamId: string) {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}`, teamDetailSchema);
  },

  async updateTeam(
    teamId: string,
    payload: { name?: string; slug?: string; description?: string | null; avatar_url?: string | null },
  ) {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}`, updatedTeamSchema, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async getTeamMembers(teamId: string) {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/members`, z.array(teamMemberSchema));
  },

  async getTeamInvites(teamId: string) {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/invites`, z.array(teamInviteSchema));
  },

  async getTeamActivity(teamId: string, limit = ORGANIZATION_SETTINGS_ACTIVITY_SHOWN) {
    const search = new URLSearchParams({ limit: String(limit) });
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/activity?${search.toString()}`, z.array(teamActivityEventSchema));
  },

  async getIncomingTeamInvites() {
    return apiRequest('/teams/invites/pending', z.array(incomingTeamInviteSchema));
  },

  async createTeamInvite(
    teamId: string,
    payload: { email: string; role?: Exclude<TeamRole, 'owner'> },
  ): Promise<CreatedTeamInvite> {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/invites`, createdTeamInviteSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async reissueTeamInviteLink(
    teamId: string,
    inviteId: string,
    payload: { role?: Exclude<TeamRole, 'owner'> } = {},
  ): Promise<CreatedTeamInvite> {
    return apiRequest(
      `/teams/${encodeURIComponent(teamId)}/invites/${encodeURIComponent(inviteId)}/link`,
      createdTeamInviteSchema,
      { method: 'POST', body: JSON.stringify(payload) },
    );
  },

  async acceptTeamInvite(inviteToken: string) {
    return apiRequest(`/teams/invites/${encodeURIComponent(inviteToken)}/accept`, acceptedTeamInviteSchema, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async getTeamInvitePreview(inviteToken: string) {
    return apiRequest(`/teams/invites/${encodeURIComponent(inviteToken)}`, teamInvitePreviewSchema);
  },

  async declineTeamInvite(inviteToken: string) {
    return apiRequest(`/teams/invites/${encodeURIComponent(inviteToken)}/decline`, successResponseSchema, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async leaveTeam(teamId: string) {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/leave`, successResponseSchema, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async acceptIncomingTeamInvite(inviteId: string) {
    return apiRequest(`/teams/invites/pending/${encodeURIComponent(inviteId)}/accept`, acceptedTeamInviteSchema, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async revokeTeamInvite(teamId: string, inviteId: string) {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/invites/${encodeURIComponent(inviteId)}`, successResponseSchema, {
      method: 'DELETE',
    });
  },

  async updateTeamMember(
    teamId: string,
    memberId: string,
    updates: { role?: Exclude<TeamRole, 'owner'>; status?: TeamMemberStatus },
  ) {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`, successResponseSchema, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async transferTeamOwnership(
    teamId: string,
    memberId: string,
  ) {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/owner`, transferredTeamOwnershipSchema, {
      method: 'PUT',
      body: JSON.stringify({ memberId }),
    });
  },
};
