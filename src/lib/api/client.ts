const API_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_URL ?? 'http://localhost:8788/api'
  : import.meta.env.VITE_API_URL ?? '/api';

export function redirectToLoginAfterUnauthorized() {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.location.pathname !== '/login') {
    window.history.pushState({ authRedirect: true }, '', '/login');
  }

  const event =
    typeof PopStateEvent === 'function'
      ? new PopStateEvent('popstate', { state: window.history.state })
      : new Event('popstate');

  window.dispatchEvent(event);
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  private async request(path: string, options: RequestInit = {}) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.clearToken();
        redirectToLoginAfterUnauthorized();
      }
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Auth methods
  async register(email: string, password: string, name?: string) {
    const result = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    this.setToken(result.token);
    return result;
  }

  async login(email: string, password: string) {
    const result = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(result.token);
    return result;
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  logout() {
    this.clearToken();
  }

  // Templates methods
  async getPublicTemplates(params?: { category?: string; search?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams(Object.entries(params ?? {}).map(([key, value]) => [key, String(value)])).toString();
    return this.request(`/templates/public${query ? `?${query}` : ''}`);
  }

  async getMyTemplates() {
    return this.request('/templates/my');
  }

  async getTemplate(id: string) {
    return this.request(`/templates/${id}`);
  }

  async createTemplate(template: unknown) {
    return this.request('/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    });
  }

  async updateTemplate(id: string, template: unknown) {
    return this.request(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(template),
    });
  }

  async deleteTemplate(id: string) {
    return this.request(`/templates/${id}`, {
      method: 'DELETE',
    });
  }

  async forkTemplate(id: string) {
    return this.request(`/templates/${id}/fork`, {
      method: 'POST',
    });
  }

  // Checklists methods
  async getChecklists(params?: { status?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams(Object.entries(params ?? {}).map(([key, value]) => [key, String(value)])).toString();
    return this.request(`/checklists${query ? `?${query}` : ''}`);
  }

  async getChecklist(id: string) {
    return this.request(`/checklists/${id}`);
  }

  async createChecklistFromTemplate(templateId: string, title?: string) {
    return this.request(`/checklists/from-template/${templateId}`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  async updateChecklist(id: string, updates: unknown[]) {
    return this.request(`/checklists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deleteChecklist(id: string) {
    return this.request(`/checklists/${id}`, {
      method: 'DELETE',
    });
  }

  // User methods
  async getUserProfile() {
    return this.request('/users/profile');
  }

  async updateUserProfile(updates: { name?: string; avatar_url?: string }) {
    return this.request('/users/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append('avatar', file);
    
    const response = await fetch(`${API_URL}/users/avatar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload avatar');
    }

    return response.json();
  }
}

export const apiClient = new ApiClient();
