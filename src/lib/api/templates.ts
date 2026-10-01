import { z } from "zod";

import { isUnreadableResponseError } from "@/lib/api-errors";
import {
  TEMPLATE_UPDATE_RESPONSE_ERROR,
  templateUpdateResultSchema,
  type TemplateUpdateResult,
} from "@/lib/templateUpdateResult";
import { HISTORY_DISPLAY_LIMIT } from "@/lib/history";
import type { TemplateImportSummary } from "@/types/checklist";
import { templateEditorFormSchema } from "@/lib/forms/templateEditorForm";
import { templateImportSummarySchema } from "@/lib/templates/templateImportSummary";
import { successResponseSchema } from "@/lib/schemas/apiResponses";
import {
  apiTemplateListSchema,
  apiTemplateSchema,
  exportedTemplatePackSchema,
  savedTemplateSchema,
  type SavedTemplate,
} from "@/lib/schemas/apiTemplates";
import { templateHistorySchema, type TemplateHistoryResponse } from "@/lib/schemas/historyResponses";
import { apiRequest } from "@/lib/api/request";

export type {
  HistoryActor as TemplateHistoryActor,
  HistoryEvent as TemplateHistoryEvent,
  TemplateHistoryResponse,
  TemplateHistoryVersion,
} from "@/lib/schemas/historyResponses";

const clipyDraftSchema = z.object({ draft: templateEditorFormSchema });

export const templatesApi = {
  async getTemplates(params?: { teamId?: string; scope?: 'public' | 'personal' }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    if (params?.scope) search.set('scope', params.scope);
    const query = search.toString();
    return apiRequest(`/templates${query ? `?${query}` : ''}`, apiTemplateListSchema);
  },

  async getArchivedTemplates(params?: { teamId?: string }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return apiRequest(`/templates/archived${query ? `?${query}` : ''}`, apiTemplateListSchema);
  },

  async getTemplateById(id: string) {
    return apiRequest(`/templates/${encodeURIComponent(id)}`, apiTemplateSchema);
  },

  async generateTemplateFromClipy(url: string) {
    return apiRequest('/templates/generate-from-clipy', clipyDraftSchema, {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },

  async getTemplateHistory(id: string): Promise<TemplateHistoryResponse> {
    return apiRequest(`/templates/${encodeURIComponent(id)}/history?limit=${HISTORY_DISPLAY_LIMIT}`, templateHistorySchema);
  },

  async getTemplateBySlug(slug: string) {
    return apiRequest(`/templates/slug/${encodeURIComponent(slug)}`, apiTemplateSchema);
  },

  async getPublicTemplatesForUser(userId: string) {
    return apiRequest(`/templates/public?userId=${encodeURIComponent(userId)}`, apiTemplateListSchema);
  },

  async createTemplate(template: {
    title: string;
    teamId?: string | undefined;
    description?: string | undefined;
    type?: "checklist" | "recipe" | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
    rules?: unknown[] | undefined;
    slug?: string | undefined;
    sections?: unknown[];
    items?: unknown[];
    is_public?: boolean;
    categories?: string[];
    tags?: string[];
  }): Promise<SavedTemplate> {
    return apiRequest('/templates', savedTemplateSchema, {
      method: 'POST',
      body: JSON.stringify(template),
    });
  },

  async updateTemplate(id: string, updates: {
    title?: string;
    description?: string | undefined;
    type?: "checklist" | "recipe" | undefined;
    seoTitle?: string | undefined;
    seoDescription?: string | undefined;
    rules?: unknown[] | undefined;
    sections?: unknown[];
    categories?: string[] | undefined;
    tags?: string[] | undefined;
    is_public?: boolean | undefined;
    slug?: string | undefined;
    expected_version?: number | undefined;
  }): Promise<TemplateUpdateResult> {
    try {
      return await apiRequest(`/templates/${id}`, templateUpdateResultSchema, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    } catch (error) {
      throw isUnreadableResponseError(error) ? new Error(TEMPLATE_UPDATE_RESPONSE_ERROR, { cause: error }) : error;
    }
  },

  async deleteTemplate(id: string) {
    return apiRequest(`/templates/${id}`, successResponseSchema, {
      method: 'DELETE',
    });
  },

  async restoreTemplate(id: string) {
    return apiRequest(`/templates/${encodeURIComponent(id)}/restore`, successResponseSchema, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async exportTemplateBackup(params?: { format?: 'backup' | 'portable'; teamId?: string | null | undefined }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    search.set('format', params?.format ?? 'portable');
    const query = search.toString();
    return apiRequest(`/templates/backup${query ? `?${query}` : ''}`, exportedTemplatePackSchema);
  },

  async importTemplateBackup(payload: {
    teamId?: string | null | undefined;
    templates: unknown[];
    options?: { visibility?: 'preserve' | 'public' | 'private' };
  }): Promise<TemplateImportSummary> {
    const search = new URLSearchParams();
    if (payload.teamId) search.set('teamId', payload.teamId);
    const query = search.toString();
    const { teamId: _teamId, ...body } = payload;
    return apiRequest(`/templates/backup${query ? `?${query}` : ''}`, templateImportSummarySchema, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async clonePublicTemplate(templateId: string, payload?: { visibility?: 'public' | 'private' | 'preserve'; teamId?: string | undefined }): Promise<SavedTemplate> {
    return apiRequest(`/templates/${encodeURIComponent(templateId)}/clone`, savedTemplateSchema, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
  },
};
