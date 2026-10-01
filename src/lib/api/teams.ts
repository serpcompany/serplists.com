import {
  createdTeamInviteSchema,
  teamInvitePreviewSchema,
  type CreatedTeamInvite,
  type TeamInvitePreview,
  type TeamInviteDelivery,
} from "@/lib/schemas/teamInvite";
import { apiRequest } from "@/lib/api/request";

export type TeamRole = 'owner' | 'admin' | 'editor' | 'runner' | 'viewer';
export type TeamMemberStatus = 'active' | 'disabled';

export type TeamSummary = {
  id: string;
  name: string;
  slug?: string | null;
  role: TeamRole;
  membershipStatus: TeamMemberStatus;
  memberId: string;
};

export type TeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  status: TeamMemberStatus;
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
};

export type TeamInvite = {
  id: string;
  team_id: string;
  email: string;
  role: Exclude<TeamRole, 'owner'>;
  invited_by_user_id: string;
  expires_at: string;
  created_at: string;
  updated_at?: string | null;
  inviterEmail?: string | null;
  inviterName?: string | null;
};

export type { CreatedTeamInvite, TeamInviteDelivery };

export type AcceptedTeamInvite = {
  memberId: string;
  role: TeamRole;
  teamId: string;
  team?: TeamSummary;
};

export type IncomingTeamInvite = {
  id: string;
  teamId: string;
  teamName: string;
  teamSlug?: string | null;
  email: string;
  role: Exclude<TeamRole, 'owner'>;
  expiresAt: string;
  createdAt: string;
  inviterEmail?: string | null;
  inviterName?: string | null;
};

export type TeamActivityEvent = {
  id: string;
  action: string;
  resource: {
    type: string;
    id: string;
  };
  metadata?: unknown;
  requestId?: string | null;
  createdAt: string;
  actor: {
    userId?: string | null;
    email?: string | null;
    name?: string | null;
    username?: string | null;
  };
};

export type TeamDetail = {
  id: string;
  name: string;
  slug?: string | null;
  billing_owner_user_id?: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at?: string | null;
  archived_at?: string | null;
  membership: { id: string; role: TeamRole; status: TeamMemberStatus };
};

const ORGANIZATION_SETTINGS_ACTIVITY_SHOWN = 10;

export const teamsApi = {
  async getTeams(): Promise<TeamSummary[]> {
    return apiRequest('/teams');
  },

  async createTeam(payload: { name: string; slug?: string }): Promise<TeamSummary> {
    return apiRequest('/teams', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getTeam(teamId: string): Promise<TeamDetail> {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}`);
  },

  async updateTeam(teamId: string, payload: { name?: string; slug?: string }): Promise<{ success: true; team: TeamDetail }> {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/members`);
  },

  async getTeamInvites(teamId: string): Promise<TeamInvite[]> {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/invites`);
  },

  async getTeamActivity(teamId: string, limit = ORGANIZATION_SETTINGS_ACTIVITY_SHOWN): Promise<TeamActivityEvent[]> {
    const search = new URLSearchParams({ limit: String(limit) });
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/activity?${search.toString()}`);
  },

  async getIncomingTeamInvites(): Promise<IncomingTeamInvite[]> {
    return apiRequest('/teams/invites/pending');
  },

  async createTeamInvite(
    teamId: string,
    payload: { email: string; role?: Exclude<TeamRole, 'owner'> },
  ): Promise<CreatedTeamInvite> {
    const invite = await apiRequest(`/teams/${encodeURIComponent(teamId)}/invites`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return createdTeamInviteSchema.parse(invite);
  },

  async reissueTeamInviteLink(
    teamId: string,
    inviteId: string,
    payload: { role?: Exclude<TeamRole, 'owner'> } = {},
  ): Promise<CreatedTeamInvite> {
    const invite = await apiRequest(
      `/teams/${encodeURIComponent(teamId)}/invites/${encodeURIComponent(inviteId)}/link`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
    return createdTeamInviteSchema.parse(invite);
  },

  async acceptTeamInvite(inviteToken: string): Promise<AcceptedTeamInvite> {
    return apiRequest(`/teams/invites/${encodeURIComponent(inviteToken)}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async getTeamInvitePreview(inviteToken: string): Promise<TeamInvitePreview> {
    const preview = await apiRequest(`/teams/invites/${encodeURIComponent(inviteToken)}`);
    return teamInvitePreviewSchema.parse(preview);
  },

  async declineTeamInvite(inviteToken: string): Promise<{ success: true }> {
    return apiRequest(`/teams/invites/${encodeURIComponent(inviteToken)}/decline`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async leaveTeam(teamId: string): Promise<{ success: true }> {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/leave`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async acceptIncomingTeamInvite(inviteId: string): Promise<AcceptedTeamInvite> {
    return apiRequest(`/teams/invites/pending/${encodeURIComponent(inviteId)}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async revokeTeamInvite(teamId: string, inviteId: string): Promise<{ success: true }> {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/invites/${encodeURIComponent(inviteId)}`, {
      method: 'DELETE',
    });
  },

  async updateTeamMember(
    teamId: string,
    memberId: string,
    updates: { role?: Exclude<TeamRole, 'owner'>; status?: TeamMemberStatus },
  ): Promise<{ success: true }> {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async transferTeamOwnership(
    teamId: string,
    memberId: string,
  ): Promise<{ success: true; ownerMemberId: string; ownerUserId: string }> {
    return apiRequest(`/teams/${encodeURIComponent(teamId)}/owner`, {
      method: 'PUT',
      body: JSON.stringify({ memberId }),
    });
  },
};
