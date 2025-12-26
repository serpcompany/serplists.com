const API_BASE_URL = import.meta.env.DEV 
  ? 'http://localhost:8788/api' 
  : '/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  private async requestFormData(endpoint: string, formData: FormData) {
    const headers: HeadersInit = {};

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  // Auth endpoints
  async register(email: string, password: string, name?: string) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    this.setToken(data.token);
    return data;
  }

  async login(email: string, password: string) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  logout() {
    this.setToken(null);
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

  // User profile
  async getProfile() {
    return this.request('/auth/profile');
  }

  async updateProfile(updates: { name?: string; avatar_url?: string; username?: string }) {
    return this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
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
}

export const api = new ApiClient();
