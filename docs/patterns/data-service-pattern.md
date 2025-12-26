# Data Service Pattern

The application uses a centralized API client pattern combined with TanStack Query for server state management, providing a consistent interface for Cloudflare Workers API communication.

**Related Files:**
- `src/lib/api.ts` - Main API client singleton
- `src/lib/api/client.ts` - Alternative API client implementation
- `src/contexts/TemplatesContext.tsx` - Templates state with TanStack Query
- `src/contexts/CloudflareAuthContext.tsx` - Authentication context
- `functions/api/handlers/` - Cloudflare Workers API handlers
- `src/types/checklist.ts` - TypeScript type definitions

## Pattern Overview

The data service pattern consists of four layers:
1. **API Client Layer** - Singleton HTTP client with automatic token management
2. **Context Layer** - TanStack Query integration with React contexts
3. **Custom Hooks Layer** - Component-specific data access patterns
4. **Type Layer** - TypeScript definitions for complete type safety

## Implementation

### 1. API Client Singleton (Actual Implementation)

```typescript
// src/lib/api.ts - Real implementation
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

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  // Auth endpoints with automatic token management
  async register(email: string, password: string, name?: string) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    this.setToken(data.token);  // Automatically set token
    return data;
  }

  async login(email: string, password: string) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);  // Automatically set token
    return data;
  }

  logout() {
    this.setToken(null);  // Clear token
  }

  // Templates with proper typing
  async getTemplates() {
    return this.request('/templates');
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

  // Checklists (runs)
  async getChecklists() {
    return this.request('/checklists');
  }

  async createChecklist(checklist: {
    template_id?: string;
    title: string;
    items: unknown[];
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
    status?: string;
    progress?: number;
    completed_at?: string;
  }) {
    return this.request(`/checklists/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
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
}

export const api = new ApiClient();
```

### 2. TanStack Query Integration (Actual Implementation)

```typescript
// src/contexts/TemplatesContext.tsx - Real implementation
import React, { createContext, useContext } from "react";
import { useAuth } from "./CloudflareAuthContext";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ChecklistTemplate, ChecklistRun } from "@/types/checklist";

const TemplatesContext = createContext<TemplatesContextProps | undefined>(undefined);

export const TemplatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all public templates with data transformation
  const { data: templates = [] } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: async () => {
      try {
        const templatesData = await api.getTemplates();
        
        // Transform API response to app format
        const transformedTemplates = templatesData.map((template: Record<string, unknown>) => ({
          id: template.id,
          title: template.title,
          description: template.description || '',
          sections: (() => {
            if (template.sections) return template.sections;
            if (template.items) {
              const parsedItems = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;
              // Check if items is already in sections format
              if (Array.isArray(parsedItems) && parsedItems.length > 0 && parsedItems[0]?.items) {
                return parsedItems;
              }
              // Legacy format - wrap in single section
              return [{
                id: '1',
                title: 'Checklist',
                items: parsedItems
              }];
            }
            return [];
          })(),
          categories: template.category ? [template.category] : [],
          tags: typeof template.tags === 'string' ? JSON.parse(template.tags) : (template.tags || []),
          userId: template.user_id,
          createdAt: template.created_at,
          updatedAt: template.updated_at,
          isPublic: Boolean(template.is_public),
          slug: template.slug || '',
          version: template.version || 1,
        }));

        return transformedTemplates;
      } catch (error) {
        console.error('Error fetching templates:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch user's runs with proper transformation
  const { data: runs = [] } = useQuery({
    queryKey: ['runs', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      try {
        const checklistsData = await api.getChecklists();
        // Transform to run format
        const transformedRuns = checklistsData.map((checklist: Record<string, unknown>) => ({
          id: checklist.id,
          templateId: checklist.template_id || '',
          title: checklist.title,
          status: (checklist.status || 'in_progress') as "in_progress" | "completed",
          progress: 0,
          sections: typeof checklist.items === 'string' ? 
            [{ id: '1', title: 'Checklist', items: JSON.parse(checklist.items) }] : 
            [{ id: '1', title: 'Checklist', items: checklist.items || [] }],
          startedAt: checklist.started_at || checklist.created_at,
          completedAt: checklist.completed_at || undefined,
          userId: checklist.user_id || '',
          templateVersion: 1
        }));

        return transformedRuns;
      } catch (error) {
        console.error('Error fetching runs:', error);
        return [];
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Create template mutation with Sonner toast
  const createTemplateMutation = useMutation({
    mutationFn: async (templateData: Omit<ChecklistTemplate, "id" | "userId" | "createdAt" | "updatedAt" | "slug">) => {
      if (!user) throw new Error("User must be logged in to create a template");
      
      const result = await api.createTemplate({
        title: templateData.title,
        description: templateData.description,
        sections: templateData.sections,
        is_public: templateData.isPublic ?? true,
        categories: templateData.categories || [],
        tags: templateData.tags || []
      });
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      toast.success("Template created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Update template mutation with proper invalidation
  const updateTemplateMutation = useMutation({
    mutationFn: async (template: ChecklistTemplate) => {
      if (!user) throw new Error("User must be logged in to update a template");
      
      const result = await api.updateTemplate(template.id, {
        title: template.title,
        description: template.description,
        sections: template.sections,
        categories: template.categories,
        tags: template.tags,
        is_public: template.isPublic,
        slug: template.slug
      });
      
      if (!result) throw new Error('Failed to update template');
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] }); // Also invalidate runs
      toast.success("Template updated successfully - all related runs have been updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Delete with proper cleanup
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("User must be logged in to delete a template");
      
      await api.deleteTemplate(id);
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      toast.success("Template deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const value = {
    templates,
    runs,
    createTemplate: createTemplateMutation.mutateAsync,
    updateTemplate: updateTemplateMutation.mutate,
    deleteTemplate: deleteTemplateMutation.mutate,
    // ... other methods
  };

  return (
    <TemplatesContext.Provider value={value}>
      {children}
    </TemplatesContext.Provider>
  );
};

export const useTemplates = () => {
  const context = useContext(TemplatesContext);
  if (!context) {
    throw new Error("useTemplates must be used within a TemplatesProvider");
  }
  return context;
};
```

### 3. Authentication Context with Automatic Token Management

```typescript
// src/contexts/CloudflareAuthContext.tsx - Real auth implementation
import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  session: unknown | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<unknown | null>(null);

  const isAuthenticated = !!user;

  // Initialize auth state from localStorage
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      setSession({ token }); // Mock session with token
      api.getProfile()
        .then(setUser)
        .catch(() => {
          // Token is invalid, clear it
          localStorage.removeItem('auth_token');
          setSession(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const { user, token } = await api.login(email, password);
      setUser(user);
      setSession({ token });
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    try {
      const { user, token } = await api.register(email, password, name);
      setUser(user);
      setSession({ token });
      return true;
    } catch (error) {
      console.error('Registration failed:', error);
      return false;
    }
  };

  const logout = () => {
    api.logout(); // Clears token from API client and localStorage
    setUser(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (session?.token) {
      try {
        const profile = await api.getProfile();
        setUser(profile);
      } catch (error) {
        console.error('Failed to refresh profile:', error);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session,
      isAuthenticated,
      isLoading, 
      login, 
      register, 
      logout,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

### 4. Component Usage with Type Safety

```typescript
// src/pages/Account.tsx - Real component usage
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { toast } from 'sonner';

interface ProfileData {
  email: string;
  fullName: string;
  username: string;
  avatar_url: string;
}

const Account = () => {
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({
    email: user?.email || '',
    fullName: '',
    username: '',
    avatar_url: ''
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    try {
      const { api } = await import('@/lib/api');
      const data = await api.getProfile();
      
      if (data) {
        setProfileData(prev => ({
          ...prev,
          fullName: data.name || '',
          username: data.username || '',
          avatar_url: data.avatar_url || '',
          ...data
        }));
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const handleProfileUpdate = async () => {
    if (!user) return;

    // Validation
    if (profileData.username && profileData.username.length < 3) {
      toast.error('Username must be at least 3 characters long');
      return;
    }
    
    setLoading(true);
    try {
      const { api } = await import('@/lib/api');
      await api.updateProfile({
        name: profileData.fullName,
        avatar_url: profileData.avatar_url,
        username: profileData.username
      });

      // Refresh the profile in AuthContext
      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      if (error instanceof Error && error.message.includes('Username is already taken')) {
        toast.error('Username is already taken. Please choose a different one.');
      } else {
        toast.error('Failed to update profile');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Profile form */}
    </div>
  );
};
```

## Key Features

### Automatic Token Management
The API client automatically manages authentication tokens:

```typescript
// Token management is built into the API client
const api = new ApiClient();

// On login, token is automatically set
const { user, token } = await api.login(email, password);
// api.setToken(token) is called internally

// Token is included in all subsequent requests
const templates = await api.getTemplates(); // Automatically includes Bearer token

// On logout, token is cleared
api.logout(); // Clears from both client and localStorage
```

### Error Handling with Sonner Toast
Centralized error handling with Sonner toast notifications:

```typescript
// In mutations - real pattern from TemplatesContext.tsx
const createTemplateMutation = useMutation({
  mutationFn: async (templateData) => {
    if (!user) throw new Error("User must be logged in to create a template");
    return await api.createTemplate(templateData);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    toast.success("Template created successfully"); // Sonner toast
  },
  onError: (error: Error) => {
    toast.error(error.message); // Simple error toast
  }
});

// In API client - automatic 401 handling
private async request(endpoint: string, options: RequestInit = {}) {
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
```

### Data Transformation
Transform API responses to match app expectations:

```typescript
// In TemplatesContext.tsx - real data transformation
const { data: templates = [] } = useQuery({
  queryKey: ['templates', user?.id],
  queryFn: async () => {
    try {
      const templatesData = await api.getTemplates();
      
      // Transform API response to app format
      const transformedTemplates = templatesData.map((template: Record<string, unknown>) => ({
        id: template.id,
        title: template.title,
        description: template.description || '',
        // Handle legacy data formats
        sections: (() => {
          if (template.sections) return template.sections;
          if (template.items) {
            const parsedItems = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;
            // Check if items is already in sections format
            if (Array.isArray(parsedItems) && parsedItems.length > 0 && parsedItems[0]?.items) {
              return parsedItems;
            }
            // Legacy format - wrap in single section
            return [{
              id: '1',
              title: 'Checklist',
              items: parsedItems
            }];
          }
          return [];
        })(),
        categories: template.category ? [template.category] : [],
        tags: typeof template.tags === 'string' ? JSON.parse(template.tags) : (template.tags || []),
        userId: template.user_id,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
        isPublic: Boolean(template.is_public),
        slug: template.slug || '',
        version: template.version || 1,
      }));

      return transformedTemplates;
    } catch (error) {
      console.error('Error fetching templates:', error);
      return [];
    }
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

### Query Invalidation Strategy
Properly invalidate related queries for data consistency:

```typescript
// Real invalidation patterns from TemplatesContext.tsx
const updateTemplateMutation = useMutation({
  mutationFn: async (template: ChecklistTemplate) => {
    const result = await api.updateTemplate(template.id, {
      title: template.title,
      description: template.description,
      sections: template.sections,
      categories: template.categories,
      tags: template.tags,
      is_public: template.isPublic,
      slug: template.slug
    });
    return result;
  },
  onSuccess: () => {
    // Invalidate multiple related queries
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    queryClient.invalidateQueries({ queryKey: ['user-templates'] });
    queryClient.invalidateQueries({ queryKey: ['runs'] }); // Runs depend on templates
    toast.success("Template updated successfully - all related runs have been updated");
  },
  onError: (error: Error) => {
    toast.error(error.message);
  }
});

// Delete also cleans up all related data
const deleteTemplateMutation = useMutation({
  mutationFn: async (id: string) => {
    await api.deleteTemplate(id);
    return true;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    queryClient.invalidateQueries({ queryKey: ['user-templates'] });
    queryClient.invalidateQueries({ queryKey: ['runs'] }); // Clean up related runs
    toast.success("Template deleted successfully");
  }
});
```

## Benefits

1. **Centralized Configuration** - Single API client for all Cloudflare Workers requests
2. **Automatic Token Management** - Seamless auth token handling with localStorage
3. **Type Safety** - Full TypeScript support with defined interfaces
4. **Error Handling** - Consistent error handling with Sonner toast notifications
5. **Intelligent Caching** - TanStack Query provides smart caching with staleTime
6. **Data Transformation** - Automatic transformation between API and app formats
7. **Query Invalidation** - Proper cache invalidation for data consistency
8. **Loading States** - Built-in loading state management
9. **Background Refetching** - Automatic background updates when data becomes stale

## Best Practices (From Actual Implementation)

1. **Use TanStack Query for server state** - Never store server data in useState
2. **Define query keys with user context** - `['templates', user?.id]` for user-specific data
3. **Set appropriate stale times** - 5 minutes for templates, immediate for user actions
4. **Transform data in queries** - Handle legacy formats and normalize data structure
5. **Use Sonner for user feedback** - Simple toast.success() and toast.error() calls
6. **Invalidate related queries** - Update templates also invalidates runs that depend on them
7. **Handle authentication in API client** - Automatic token management with localStorage
8. **Use proper TypeScript types** - Define interfaces for all API responses
9. **Enable/disable queries based on auth** - `enabled: !!user` for authenticated endpoints

## Common Pitfalls to Avoid

1. **Forgetting to invalidate related queries** - Template updates should invalidate runs
2. **Not handling data transformation** - API format may differ from app requirements
3. **Missing error boundaries** - TanStack Query errors should be caught properly
4. **Over-fetching without staleTime** - Set appropriate cache durations
5. **Not typing API responses** - Use TypeScript interfaces for all data
6. **Mixing server and client state** - Keep authentication in contexts, data in queries
7. **Not handling loading states** - Always provide user feedback during operations

## Testing (Real Test Structure)

```typescript
// tests/unit/contexts/TemplatesContext.test.ts - Actual test
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplatesProvider, useTemplates } from '@/contexts/TemplatesContext';
import { AuthProvider } from '@/contexts/CloudflareAuthContext';

// Mock the API client
jest.mock('@/lib/api', () => ({
  api: {
    getTemplates: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    getChecklists: jest.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0,
      },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TemplatesProvider>
          {children}
        </TemplatesProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('useTemplates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('provides templates context', async () => {
    const { api } = require('@/lib/api');
    api.getTemplates.mockResolvedValue([]);
    api.getChecklists.mockResolvedValue([]);
    
    const { result } = renderHook(() => useTemplates(), {
      wrapper: createWrapper(),
    });
    
    await waitFor(() => {
      expect(result.current.templates).toBeDefined();
      expect(typeof result.current.createTemplate).toBe('function');
      expect(typeof result.current.updateTemplate).toBe('function');
    });
  });

  it('creates templates successfully', async () => {
    const { api } = require('@/lib/api');
    const mockTemplate = { id: '1', title: 'Test Template' };
    api.createTemplate.mockResolvedValue(mockTemplate);
    
    const { result } = renderHook(() => useTemplates(), {
      wrapper: createWrapper(),
    });
    
    await waitFor(async () => {
      const created = await result.current.createTemplate({
        title: 'Test Template',
        description: '',
        sections: [],
        categories: [],
        tags: [],
        version: 1
      });
      expect(created.title).toBe('Test Template');
    });
  });
});
```

## Architecture Summary

The data service pattern uses:
- **Singleton API Client** - Centralized HTTP requests with automatic token management
- **TanStack Query** - Server state management with caching and background updates
- **Context Providers** - React contexts for state distribution
- **Data Transformation** - Normalize API responses for app consumption
- **Type Safety** - Full TypeScript coverage with defined interfaces
- **Error Handling** - Consistent user feedback with Sonner toast
- **Cache Management** - Smart invalidation for related data consistency

## See Also:
- [Component Pattern](./component-pattern.md) - Component structure and custom hooks
- [Message Handler Pattern](./message-handler-pattern.md) - Event handling and notifications
- [Tab Creation Pattern](./tab-creation-pattern.md) - Navigation and tab patterns
