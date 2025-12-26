# Data Persistence Module

The data persistence module handles all data storage, retrieval, and caching using Cloudflare Workers, D1 database (SQLite), and TanStack React Query for client-side caching.

**Related Files:**
- `/d1/schema.sql` - Database schema definition
- `/migrations/*.sql` - Database migration files
- `/functions/api/[[route]].ts` - Main API router
- `/functions/api/handlers/` - API endpoint handlers
- `/src/lib/api.ts` - API client
- `/src/contexts/TemplatesContext.tsx` - React context with React Query
- `/src/lib/utils/templateBackup.ts` - Import/export functionality
- `/src/lib/schemas/checklistSchema.ts` - Zod validation schemas

## Architecture Overview

The persistence layer consists of:
1. **Cloudflare D1 Database (SQLite)** - Primary data storage
2. **Cloudflare Workers API** - RESTful endpoints using Hono framework
3. **TanStack React Query** - Client-side caching with 5-minute stale time
4. **Local Storage** - JWT token storage only (no offline sync)
5. **Backup System** - JSON import/export with Zod validation

## Database Schema

### Actual Schema (d1/schema.sql)

```sql
-- Users table (simplified auth)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Templates table  
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  tags TEXT, -- JSON array stored as text
  sections TEXT NOT NULL, -- JSON stored as text
  is_public BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  fork_count INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  seo_title TEXT,
  seo_description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Checklist runs/instances
CREATE TABLE checklist_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  sections TEXT NOT NULL, -- JSON with progress stored as text
  status TEXT DEFAULT 'in_progress', -- in_progress, completed, archived
  progress REAL DEFAULT 0,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);

-- Additional tables from migrations
-- Users table extensions (from migrations/0002_add_username_and_profiles.sql):
-- username TEXT

-- template_favorites, template_forks, sessions
```

### Key Schema Notes
- Uses `crypto.randomUUID()` for IDs, not SQLite functions
- JSON data stored as TEXT strings, parsed in application
- Categories stored as JSON array in `category` column for templates
- Additional tables added via migrations for user profiles

## Actual API Implementation

### Main API Router (functions/api/[[route]].ts)

```typescript
export const onRequestGet = handleRequest;
export const onRequestPost = handleRequest;
export const onRequestPut = handleRequest;
export const onRequestDelete = handleRequest;

async function handleRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  
  // Route to appropriate handlers
  if (path === 'auth/register') {
    return handleRegister(request, env);
  } else if (path === 'auth/login') {
    return handleLogin(request, env);
  } else if (path.startsWith('templates')) {
    return handleTemplates(request, env);
  } else if (path.startsWith('checklists')) {
    return handleChecklists(request, env);
  }
  // Add CORS headers to all responses
}
```

### Templates Handler (functions/api/handlers/templates.ts)

```typescript
export async function handleTemplates(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  const userId = authHeader ? await verifyJWT(authHeader.replace('Bearer ', ''), env.JWT_SECRET) : null;
  
  if (request.method === 'GET') {
    const templates = await env.DB.prepare(
      'SELECT * FROM templates WHERE is_public = 1 OR user_id = ? ORDER BY created_at DESC'
    ).bind(userId || '').all();
    
    // Transform data for frontend compatibility
    const transformedTemplates = templates.results.map((template) => {
      // Convert items/sections format
      let sections = [];
      if (template.items) {
        const parsedItems = JSON.parse(template.items);
        // Handle both legacy flat items and new sections format
        if (Array.isArray(parsedItems) && parsedItems[0]?.items) {
          sections = parsedItems;
        } else {
          sections = [{ id: '1', title: 'Checklist', items: parsedItems }];
        }
      }
      
      return {
        ...template,
        sections,
        categories: template.category ? JSON.parse(template.category) : [],
        tags: template.tags ? JSON.parse(template.tags) : []
      };
    });
    
    return new Response(JSON.stringify(transformedTemplates));
  }
  
  // POST, PUT, DELETE methods with JWT auth required
  // Stores full sections structure as JSON in database
}
```

### Checklists Handler (functions/api/handlers/checklists.ts)

```typescript
export async function handleChecklists(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  const userId = authHeader ? await verifyJWT(authHeader.replace('Bearer ', ''), env.JWT_SECRET) : null;
  
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  
  if (request.method === 'GET') {
    const checklists = await env.DB.prepare(
      'SELECT * FROM checklist_runs WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(userId).all();
    
    return new Response(JSON.stringify(checklists.results));
  }
  
  // POST, PUT, DELETE for checklist operations
}
```

## Client-Side Implementation

### API Client (src/lib/api.ts)

```typescript
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

  // Auth endpoints
  async register(email: string, password: string, name?: string) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    this.setToken(data.token);
    return data;
  }

  // Templates, checklists, profile endpoints...
}
```

### Templates Context with React Query (src/contexts/TemplatesContext.tsx)

```typescript
export const TemplatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all public templates for visitors and logged-in users
  const { data: templates = [] } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: async () => {
      const templatesData = await api.getTemplates();
      
      // Transform API response to app format
      const transformedTemplates = templatesData.map((template) => ({
        id: template.id,
        title: template.title,
        sections: (() => {
          if (template.sections) return template.sections;
          if (template.items) {
            // Handle legacy format conversion
            const parsedItems = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;
            if (Array.isArray(parsedItems) && parsedItems[0]?.items) {
              return parsedItems;
            }
            return [{ id: '1', title: 'Checklist', items: parsedItems }];
          }
          return [];
        })(),
        categories: template.category ? [template.category] : [],
        tags: typeof template.tags === 'string' ? JSON.parse(template.tags) : (template.tags || []),
        // ... other fields
      }));

      return transformedTemplates;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutations with optimistic updates and cache invalidation
};
```

## Data Validation

### Zod Schemas (src/lib/schemas/checklistSchema.ts)

```typescript
import { z } from "zod";

// Schema for checklist items
export const checklistItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  contents: z.array(checklistItemContentSchema).optional(),
  isCompleted: z.boolean().optional()
});

// Schema for checklist sections
export const checklistSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(checklistItemSchema)
});

// Schema for complete checklist templates
export const checklistTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  sections: z.array(checklistSectionSchema),
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isPublic: z.boolean(),
  slug: z.string().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

// Type exports
export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>;
export type ChecklistSection = z.infer<typeof checklistSectionSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

// Validation functions
export const validateTemplate = (data: unknown): ChecklistTemplate => {
  return checklistTemplateSchema.parse(data);
};
```

## Local Storage Usage

**Current Implementation:**
- JWT token storage: `localStorage.getItem('auth_token')`
- No auto-save functionality implemented
- No offline queue system
- React Query handles caching (5-minute stale time)

**What's Missing:**
- Draft auto-save for template editing
- Offline support for creating/editing when disconnected
- Local backup of user data

## Actual Backup & Export System (src/lib/utils/templateBackup.ts)

### Template Backup Implementation

```typescript
import { ChecklistTemplate, TemplateBackup, validateBackup } from "@/lib/schemas/checklistSchema";

/**
 * Export templates as JSON backup file
 */
export const exportTemplatesToJSON = (
  templates: ChecklistTemplate[], 
  exportedBy?: string
): TemplateBackup => {
  const publicTemplates = templates.filter(t => t.isPublic);
  const privateTemplates = templates.filter(t => !t.isPublic);

  const backup: TemplateBackup = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    exportedBy,
    templates,
    metadata: {
      totalTemplates: templates.length,
      publicTemplates: publicTemplates.length,
      privateTemplates: privateTemplates.length
    }
  };

  return backup;
};

/**
 * Download backup as JSON file
 */
export const downloadBackupFile = (backup: TemplateBackup, filename?: string): void => {
  const jsonString = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `checklist-templates-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Generate unique IDs for imported templates to avoid conflicts
 */
export const generateUniqueIds = (templates: ChecklistTemplate[]): ChecklistTemplate[] => {
  return templates.map(template => {
    const newTemplate: ChecklistTemplate = {
      ...template,
      id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sections: template.sections.map(section => ({
        ...section,
        id: `section_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        items: section.items.map(item => ({
          ...item,
          id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          // Handle sub-items if they exist
        }))
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slug: "" // Clear slug to regenerate
    };
    
    return newTemplate;
  });
};
```

### Integration with Templates Context

The backup system is integrated into the templates context with import functionality:

```typescript
// In src/contexts/TemplatesContext.tsx
const importTemplatesMutation = useMutation({
  mutationFn: async (templatesData: ChecklistTemplate[]) => {
    if (!user) throw new Error("User must be logged in to import templates");
    
    const templatesToImport = prepareTemplatesForImport(templatesData, user.id);
    
    // Import templates one by one using the API
    for (const template of templatesToImport) {
      await api.createTemplate({
        title: template.title,
        description: template.description,
        items: template.sections, // Full sections structure
        is_public: template.isPublic,
        category: template.categories?.[0] || '',
        tags: template.tags || []
      });
    }
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    toast.success("Templates imported successfully");
  }
});
```

## React Query Caching Strategy

### Actual Cache Configuration

The application uses TanStack React Query for all data synchronization:

```typescript
// Templates query with 5-minute stale time
const { data: templates = [] } = useQuery({
  queryKey: ['templates', user?.id],
  queryFn: async () => {
    const templatesData = await api.getTemplates();
    // Transform and return data
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
});

// Mutations with cache invalidation
const updateTemplateMutation = useMutation({
  mutationFn: async (template: ChecklistTemplate) => {
    const result = await api.updateTemplate(template.id, {
      title: template.title,
      description: template.description,
      sections: template.sections,
      categories: template.categories,
      tags: template.tags,
      is_public: template.isPublic,
    });
    return result;
  },
  onSuccess: () => {
    // Invalidate and refetch templates
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    queryClient.invalidateQueries({ queryKey: ['user-templates'] });
    queryClient.invalidateQueries({ queryKey: ['runs'] });
    toast.success("Template updated successfully");
  }
});
```

### Data Flow

1. **Fetch**: React Query fetches from API with JWT auth
2. **Cache**: Data cached for 5 minutes (stale time)
3. **Transform**: API data transformed for frontend compatibility
4. **Mutate**: Mutations update server and invalidate cache
5. **Sync**: No custom sync - relies on React Query refetching

**No Custom Synchronization:**
- No offline queue system
- No local change tracking  
- No background sync manager
- Relies entirely on React Query's built-in caching and refetching

## Database Migration System

### Actual Migration Files

The application uses SQL migration files in the `/migrations/` directory:

```
migrations/
├── 0001_initial_schema.sql
├── 0002_add_slug_to_templates.sql  
├── 0002_add_username_and_profiles.sql
├── add-slugs-to-templates.sql
└── seed-test-data.sql
```

### Key Migrations

**Initial Schema (0001_initial_schema.sql):**
- Creates core tables: users, templates, checklist_runs
- Establishes foreign key relationships
- Sets up basic indexes

**Username and Profiles (0002_add_username_and_profiles.sql):**
```sql
-- Add username field to users table
ALTER TABLE users ADD COLUMN username TEXT;

-- Create unique index (acts like UNIQUE constraint)
CREATE UNIQUE INDEX idx_users_username ON users(username);
```

### Migration Management

The application uses Cloudflare D1's built-in migration system via `wrangler d1 migrations` commands:

```bash
# Apply migrations
wrangler d1 migrations apply serp-checklists-db --local

# Create new migration
wrangler d1 migrations create serp-checklists-db "add_new_feature"
```

**No Custom Migration Runner:**
- Uses Cloudflare D1's migration system
- No application-level migration tracking
- Migrations applied via Wrangler CLI tool

## Current Implementation Summary

### What's Working
1. **Cloudflare Workers + D1** - Serverless API with SQLite database
2. **JWT Authentication** - Secure token-based auth with bcrypt
3. **React Query Caching** - 5-minute stale time for efficient data fetching
4. **Zod Validation** - Type-safe data validation for templates and backups
5. **JSON Import/Export** - Template backup and restore functionality
6. **Database Migrations** - Version-controlled schema changes

### What's Missing/Different from Documentation
1. **No Offline Support** - No offline queue or auto-save functionality
2. **No Custom Sync Manager** - Relies entirely on React Query
3. **Simple Error Handling** - No centralized error tracking beyond console logs
4. **Limited Local Storage** - Only JWT token storage, no drafts or caching
5. **Basic Caching** - Standard React Query caching, no custom strategies

### Technology Stack
- **Backend**: Cloudflare Workers, D1 (SQLite), Hono framework
- **Frontend**: React, TypeScript, TanStack React Query
- **Auth**: JWT tokens with bcrypt password hashing
- **Validation**: Zod schemas for type safety
- **Storage**: D1 database with JSON columns for complex data
- **Caching**: React Query with 5-minute stale time

## See Also:
- [Frontend Admin Module](./frontend-admin.md)
- [Logging System Module](./logging-system.md)
- [Add Data Type Recipe](../recipes/add-data-type.md)
