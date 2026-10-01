import { HISTORY_DISPLAY_LIMIT } from "@/lib/history";
import { apiRequest } from "@/lib/api/request";
import type { TemplateHistoryEvent } from "@/lib/api/templates";

export type ChecklistRunHistoryResponse = {
  checklistId: string;
  subject: { type: 'user' | 'team'; id: string };
  events: TemplateHistoryEvent[];
};

const isPositiveWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

export const runsApi = {
  async getChecklists(params?: { teamId?: string }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return apiRequest(`/checklists${query ? `?${query}` : ''}`);
  },

  async getArchivedChecklists(params?: { teamId?: string }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return apiRequest(`/checklists/archived${query ? `?${query}` : ''}`);
  },

  async getChecklistById(id: string) {
    return apiRequest(`/checklists/${encodeURIComponent(id)}`);
  },

  async getChecklistHistory(id: string, params?: { limit?: number }): Promise<ChecklistRunHistoryResponse> {
    const limit = params?.limit;
    const count = isPositiveWholeNumber(limit) ? limit : HISTORY_DISPLAY_LIMIT;
    return apiRequest(`/checklists/${encodeURIComponent(id)}/history?limit=${count}`);
  },

  async createChecklist(checklist: {
    teamId?: string | undefined;
    template_id?: string;
    title: string;
    items?: unknown[];
    sections?: unknown[];
    status?: string;
  }): Promise<{ id: string }> {
    return apiRequest('/checklists', {
      method: 'POST',
      body: JSON.stringify(checklist),
    });
  },

  async createChecklistRunShare(runId: string): Promise<{ shareToken: string }> {
    return apiRequest(`/checklists/run/${encodeURIComponent(runId)}/share`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async revokeChecklistRunShare(runId: string): Promise<{ id: string; isPublic: false }> {
    return apiRequest(`/checklists/run/${encodeURIComponent(runId)}/share`, {
      method: 'DELETE',
    });
  },

  async getSharedChecklist(shareToken: string) {
    return apiRequest(`/checklists/shared/${encodeURIComponent(shareToken)}`);
  },

  async updateSharedChecklist(
    shareToken: string,
    updates: {
      template_id?: string;
      title?: string;
      items?: unknown[];
      sections?: unknown[];
      status?: string;
      progress?: number;
      completed_at?: string | undefined;
      expected_revision?: number | undefined;
    }
  ) {
    return apiRequest(`/checklists/shared/${encodeURIComponent(shareToken)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async updateChecklist(id: string, updates: {
    template_id?: string;
    title?: string;
    items?: unknown[];
    sections?: unknown[];
    status?: string;
    progress?: number;
    completed_at?: string | undefined;
    expected_revision?: number | undefined;
  }): Promise<{ revision?: number }> {
    return apiRequest(`/checklists/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async revalidateChecklist(id: string, expectedRevision?: number) {
    return apiRequest(`/checklists/${encodeURIComponent(id)}/revalidate`, {
      method: 'POST',
      body: JSON.stringify(expectedRevision ? { expected_revision: expectedRevision } : {}),
    });
  },

  async deleteChecklist(id: string) {
    return apiRequest(`/checklists/${id}`, {
      method: 'DELETE',
    });
  },

  async restoreChecklist(id: string): Promise<{ success: true }> {
    return apiRequest(`/checklists/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
