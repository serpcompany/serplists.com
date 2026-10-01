import { parseTemplateUpdateResponse, type TemplateUpdateResult } from "@/lib/templateUpdateResult";
import { HISTORY_DISPLAY_LIMIT } from "@/lib/history";
import type { TemplateImportSummary } from "@/types/checklist";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";
import { apiRequest } from "@/lib/api/request";

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
  metadata?: unknown; // the metadata of the audit event its write recorded, as on events
  actor: TemplateHistoryActor;
};

export type TemplateHistoryEvent = {
  id: string;
  action: string;
  createdAt: string;
  requestId?: string | null;
  metadata?: unknown;
  actor: TemplateHistoryActor;
};

// PUT /api/templates/:id. Only a checklist-structure change bumps content_version and
// reconciles active private runs; version advances for any stored change, visibility included.
export type TemplateUpdateResponse = {
  success: boolean;
  slug?: string;
  version?: number;
  content_version?: number;
  structureChanged?: boolean;
  reconciledRuns?: number;
};

export type TemplateHistoryResponse = {
  templateId: string;
  subject: { type: 'user' | 'team'; id: string };
  versions: TemplateHistoryVersion[];
  events: TemplateHistoryEvent[];
};

export const templatesApi = {
  async getTemplates(params?: { teamId?: string; scope?: 'public' | 'personal' }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    if (params?.scope) search.set('scope', params.scope);
    const query = search.toString();
    return apiRequest(`/templates${query ? `?${query}` : ''}`);
  },

  async getArchivedTemplates(params?: { teamId?: string }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    const query = search.toString();
    return apiRequest(`/templates/archived${query ? `?${query}` : ''}`);
  },

  async getTemplateById(id: string) {
    return apiRequest(`/templates/${encodeURIComponent(id)}`);
  },

  async generateTemplateFromClipy(url: string): Promise<{ draft: TemplateEditorFormValues }> {
    return apiRequest('/templates/generate-from-clipy', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },

  async getTemplateHistory(id: string): Promise<TemplateHistoryResponse> {
    return apiRequest(`/templates/${encodeURIComponent(id)}/history?limit=${HISTORY_DISPLAY_LIMIT}`);
  },

  async getTemplateBySlug(slug: string) {
    return apiRequest(`/templates/slug/${encodeURIComponent(slug)}`);
  },

  async getPublicTemplatesForUser(userId: string) {
    return apiRequest(`/templates/public?userId=${encodeURIComponent(userId)}`);
  },

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
  }): Promise<{ id: string; slug?: string }> {
    return apiRequest('/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    });
  },

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
  }): Promise<TemplateUpdateResult> {
    const body: unknown = await apiRequest(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return parseTemplateUpdateResponse(body);
  },

  async deleteTemplate(id: string) {
    return apiRequest(`/templates/${id}`, {
      method: 'DELETE',
    });
  },

  async restoreTemplate(id: string): Promise<{ success: true }> {
    return apiRequest(`/templates/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  // Exports the active context's own templates. The page adds public templates from the
  // catalog it already loaded (src/lib/templates/portableExport.ts).
  async exportTemplateBackup(params?: { format?: 'backup' | 'portable'; teamId?: string | null }) {
    const search = new URLSearchParams();
    if (params?.teamId) search.set('teamId', params.teamId);
    search.set('format', params?.format ?? 'portable');
    const query = search.toString();
    return apiRequest(`/templates/backup${query ? `?${query}` : ''}`);
  },

  async importTemplateBackup(payload: {
    teamId?: string | null;
    templates: unknown[];
    options?: { visibility?: 'preserve' | 'public' | 'private' };
  }): Promise<TemplateImportSummary> {
    const search = new URLSearchParams();
    if (payload.teamId) search.set('teamId', payload.teamId);
    const query = search.toString();
    const { teamId: _teamId, ...body } = payload;
    return apiRequest(`/templates/backup${query ? `?${query}` : ''}`, { method: 'POST', body: JSON.stringify(body) });
  },

  async clonePublicTemplate(templateId: string, payload?: { visibility?: 'public' | 'private' | 'preserve'; teamId?: string }): Promise<{ id: string; slug?: string }> {
    return apiRequest(`/templates/${encodeURIComponent(templateId)}/clone`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
  },
};
