import { HISTORY_DISPLAY_LIMIT } from "@/lib/history";
import { apiRequest } from "@/lib/api/request";
import { successResponseSchema } from "@/lib/schemas/apiResponses";
import {
  apiRunListSchema,
  apiRunSchema,
  createdRunSchema,
  runRevalidatedSchema,
  runSavedSchema,
  runShareCreatedSchema,
  runShareRevokedSchema,
  sharedRunSavedSchema,
} from "@/lib/schemas/apiRuns";
import { runHistorySchema, type RunHistoryResponse } from "@/lib/schemas/historyResponses";

export type ChecklistRunHistoryResponse = RunHistoryResponse;

type RunSaveBody = {
  template_id?: string;
  title?: string;
  items?: unknown[];
  sections?: unknown[];
  status?: string;
  progress?: number;
  completed_at?: string | undefined;
  expected_revision?: number | undefined;
};

const isPositiveWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

export const runsApi = {
  async getChecklists(params?: { teamId?: string }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return apiRequest(`/checklists${query ? `?${query}` : ''}`, apiRunListSchema);
  },

  async getArchivedChecklists(params?: { teamId?: string }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return apiRequest(`/checklists/archived${query ? `?${query}` : ''}`, apiRunListSchema);
  },

  async getChecklistById(id: string) {
    return apiRequest(`/checklists/${encodeURIComponent(id)}`, apiRunSchema);
  },

  async getChecklistHistory(id: string, params?: { limit?: number }): Promise<ChecklistRunHistoryResponse> {
    const limit = params?.limit;
    const count = isPositiveWholeNumber(limit) ? limit : HISTORY_DISPLAY_LIMIT;
    return apiRequest(`/checklists/${encodeURIComponent(id)}/history?limit=${count}`, runHistorySchema);
  },

  async createChecklist(checklist: {
    teamId?: string | undefined;
    template_id?: string;
    title: string;
    items?: unknown[];
    sections?: unknown[];
    status?: string;
  }) {
    return apiRequest('/checklists', createdRunSchema, {
      method: 'POST',
      body: JSON.stringify(checklist),
    });
  },

  async createChecklistRunShare(runId: string) {
    return apiRequest(`/checklists/run/${encodeURIComponent(runId)}/share`, runShareCreatedSchema, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async revokeChecklistRunShare(runId: string) {
    return apiRequest(`/checklists/run/${encodeURIComponent(runId)}/share`, runShareRevokedSchema, {
      method: 'DELETE',
    });
  },

  async getSharedChecklist(shareToken: string) {
    return apiRequest(`/checklists/shared/${encodeURIComponent(shareToken)}`, apiRunSchema);
  },

  async updateSharedChecklist(shareToken: string, updates: RunSaveBody) {
    return apiRequest(`/checklists/shared/${encodeURIComponent(shareToken)}`, sharedRunSavedSchema, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async updateChecklist(id: string, updates: RunSaveBody) {
    return apiRequest(`/checklists/${id}`, runSavedSchema, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async revalidateChecklist(id: string, expectedRevision?: number) {
    return apiRequest(`/checklists/${encodeURIComponent(id)}/revalidate`, runRevalidatedSchema, {
      method: 'POST',
      body: JSON.stringify(expectedRevision ? { expected_revision: expectedRevision } : {}),
    });
  },

  async deleteChecklist(id: string) {
    return apiRequest(`/checklists/${id}`, successResponseSchema, {
      method: 'DELETE',
    });
  },

  async restoreChecklist(id: string) {
    return apiRequest(`/checklists/${encodeURIComponent(id)}/restore`, successResponseSchema, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
