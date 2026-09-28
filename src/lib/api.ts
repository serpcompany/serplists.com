import { env } from "@/env";
import { createApiError } from "@/lib/api-errors";
import type { TemplateImportSummary } from "@/types/checklist";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

const DEV_API_BASE_URL = env.VITE_API_URL ?? 'http://localhost:8788/api';
const API_BASE_URL = import.meta.env.DEV
  ? DEV_API_BASE_URL
  : env.VITE_API_URL ?? '/api';

export const getAgentMcpEndpoint = (origin?: string): string => {
  const endpoint = `${API_BASE_URL}/mcp`;
  if (/^https?:\/\//i.test(endpoint) || !origin) return endpoint;
  return new URL(endpoint, origin).toString();
};

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

export type TeamInviteDelivery =
  | {
      mode: 'link';
      status: 'ready';
      invitePath: string;
      inviteUrl: string;
    }
  | {
      mode: 'email';
      status: 'queued' | 'sent';
      invitePath: string;
      inviteUrl: string;
    };

export type CreatedTeamInvite = {
  id: string;
  email: string;
  role: Exclude<TeamRole, 'owner'>;
  expiresAt: string;
  inviteToken: string;
  invitePath: string;
  inviteUrl?: string;
  delivery?: TeamInviteDelivery;
};

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

export type TemplateHistoryActor = {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  username?: string | null;
};

export type TemplateHistoryVersion = {
  id: string;
  version: number;
  action: string;
  contentHash?: string | null;
  createdAt: string;
  actor: TemplateHistoryActor;
};

export type TemplateHistoryEvent = {
  id: string;
  action: string;
  createdAt: string;
  requestId?: string | null;
  diff?: unknown;
  metadata?: unknown;
  actor: TemplateHistoryActor;
};

export type TemplateHistoryResponse = {
  templateId: string;
  subject: { type: 'user' | 'team'; id: string };
  versions: TemplateHistoryVersion[];
  events: TemplateHistoryEvent[];
};

export type ChecklistRunHistoryResponse = {
  checklistId: string;
  subject: { type: 'user' | 'team'; id: string };
  events: TemplateHistoryEvent[];
};

export type AgentKeyStatus = 'active' | 'revoked';

export type AgentKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: AgentKeyStatus;
};

export type CreatedAgentKey = {
  key: AgentKey;
  secret: string;
};

class ApiClient {
  private async request(endpoint: string, options: RequestInit = {}) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => undefined);
      throw createApiError(response.status, error);
    }

    return response.json();
  }

  private async requestFormData(endpoint: string, formData: FormData) {
    const headers: HeadersInit = {};

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => undefined);
      throw createApiError(response.status, error);
    }

    return response.json();
  }

  // Templates
  async getTemplates(params?: { teamId?: string; scope?: 'public' | 'personal' }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    if (params?.scope) search.set('scope', params.scope);
    const query = search.toString();
    return this.request(`/templates${query ? `?${query}` : ''}`);
  }

  async getArchivedTemplates(params?: { teamId?: string }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return this.request(`/templates/archived${query ? `?${query}` : ''}`);
  }

  async getTemplateById(id: string) {
    return this.request(`/templates/${encodeURIComponent(id)}`);
  }

  async generateTemplateFromClipy(url: string): Promise<{ draft: TemplateEditorFormValues }> {
    return this.request('/templates/generate-from-clipy', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async getTemplateHistory(id: string): Promise<TemplateHistoryResponse> {
    return this.request(`/templates/${encodeURIComponent(id)}/history`);
  }

  async getTemplateBySlug(slug: string) {
    return this.request(`/templates/slug/${encodeURIComponent(slug)}`);
  }

  async getPublicTemplatesForUser(userId: string) {
    return this.request(`/templates/public?userId=${encodeURIComponent(userId)}`);
  }

  async createTemplate(template: {
    title: string;
    teamId?: string;
    description?: string;
    type?: "checklist" | "recipe";
    seoTitle?: string;
    seoDescription?: string;
    rules?: unknown[];
    slug?: string;
    sections?: unknown[];
    items?: unknown[];
    is_public?: boolean;
    categories?: string[];
    tags?: string[];
  }) {
    return this.request('/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    });
  }

  async updateTemplate(id: string, updates: {
    title?: string;
    description?: string;
    type?: "checklist" | "recipe";
    seoTitle?: string;
    seoDescription?: string;
    rules?: unknown[];
    sections?: unknown[];
    categories?: string[];
    tags?: string[];
    is_public?: boolean;
    slug?: string;
    expected_version?: number;
  }) {
    return this.request(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteTemplate(id: string) {
    return this.request(`/templates/${id}`, {
      method: 'DELETE',
    });
  }

  async restoreTemplate(id: string): Promise<{ success: true }> {
    return this.request(`/templates/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async exportTemplateBackup(params?: { includePublic?: boolean; format?: 'backup' | 'portable'; teamId?: string | null }) {
    const search = new URLSearchParams();
    if (params?.includePublic) search.set('includePublic', '1');
    if (params?.teamId) search.set('teamId', params.teamId);
    search.set('format', params?.format ?? 'portable');
    const query = search.toString();
    return this.request(`/templates/backup${query ? `?${query}` : ''}`);
  }

  async importTemplateBackup(payload: {
    teamId?: string | null;
    templates: unknown[];
    options?: { visibility?: 'preserve' | 'public' | 'private' };
  }): Promise<TemplateImportSummary> {
    const search = new URLSearchParams();
    if (payload.teamId) search.set('teamId', payload.teamId);
    const query = search.toString();
    const { teamId: _teamId, ...body } = payload;
    return this.request(`/templates/backup${query ? `?${query}` : ''}`, { method: 'POST', body: JSON.stringify(body) });
  }

  async clonePublicTemplate(templateId: string, payload?: { visibility?: 'public' | 'private' | 'preserve'; teamId?: string }): Promise<{ id: string; slug?: string }> {
    return this.request(`/templates/${encodeURIComponent(templateId)}/clone`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
  }

  // Checklists
  async getChecklists(params?: { teamId?: string }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return this.request(`/checklists${query ? `?${query}` : ''}`);
  }

  async getArchivedChecklists(params?: { teamId?: string }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return this.request(`/checklists/archived${query ? `?${query}` : ''}`);
  }

  async getChecklistById(id: string) {
    return this.request(`/checklists/${encodeURIComponent(id)}`);
  }

  async getChecklistHistory(id: string): Promise<ChecklistRunHistoryResponse> {
    return this.request(`/checklists/${encodeURIComponent(id)}/history`);
  }

  async createChecklist(checklist: {
    teamId?: string;
    template_id?: string;
    title: string;
    items?: unknown[];
    sections?: unknown[];
    status?: string;
  }) {
    return this.request('/checklists', {
      method: 'POST',
      body: JSON.stringify(checklist),
    });
  }

  async createChecklistRunShare(runId: string) {
    return this.request(`/checklists/run/${encodeURIComponent(runId)}/share`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /** Stops sharing a run: its share link stops working and the run becomes private. */
  async revokeChecklistRunShare(runId: string): Promise<{ id: string; isPublic: false }> {
    return this.request(`/checklists/run/${encodeURIComponent(runId)}/share`, {
      method: 'DELETE',
    });
  }

  async getSharedChecklist(shareToken: string) {
    return this.request(`/checklists/shared/${encodeURIComponent(shareToken)}`);
  }

  async updateSharedChecklist(
    shareToken: string,
    updates: {
      template_id?: string;
      title?: string;
      items?: unknown[];
      sections?: unknown[];
      status?: string;
      progress?: number;
      completed_at?: string;
      expected_revision?: number;
    }
  ) {
    return this.request(`/checklists/shared/${encodeURIComponent(shareToken)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async updateChecklist(id: string, updates: {
    template_id?: string;
    title?: string;
    items?: unknown[];
    sections?: unknown[];
    status?: string;
    progress?: number;
    completed_at?: string;
    expected_revision?: number;
  }) {
    return this.request(`/checklists/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async revalidateChecklist(id: string, expectedRevision?: number) {
    return this.request(`/checklists/${encodeURIComponent(id)}/revalidate`, {
      method: 'POST',
      body: JSON.stringify(expectedRevision ? { expected_revision: expectedRevision } : {}),
    });
  }

  async deleteChecklist(id: string) {
    return this.request(`/checklists/${id}`, {
      method: 'DELETE',
    });
  }

  async restoreChecklist(id: string): Promise<{ success: true }> {
    return this.request(`/checklists/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // Personal agent access
  async getAgentKeys(): Promise<AgentKey[]> {
    return this.request('/agent-keys');
  }

  async createAgentKey(name: string): Promise<CreatedAgentKey> {
    return this.request('/agent-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async revokeAgentKey(id: string): Promise<{ id: string; revokedAt: string }> {
    return this.request(`/agent-keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // Teams
  async getTeams(): Promise<TeamSummary[]> {
    return this.request('/teams');
  }

  async createTeam(payload: { name: string; slug?: string }): Promise<TeamSummary> {
    return this.request('/teams', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getTeam(teamId: string): Promise<TeamDetail> {
    return this.request(`/teams/${encodeURIComponent(teamId)}`);
  }

  async updateTeam(teamId: string, payload: { name?: string; slug?: string }): Promise<{ success: true; team: TeamDetail }> {
    return this.request(`/teams/${encodeURIComponent(teamId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    return this.request(`/teams/${encodeURIComponent(teamId)}/members`);
  }

  async getTeamInvites(teamId: string): Promise<TeamInvite[]> {
    return this.request(`/teams/${encodeURIComponent(teamId)}/invites`);
  }

  async getTeamActivity(teamId: string): Promise<TeamActivityEvent[]> {
    return this.request(`/teams/${encodeURIComponent(teamId)}/activity`);
  }

  async getIncomingTeamInvites(): Promise<IncomingTeamInvite[]> {
    return this.request('/teams/invites/pending');
  }

  async createTeamInvite(
    teamId: string,
    payload: { email: string; role?: Exclude<TeamRole, 'owner'> },
  ): Promise<CreatedTeamInvite> {
    return this.request(`/teams/${encodeURIComponent(teamId)}/invites`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async acceptTeamInvite(inviteToken: string): Promise<AcceptedTeamInvite> {
    return this.request(`/teams/invites/${encodeURIComponent(inviteToken)}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async acceptIncomingTeamInvite(inviteId: string): Promise<AcceptedTeamInvite> {
    return this.request(`/teams/invites/pending/${encodeURIComponent(inviteId)}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async revokeTeamInvite(teamId: string, inviteId: string): Promise<{ success: true }> {
    return this.request(`/teams/${encodeURIComponent(teamId)}/invites/${encodeURIComponent(inviteId)}`, {
      method: 'DELETE',
    });
  }

  async updateTeamMember(
    teamId: string,
    memberId: string,
    updates: { role?: Exclude<TeamRole, 'owner'>; status?: TeamMemberStatus },
  ): Promise<{ success: true }> {
    return this.request(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async transferTeamOwnership(
    teamId: string,
    memberId: string,
  ): Promise<{ success: true; ownerMemberId: string; ownerUserId: string }> {
    return this.request(`/teams/${encodeURIComponent(teamId)}/owner`, {
      method: 'PUT',
      body: JSON.stringify({ memberId }),
    });
  }

  // Public profiles
  async getProfileByUsername(username: string) {
    return this.request(`/profiles/by-username?username=${encodeURIComponent(username)}`);
  }

  async getProfileById(userId: string) {
    return this.request(`/profiles/by-id?userId=${encodeURIComponent(userId)}`);
  }

  // Uploads (R2-backed)
  async uploadToR2(params: { bucket: 'avatars' | 'template-images' | 'template-videos' | 'template-files'; file: File }) {
    const formData = new FormData();
    formData.set('bucket', params.bucket);
    formData.set('file', params.file);
    return this.requestFormData('/uploads', formData);
  }

  async deleteFromR2(key: string) {
    return this.request(`/uploads/file?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  }

  // Billing (Stripe)
  async getBillingStatus(params?: { teamId?: string }): Promise<{
    plan: 'free' | 'pro' | 'team';
    limits?: { maxTemplates: number | null; maxActiveRuns: number | null };
    billingEnabled?: boolean;
  }> {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return this.request(`/billing/status${query ? `?${query}` : ''}`);
  }

  async createBillingCheckout(): Promise<{ url: string }> {
    return this.request('/billing/checkout', { method: 'POST', body: JSON.stringify({}) });
  }

  async createBillingPortal(): Promise<{ url: string }> {
    return this.request('/billing/portal', { method: 'POST', body: JSON.stringify({}) });
  }
}

export const api = new ApiClient();
