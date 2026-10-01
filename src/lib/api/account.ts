import { z } from "zod";

import { agentMcpConnectionSchema } from "@/lib/schemas/agentMcpConnection";
import type { RunKeyPermission } from "@/lib/schemas/runKeyPermissions";
import { successResponseSchema, urlResponseSchema } from "@/lib/schemas/apiResponses";
import {
  agentKeySchema,
  billingStatusSchema,
  createdAgentKeySchema,
  publicProfileSchema,
  revokedAgentKeySchema,
  uploadedFileSchema,
} from "@/lib/schemas/accountResponses";
import { apiFormDataRequest, apiRequest } from "@/lib/api/request";

export type { AgentKey, AgentKeyStatus, CreatedAgentKey } from "@/lib/schemas/accountResponses";

export const accountApi = {
  async getAgentKeys() {
    return apiRequest('/agent-keys', z.array(agentKeySchema));
  },

  async getAgentMcpConnection() {
    return apiRequest('/agent-keys/connection', agentMcpConnectionSchema);
  },

  async createAgentKey(name: string, permissions: RunKeyPermission[]) {
    return apiRequest('/agent-keys', createdAgentKeySchema, {
      method: 'POST',
      body: JSON.stringify({ name, permissions }),
    });
  },

  async revokeAgentKey(id: string) {
    return apiRequest(`/agent-keys/${encodeURIComponent(id)}`, revokedAgentKeySchema, { method: 'DELETE' });
  },

  async getProfileByUsername(username: string) {
    return apiRequest(`/profiles/by-username?username=${encodeURIComponent(username)}`, publicProfileSchema);
  },

  async getProfileById(userId: string) {
    return apiRequest(`/profiles/by-id?userId=${encodeURIComponent(userId)}`, publicProfileSchema);
  },

  async uploadToR2(params: { bucket: 'avatars' | 'template-images' | 'template-videos' | 'template-files'; file: File }) {
    const formData = new FormData();
    formData.set('bucket', params.bucket);
    formData.set('file', params.file);
    return apiFormDataRequest('/uploads', formData, uploadedFileSchema);
  },

  async deleteFromR2(key: string) {
    return apiRequest(`/uploads/file?key=${encodeURIComponent(key)}`, successResponseSchema, { method: 'DELETE' });
  },

  async getBillingStatus(params?: { teamId?: string }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return apiRequest(`/billing/status${query ? `?${query}` : ''}`, billingStatusSchema);
  },

  async createBillingCheckout() {
    return apiRequest('/billing/checkout', urlResponseSchema, { method: 'POST', body: JSON.stringify({}) });
  },

  async createBillingPortal() {
    return apiRequest('/billing/portal', urlResponseSchema, { method: 'POST', body: JSON.stringify({}) });
  },
};
