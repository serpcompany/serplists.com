import { env } from "@/env";
import { createApiError } from "@/lib/api-errors";

const DEV_API_BASE_URL = env.VITE_API_URL ?? 'http://localhost:8788/api';
const API_BASE_URL = import.meta.env.DEV
  ? DEV_API_BASE_URL
  : env.VITE_API_URL ?? '/api';

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
  async getTemplates() {
    return this.request('/templates');
  }

  async getTemplateById(id: string) {
    return this.request(`/templates/${encodeURIComponent(id)}`);
  }

  async getTemplateBySlug(slug: string) {
    return this.request(`/templates/slug/${encodeURIComponent(slug)}`);
  }

  async getPublicTemplatesForUser(userId: string) {
    return this.request(`/templates/public?userId=${encodeURIComponent(userId)}`);
  }

  async createTemplate(template: {
    title: string;
    description?: string;
    type?: "checklist" | "recipe";
    seoTitle?: string;
    seoDescription?: string;
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
    sections?: unknown[];
    categories?: string[];
    tags?: string[];
    is_public?: boolean;
    slug?: string;
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

  async exportTemplateBackup(params?: { includePublic?: boolean; format?: 'backup' | 'portable' }) {
    const search = new URLSearchParams();
    if (params?.includePublic) search.set('includePublic', '1');
    search.set('format', params?.format ?? 'portable');
    const query = search.toString();
    return this.request(`/templates/backup${query ? `?${query}` : ''}`);
  }

  async importTemplateBackup(payload: {
    templates: unknown[];
    options?: { visibility?: 'preserve' | 'public' | 'private' };
  }): Promise<{ imported: number; failed: { title: string; reason: string }[] }> {
    return this.request('/templates/backup', { method: 'POST', body: JSON.stringify(payload) });
  }

  async clonePublicTemplate(templateId: string, payload?: { visibility?: 'public' | 'private' | 'preserve' }): Promise<{ id: string; slug?: string }> {
    return this.request(`/templates/${encodeURIComponent(templateId)}/clone`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
  }

  // Checklists
  async getChecklists() {
    return this.request('/checklists');
  }

  async getChecklistById(id: string) {
    return this.request(`/checklists/${encodeURIComponent(id)}`);
  }

  async createChecklist(checklist: {
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

  async createChecklistShare(templateId: string, runName?: string) {
    return this.request(`/checklists/${encodeURIComponent(templateId)}/share`, {
      method: 'POST',
      body: JSON.stringify(runName ? { runName } : {}),
    });
  }

  async createChecklistRunShare(runId: string) {
    return this.request(`/checklists/run/${encodeURIComponent(runId)}/share`, {
      method: 'POST',
      body: JSON.stringify({}),
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
  }) {
    return this.request(`/checklists/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteChecklist(id: string) {
    return this.request(`/checklists/${id}`, {
      method: 'DELETE',
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
  async getBillingStatus(): Promise<{
    plan: 'free' | 'pro';
    limits?: { maxTemplates: number | null; maxActiveRuns: number | null };
    billingEnabled?: boolean;
  }> {
    return this.request('/billing/status');
  }

  async createBillingCheckout(): Promise<{ url: string }> {
    return this.request('/billing/checkout', { method: 'POST', body: JSON.stringify({}) });
  }

  async createBillingPortal(): Promise<{ url: string }> {
    return this.request('/billing/portal', { method: 'POST', body: JSON.stringify({}) });
  }
}

export const api = new ApiClient();
