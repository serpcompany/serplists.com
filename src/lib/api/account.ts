import type { BillingStatus } from "@/lib/billing";
import { agentMcpConnectionSchema, type AgentMcpConnection } from "@/lib/schemas/agentMcpConnection";
import type { RunKeyPermission } from "@/lib/schemas/runKeyPermissions";
import { apiFormDataRequest, apiRequest } from "@/lib/api/request";

export type AgentKeyStatus = 'active' | 'revoked';

export type AgentKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  permissions: RunKeyPermission[];
  status: AgentKeyStatus;
};

export type CreatedAgentKey = {
  key: AgentKey;
  secret: string;
};

export const accountApi = {
  async getAgentKeys(): Promise<AgentKey[]> {
    return apiRequest('/agent-keys');
  },

  async getAgentMcpConnection(): Promise<AgentMcpConnection> {
    return agentMcpConnectionSchema.parse(await apiRequest('/agent-keys/connection'));
  },

  async createAgentKey(name: string, permissions: RunKeyPermission[]): Promise<CreatedAgentKey> {
    return apiRequest('/agent-keys', {
      method: 'POST',
      body: JSON.stringify({ name, permissions }),
    });
  },

  async revokeAgentKey(id: string): Promise<{ id: string; revokedAt: string }> {
    return apiRequest(`/agent-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async getProfileByUsername(username: string) {
    return apiRequest(`/profiles/by-username?username=${encodeURIComponent(username)}`);
  },

  async getProfileById(userId: string) {
    return apiRequest(`/profiles/by-id?userId=${encodeURIComponent(userId)}`);
  },

  async uploadToR2(params: { bucket: 'avatars' | 'template-images' | 'template-videos' | 'template-files'; file: File }): Promise<{ url: string; fileName?: string; fileSize?: number }> {
    const formData = new FormData();
    formData.set('bucket', params.bucket);
    formData.set('file', params.file);
    return apiFormDataRequest('/uploads', formData);
  },

  async deleteFromR2(key: string) {
    return apiRequest(`/uploads/file?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  },

  async getBillingStatus(params?: { teamId?: string }): Promise<BillingStatus> {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return apiRequest(`/billing/status${query ? `?${query}` : ''}`);
  },

  async createBillingCheckout(): Promise<{ url: string }> {
    return apiRequest('/billing/checkout', { method: 'POST', body: JSON.stringify({}) });
  },

  async createBillingPortal(): Promise<{ url: string }> {
    return apiRequest('/billing/portal', { method: 'POST', body: JSON.stringify({}) });
  },
};
