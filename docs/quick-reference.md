# Quick Reference Guide

## Common Commands (Updated January 2025)

### Development Commands (Verified Working)
```bash
# Start frontend development server (Vite)
pnpm run dev

# Start API server (Cloudflare Workers)
pnpm run dev:api

# Start both frontend and API (recommended for full development)
pnpm run dev:all

# Run tests with Vitest
pnpm run test

# Run tests once (no watch mode)
pnpm run test:run

# Type checking with TypeScript
pnpm run typecheck

# Lint with ESLint
pnpm run lint
```

### Build Commands
```bash
# Production build
pnpm run build

# Development build
pnpm run build:dev

# Preview production build locally
pnpm run preview
```

### Database Operations (Cloudflare D1)
```bash
# Seed test data into database
pnpm run db:seed

# Reset database to initial state and seed data
pnpm run db:reset

# Execute SQL query on database
pnpm run db:query "SELECT * FROM templates LIMIT 5"

# Example queries
pnpm run db:query "SELECT COUNT(*) FROM users"
pnpm run db:query "DESCRIBE templates"
```

### Package Management (pnpm)
```bash
# Install dependencies
pnpm install

# Add new dependency
pnpm add package-name

# Add dev dependency
pnpm add -D package-name

# Remove dependency
pnpm remove package-name

# Update dependencies
pnpm update
```

## Key File Locations

### Configuration Files (Current)
- **Environment Setup**: Create `.env.local` from template
- **TypeScript Config**: `tsconfig.json` (project references), `tsconfig.app.json` (app config)
- **Vite Config**: `vite.config.ts` (bundler configuration)
- **Vitest Config**: `vitest.config.ts` (testing configuration)
- **Tailwind Config**: `tailwind.config.ts` (styling configuration)
- **Cloudflare Config**: `wrangler.toml` (Workers and D1 database)
- **ESLint Config**: `eslint.config.js` (flat configuration)

### Entry Points (Current)
- **Frontend Entry**: `src/main.tsx` (React application entry point)
- **App Routing**: `src/App.tsx` (routing configuration)
- **API Entry**: `functions/api/[[route]].ts` (Cloudflare Workers API)
- **API Client**: `src/lib/api.ts` (singleton API client)
- **Auth Context**: `src/contexts/CloudflareAuthContext.tsx`
- **Templates Context**: `src/contexts/TemplatesContext.tsx`

### Component Locations (Current Structure)
- **Pages**: `src/pages/` (15 page components)
- **Shared Components**: `src/components/shared/`
- **UI Components**: `src/components/ui/` (58 shadcn/ui components)
- **Template Editor**: `src/components/template-editor/`
- **Checklist Components**: `src/components/checklist/`
- **Custom Hooks**: `src/hooks/` (12 custom hooks)

## API Endpoints (Current Active Implementation)

### Authentication Endpoints (functions/api/handlers/auth.ts)
```typescript
POST   /api/auth/register              // User registration
POST   /api/auth/login                 // User login  
POST   /api/auth/logout                // User logout
GET    /api/auth/me                    // Get current user profile
POST   /api/auth/refresh               // Refresh authentication token
```

### Template Endpoints (functions/api/handlers/templates.ts)
```typescript
GET    /api/templates                  // List user's templates
GET    /api/templates/:id              // Get specific template
POST   /api/templates                  // Create new template
PUT    /api/templates/:id              // Update template
DELETE /api/templates/:id              // Delete template
GET    /api/templates/public           // List public templates
GET    /api/templates/slug/:slug       // Get template by slug
POST   /api/templates/:id/duplicate    // Duplicate template
```

### Checklist Run Endpoints (functions/api/handlers/checklists.ts)
```typescript
GET    /api/checklists                 // List user's checklist runs
GET    /api/checklists/:id             // Get specific checklist run
POST   /api/checklists                 // Create new checklist run
PUT    /api/checklists/:id             // Update checklist run progress
DELETE /api/checklists/:id             // Delete checklist run
POST   /api/checklists/:id/complete    // Mark checklist as completed
```

### API Response Format (Current Implementation)
```typescript
// Success Response
{
  "success": true,
  "data": { ... },
  "message"?: string
}

// Error Response  
{
  "success": false,
  "error": string,
  "details"?: any
}
```

## Component Import Patterns (Current)

### UI Components (shadcn/ui)
```typescript
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toast } from '@/components/ui/toast';
```

### Custom Hooks (Current)
```typescript
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useToast } from '@/hooks/use-toast';
import { useTemplateEditor } from '@/hooks/useTemplateEditor';
import { useChecklistState } from '@/hooks/useChecklistState';
import { useMobile } from '@/hooks/use-mobile';
```

### Utility Imports
```typescript
import { cn } from '@/lib/utils';                    // Class name utility
import { api } from '@/lib/api';                     // API client singleton
import { validateTemplate } from '@/lib/schemas/checklistSchema';  // Validation
```

### Type Imports (Current)
```typescript
import type { Template, Section, ChecklistItem } from '@/types/checklist';
import type { Page } from '@/types/page';
import type { ChecklistTemplate, ChecklistRun } from '@/lib/schemas/checklistSchema';
```

## Type Definitions (Current Implementation)

### Template Structure (from src/types/checklist.ts)
```typescript
export interface Template {
  id: string;
  title: string;
  description?: string;
  sections: Section[];
  userId?: string;
  isPublic: boolean;
  slug: string;
  createdAt: string;
  updatedAt: string;
  seoTitle?: string;
  seoDescription?: string;
  seoUrl?: string;
  categories?: string[];
  tags?: string[];
  version?: number;
  ownerProfile?: UserProfile;
}

export interface Section {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  contents: ChecklistItemContent[];
  isCompleted: boolean;
}
```

### Content Types (from lib/schemas/checklistSchema.ts)
```typescript
type ChecklistItemContent = 
  | { id: string; type: 'text'; value: string }
  | { id: string; type: 'image'; value: string; uploadType?: 'url' | 'upload'; fileName?: string; fileSize?: number }
  | { id: string; type: 'video'; value: string; uploadType?: 'url' | 'upload' }
  | { id: string; type: 'file'; value: string; uploadType?: 'url' | 'upload'; fileName?: string; fileSize?: number }
  | { id: string; type: 'embed'; value: string }
  | { id: string; type: 'subItems'; value: string; subItems?: ChecklistSubItem[] }
  | { id: string; type: 'page'; value: string; pageId?: string };
```

## Common Patterns (Current Implementation)

### Authentication Usage
```typescript
const { user, isLoading, login, logout, isAuthenticated } = useAuth();

// Check if user is authenticated
if (!isAuthenticated) {
  return <Navigate to="/login" />;
}

// Login example
const handleLogin = async (email: string, password: string) => {
  try {
    const success = await login(email, password);
    if (success) {
      navigate('/dashboard');
    }
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Login failed',
      variant: 'destructive',
    });
  }
};
```

### Templates Context Usage
```typescript
const { 
  templates, 
  checklists,
  currentRun,
  createTemplate, 
  updateTemplate,
  deleteTemplate,
  createChecklistRun
} = useTemplates();

// Create new template
const handleCreateTemplate = async (templateData: Partial<Template>) => {
  try {
    await createTemplate(templateData);
    toast({ title: 'Success', description: 'Template created' });
  } catch (error) {
    toast({ title: 'Error', description: 'Failed to create template', variant: 'destructive' });
  }
};
```

### Toast Notifications (Current)
```typescript
const { toast } = useToast();

// Success toast
toast({
  title: "Success",
  description: "Template saved successfully",
});

// Error toast
toast({
  title: "Error", 
  description: "Failed to save template",
  variant: "destructive",
});

// Info toast
toast({
  title: "Info",
  description: "Changes auto-saved",
  variant: "default",
});
```

### API Client Usage (Current)
```typescript
// Direct API calls (current pattern)
const response = await api.request<Template[]>('/templates');
const template = await api.request<Template>('/templates/123');

// Create template
const newTemplate = await api.request<Template>('/templates', {
  method: 'POST',
  body: JSON.stringify(templateData),
});

// Update template  
const updatedTemplate = await api.request<Template>('/templates/123', {
  method: 'PUT',
  body: JSON.stringify(updates),
});

// Handle API errors
try {
  const data = await api.request('/templates');
  return data;
} catch (error) {
  console.error('API Error:', error);
  toast({ title: 'Error', description: error.message, variant: 'destructive' });
  throw error;
}
```

### Form Handling (React Hook Form + Zod)
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Define schema using existing Zod schemas
const templateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  isPublic: z.boolean().default(false),
});

type FormData = z.infer<typeof templateSchema>;

// Use in component
const form = useForm<FormData>({
  resolver: zodResolver(templateSchema),
  defaultValues: {
    title: '',
    description: '',
    isPublic: false,
  },
});

const onSubmit = async (data: FormData) => {
  try {
    await createTemplate(data);
    toast({ title: 'Success', description: 'Template created' });
    form.reset();
  } catch (error) {
    toast({ title: 'Error', description: 'Failed to create template', variant: 'destructive' });
  }
};
```

## Styling Patterns (Current)

### Tailwind CSS with cn() Utility
```typescript
import { cn } from '@/lib/utils';

// Conditional styling
<Card className={cn(
  "p-6 hover:shadow-lg transition-shadow",
  isSelected && "ring-2 ring-primary",
  isDisabled && "opacity-50 pointer-events-none",
  className
)} />

// Button variants (using shadcn/ui)
<Button variant="default">Save</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">Skip</Button>
<Button variant="link">Learn More</Button>

// Button sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon className="h-4 w-4" /></Button>
```

### Component Composition Patterns
```typescript
// Card composition
<Card>
  <CardHeader>
    <CardTitle>Template Title</CardTitle>
  </CardHeader>
  <CardContent>
    <p>Template description...</p>
  </CardContent>
</Card>

// Dialog composition  
<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
    </DialogHeader>
    <div>Dialog content...</div>
  </DialogContent>
</Dialog>
```

## State Management Quick Reference

### Context Providers Hierarchy (Current)
```typescript
// In src/main.tsx
<AuthProvider>
  <TemplatesProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </TemplatesProvider>
</AuthProvider>
```

### Local Storage Keys (Current Usage)
- `auth_token` - JWT authentication token ⚠️ (security vulnerability)
- `template-draft` - Auto-saved template draft
- `user_data` - Cached user information

## Environment Variables (Current Configuration)

### Client-side Variables (Vite - prefix with VITE_)
```env
# Frontend API endpoint
VITE_API_URL=http://localhost:8788/api

# Feature flags
VITE_ENABLE_DEV_LOGIN=true
VITE_ENABLE_ANALYTICS=false
```

### Server-side Variables (wrangler.toml)
```toml
[vars]
JWT_SECRET = "YOUR_JWT_SECRET_HERE"

[[d1_databases]]
binding = "DB"
database_name = "serp-checklists-db"
database_id = "your-database-id"
```

### Environment Setup
```bash
# Copy environment template (create this file first)
cp .env.example .env.local

# Edit with your actual values
# VITE_API_URL=http://localhost:8788/api
```

## Database Schema (Current D1 Structure)

### Main Tables
```sql
-- Users table
users (id, email, password_hash, name, avatar_url, role, created_at, updated_at)

-- Templates table  
templates (id, user_id, title, description, category, tags, sections, is_public, is_featured, view_count, fork_count, version, seo_title, seo_description, created_at, updated_at)

-- Checklist runs table
checklist_runs (id, user_id, template_id, template_version, title, sections, status, progress, started_at, completed_at, created_at, updated_at)

-- Template favorites
template_favorites (id, user_id, template_id, created_at)

-- Template forks
template_forks (id, original_template_id, forked_template_id, user_id, created_at)

-- Sessions table
sessions (id, user_id, token, expires_at, created_at)
```

### Database Indexes (Current)
```sql
CREATE INDEX idx_templates_user_id ON templates(user_id);
CREATE INDEX idx_templates_is_public ON templates(is_public);  
CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_checklist_runs_user_id ON checklist_runs(user_id);
CREATE INDEX idx_checklist_runs_template_id ON checklist_runs(template_id);
CREATE INDEX idx_checklist_runs_status ON checklist_runs(status);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

## Testing Patterns (Current Vitest Setup)

### Component Testing
```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TemplateCard } from '@/components/TemplateCard';

describe('TemplateCard', () => {
  it('renders template title', () => {
    const mockTemplate = {
      id: '1',
      title: 'Test Template',
      description: 'Test description',
      sections: [],
    };
    
    render(<TemplateCard template={mockTemplate} />);
    expect(screen.getByText('Test Template')).toBeInTheDocument();
  });
});
```

### Hook Testing  
```typescript
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useTemplateEditor } from '@/hooks/useTemplateEditor';

describe('useTemplateEditor', () => {
  it('initializes with default values', () => {
    const { result } = renderHook(() => useTemplateEditor());
    expect(result.current.template).toBeNull();
  });
});
```

### API Testing
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '@/lib/api';

describe('API Client', () => {
  beforeEach(() => {
    // Setup
  });

  it('should fetch templates', async () => {
    const templates = await api.request('/templates');
    expect(templates).toBeDefined();
  });
});
```

## Debugging Tips (Current Setup)

### Development Debugging
```typescript
// Enable debug mode in browser console
localStorage.setItem('debug', 'true');

// Check API responses in Network tab or add logging
console.log('API Response:', response);

// React Query DevTools (available but underutilized)
// Access via floating button in development
```

### Common Issues & Solutions
```bash
# Clear node_modules and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Reset database if schema changed
pnpm run db:reset

# Check if API server is running
curl http://localhost:8788/api/health

# Verify environment variables loaded
echo $VITE_API_URL
```

## Performance Optimization (Current Opportunities)

### Code Splitting (Available but underused)
```typescript
import { lazy, Suspense } from 'react';

const TemplateEditor = lazy(() => import('@/pages/TemplateEditor'));

// Use with Suspense
<Suspense fallback={<div>Loading...</div>}>
  <TemplateEditor />
</Suspense>
```

### Memoization (Currently missing in contexts)
```typescript
import { useMemo, useCallback } from 'react';

// Memoize expensive computations
const expensiveValue = useMemo(
  () => computeExpensive(data),
  [data]
);

// Memoize callbacks to prevent unnecessary re-renders
const handleClick = useCallback(
  (id: string) => {
    // Handle click
  },
  [dependency]
);
```

## Security Best Practices (Current Issues)

### ⚠️ Current Security Issues
1. **XSS Vulnerability**: HTML content rendered without sanitization
2. **localStorage Tokens**: JWT stored in localStorage (vulnerable to XSS)
3. **Missing DOMPurify**: No HTML sanitization library installed

### Required Security Fixes
```bash
# Install DOMPurify for HTML sanitization
pnpm add dompurify
pnpm add -D @types/dompurify

# Usage in components
import DOMPurify from 'dompurify';
const sanitizedHtml = DOMPurify.sanitize(htmlContent);
<div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
```

### Authentication Security (Current Implementation)
```typescript
// Authentication check pattern
const ProtectedRoute = ({ children }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  
  return children;
};

// API token handling (current - needs improvement)
// Currently uses localStorage - should migrate to httpOnly cookies
```

## Deployment Commands (Cloudflare)

### Wrangler Commands
```bash
# Deploy to Cloudflare Pages
npx wrangler pages deploy ./dist

# Deploy API functions
npx wrangler deploy

# Preview deployment locally
npx wrangler pages dev ./dist --local --port 8788

# Manage D1 database
npx wrangler d1 list
npx wrangler d1 info serp-checklists-db
```

## Package Manager Commands (pnpm)

### Useful pnpm Commands
```bash
# Check outdated packages
pnpm outdated

# Update all packages
pnpm update

# Install from lockfile only (CI)
pnpm install --frozen-lockfile

# Prune unused packages  
pnpm prune

# Check package sizes
pnpm list --depth=0
```

This quick reference reflects the current state of the project as of January 2025, with verified commands and actual implementation patterns. Critical security issues are flagged and should be addressed immediately.