# Code Standards and Conventions

## TypeScript Configuration

### Current TypeScript Config
The project uses TypeScript with relaxed configuration settings for development flexibility:
- `noImplicitAny: false` - Allows implicit any types
- `noUnusedParameters: false` - Permits unused function parameters
- `strictNullChecks: false` - Relaxed null checking
- `skipLibCheck: true` - Skips type checking of declaration files
- Path mapping: `@/*` points to `./src/*`, `@functions/*` to `./functions/*`

### Type Definitions
- **Location**: Main types in `/src/types/checklist.ts` and `/src/types/page.ts`
- **Schema Location**: Zod schemas in `/src/lib/schemas/checklistSchema.ts`
- **Naming**: PascalCase for types and interfaces
- **Export**: Always export types that are used across files

```typescript
// Good
export interface Template {
  id: string;
  title: string;
  sections: Section[];
}

// Avoid
interface template {  // Wrong case
  ID: string;        // Inconsistent naming
}
```

### Current Type Usage
The project uses both interfaces and type aliases based on actual implementation:

```typescript
// From src/types/checklist.ts - Interface for objects
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

// Type for content unions (from checklistSchema.ts)
type ChecklistItemContent = 
  | { type: 'text'; value: string }
  | { type: 'image'; value: string; uploadType?: 'url' | 'upload'; fileName?: string; fileSize?: number }
  | { type: 'video'; value: string; uploadType?: 'url' | 'upload' }
  | { type: 'file'; value: string; uploadType?: 'url' | 'upload'; fileName?: string; fileSize?: number }
  | { type: 'embed'; value: string }
  | { type: 'subItems'; value: string; subItems?: ChecklistSubItem[] }
  | { type: 'page'; value: string; pageId?: string };
```

### Component Props
- Always define props interface with descriptive name
- Use `Props` suffix for component prop interfaces

```typescript
interface TemplateCardProps {
  template: Template;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

export function TemplateCard({ 
  template, 
  onEdit, 
  onDelete,
  className 
}: TemplateCardProps) {
  // Component implementation
}
```

## React Component Standards

### Actual File Organization Pattern (from codebase analysis)
```typescript
// 1. React imports first
import React, { useState, useEffect } from 'react';

// 2. Third-party library imports
import { useQuery } from '@tanstack/react-query';
import { Trash2, Edit } from 'lucide-react';

// 3. Internal component imports (using @/ alias)
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// 4. Hook and context imports
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { useToast } from '@/hooks/use-toast';

// 5. Type imports (often at the end)
import type { Template } from '@/types/checklist';

// 6. Component Props Interface
interface ComponentProps {
  template: Template;
  onEdit?: (id: string) => void;
  className?: string;
}

// 7. Component Implementation
export function Component({ template, onEdit, className }: ComponentProps) {
  // Hooks at the top
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Event handlers
  const handleEdit = () => {
    onEdit?.(template.id);
  };
  
  // Render
  return (
    <Card className={className}>
      {/* Component JSX */}
    </Card>
  );
}
```

### Component Naming (Current Implementation)
- **Files**: PascalCase for components (`TemplateEditor.tsx`, `ChecklistRun.tsx`, `ContentRenderer.tsx`)
- **Exports**: Consistently uses named exports throughout codebase
- **UI Components**: Located in `/src/components/ui/` using lowercase filenames (`button.tsx`, `card.tsx`)
- **Feature Components**: Organized by feature in subdirectories (e.g., `/template-editor/`, `/checklist/`)

```typescript
// Current pattern (consistently used)
export function TemplateEditor() { }
export const ContentRenderer: React.FC<Props> = ({ ... }) => { };

// UI components pattern
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // Implementation
  }
);
```

### Hooks Rules
- Custom hooks start with `use` prefix
- Place hooks at the top of components
- Follow Rules of Hooks

```typescript
// Custom hook (from actual codebase)
export function useTemplateEditor(templateId: string) {
  const [template, setTemplate] = useState<Template>();
  const [isLoading, setIsLoading] = useState(false);
  
  // Hook logic
  return { template, setTemplate, isLoading };
}
```

## State Management Standards

### Current Context Implementation
The project uses two main contexts with the following patterns:

```typescript
// From src/contexts/CloudflareAuthContext.tsx
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<unknown | null>(null);

  // Auth methods implementation
  const login = async (email: string, password: string): Promise<boolean> => {
    // Implementation using api.login()
  };

  // NOTE: Context value is NOT memoized (performance opportunity)
  return (
    <AuthContext.Provider value={{
      user, session, isAuthenticated: !!user, isLoading,
      login, register, signInWithOAuth, signInWithMagicLink, logout, refreshProfile
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

### Templates Context
```typescript
// From src/contexts/TemplatesContext.tsx  
// Manages templates, checklists, and current run state
// ISSUE: Creates template data loses section structure (flattens to items array)
const items = templateData.sections.flatMap(section => 
  section.items.map(item => ({
    id: item.id,
    title: item.title,
    completed: false
  }))
);
```

### React Query Usage
**Current Status**: React Query is installed (`@tanstack/react-query`) but NOT extensively used in the current implementation. Most state management is done through custom contexts.

```typescript
// Installed but minimal usage patterns found
// Main usage is in the provider setup in main.tsx

// For future implementation, recommended patterns:
const { data, isLoading, error } = useQuery({
  queryKey: ['templates', userId],
  queryFn: () => api.getTemplates(userId),
  staleTime: 5 * 60 * 1000,
});

// Current approach uses direct API calls in contexts
// Example from TemplatesContext:
const result = await api.createTemplate(templateData);
setTemplates(prev => [...prev, result]);
```

## API Standards

### Current API Client Implementation
```typescript
// From src/lib/api.ts - Singleton pattern
class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || '/api';
    // Token loaded from localStorage (security concern noted in enhancements)
    this.authToken = localStorage.getItem('auth_token');
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
        ...options.headers,
      },
    };

    const response = await fetch(url, config);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error ${response.status}: ${error}`);
    }

    return response.json();
  }

  // Current API methods include:
  // login, register, getTemplates, createTemplate, updateTemplate, 
  // deleteTemplate, getPublicTemplates, createChecklistRun, etc.
}

// Exported as singleton
export const api = new ApiClient();
```

### Error Handling
```typescript
try {
  const data = await api.getTemplate(id);
  return data;
} catch (error) {
  console.error('Failed to fetch template:', error);
  toast({
    title: 'Error',
    description: 'Failed to load template',
    variant: 'destructive',
  });
  return null;
}
```

## Styling Standards

### Current Tailwind CSS Implementation
The project uses Tailwind CSS extensively with shadcn/ui component library:

```typescript
// From src/lib/utils.ts - Current utility implementation
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Common usage pattern found throughout components:
<Card className={cn(
  "p-6 hover:shadow-lg transition-shadow",
  isSelected && "ring-2 ring-primary",
  className
)}>

// Button variants from src/components/ui/button-variants.ts
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
```

### Component Variants
```typescript
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">Ghost</Button>
```

## File and Folder Naming

### Current Directory Structure
```
src/
├── components/                    # 94 React components total
│   ├── ui/                       # 50+ shadcn/ui components (lowercase files)
│   ├── template-editor/          # Template editor components (PascalCase)
│   ├── checklist/               # Checklist run components
│   ├── shared/                  # Shared utility components
│   ├── auth/                    # Authentication components
│   ├── checklist-library/       # Library browsing components
│   ├── account/                 # Account management
│   └── [feature]/               # Other feature-specific folders
├── hooks/                       # 12 custom hooks (camelCase files)
├── pages/                       # 15 page components (PascalCase)
├── lib/                         # Core utilities and API client
│   ├── schemas/                 # Zod validation schemas
│   ├── utils/                   # Utility functions
│   └── api/                     # API client implementation
├── contexts/                    # 2 React contexts (Auth, Templates)
├── types/                       # TypeScript definitions (2 main files)
├── utils/                       # Helper utilities
└── api/                         # Legacy API routes (replaced by functions/)
```

### Import Conventions
```typescript
// Order of imports
// 1. React/Next
import React, { useState } from 'react';

// 2. Third-party libraries
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

// 3. Internal - absolute imports with @/
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/CloudflareAuthContext';

// 4. Relative imports
import { localHelper } from './helpers';

// 5. Types
import type { Template } from '@/types/checklist';
```

## Form Handling Standards

### React Hook Form + Zod
```typescript
// 1. Define schema (from checklistSchema.ts)
const templateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
});

// 2. Infer type from schema
type FormData = z.infer<typeof templateSchema>;

// 3. Use in component
const form = useForm<FormData>({
  resolver: zodResolver(templateSchema),
  defaultValues: {
    title: '',
    description: '',
  },
});

// 4. Handle submission
const onSubmit = async (data: FormData) => {
  try {
    await api.createTemplate(data);
    toast({ title: 'Success' });
  } catch (error) {
    toast({ title: 'Error', variant: 'destructive' });
  }
};
```

## Testing Standards

### Current Test Setup
- **Framework**: Vitest (configured in `vitest.config.ts`)
- **Test Files**: 10 test files found using `*.test.ts` and `*.test.tsx` pattern
- **Location**: Centralized in `/tests/` directory with structure mirroring source

### Current Test Structure (from existing tests)
```typescript
// From tests/unit/api/routes/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('Auth API Routes', () => {
  beforeEach(() => {
    // Setup code
  });

  describe('POST /auth/login', () => {
    it('should authenticate user with valid credentials', async () => {
      // Test implementation
    });
  });
});

// From tests/unit/contexts/TemplatesContext.test.ts
describe('TemplatesContext', () => {
  it('should initialize with empty templates', () => {
    // Test implementation
  });
});
```

### Test Coverage Areas (Current)
- API routes (auth, templates)
- Context providers
- Utility functions (URL helpers, template backup)
- Page components (ChecklistLibrary, PublicTemplate)
- Schema validation

## Performance Standards

### Memoization
```typescript
// Memoize expensive computations
const expensiveValue = useMemo(
  () => computeExpensive(data),
  [data]
);

// Memoize callbacks
const handleClick = useCallback(
  (id: string) => {
    // Handle click
  },
  [dependency]
);

// Memoize components
const MemoizedComponent = memo(Component);
```

### Code Splitting
```typescript
// Lazy load pages
const TemplateEditor = lazy(() => import('@/pages/TemplateEditor'));

// Use with Suspense
<Suspense fallback={<LoadingSpinner />}>
  <TemplateEditor />
</Suspense>
```

## Security Standards

### Current Implementation Status

**⚠️ CRITICAL SECURITY ISSUES IDENTIFIED:**

1. **XSS Vulnerability**: HTML content is rendered with `dangerouslySetInnerHTML` WITHOUT sanitization in:
   - `src/components/shared/ContentRenderer.tsx`
   - `src/pages/ChecklistRun.tsx`
   - `src/components/ui/chart.tsx`

2. **Token Storage**: JWT tokens stored in localStorage (vulnerable to XSS)
   - Location: `src/contexts/CloudflareAuthContext.tsx`
   - Should use httpOnly cookies instead

3. **No DOMPurify**: DOMPurify is not installed or used for HTML sanitization

### Input Validation (Current)
```typescript
// Zod schemas are implemented in src/lib/schemas/checklistSchema.ts
import { z } from 'zod';

const checklistTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  sections: z.array(checklistSectionSchema),
  userId: z.string(),
  // ... other fields
});

// Validation functions available:
export const validateTemplate = (data: unknown): ChecklistTemplate => {
  return checklistTemplateSchema.parse(data);
};
```

### Required Security Fixes
```bash
# Install DOMPurify
pnpm add dompurify
pnpm add -D @types/dompurify

# Update ContentRenderer to sanitize HTML
import DOMPurify from 'dompurify';
const sanitizedHtml = DOMPurify.sanitize(content.value);
```

### Authentication
- Store tokens securely (httpOnly cookies preferred)
- Include auth checks in protected routes
- Never log sensitive data

```typescript
// Protected route pattern (from RequireAuth.tsx)
function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" />;
  
  return children;
}
```

## ESLint Configuration

### Current ESLint Setup
The project uses modern ESLint flat config with TypeScript support:

```javascript
// From eslint.config.js
export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off", // Disabled for development
    },
  },
  // Special rules for UI components and contexts
  {
    files: ["**/components/ui/*.{ts,tsx}", "**/contexts/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // Relaxed rules for test files
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-this-alias": "off",
    },
  }
);
```

## Git Commit Standards

### Commit Message Format
```
type(scope): description

[optional body]

[optional footer]
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Testing
- `chore`: Maintenance

### Examples
```
feat(templates): add template duplication
fix(auth): resolve token refresh issue
docs(readme): update installation steps
```

## Environment Variables

### Current Configuration
```typescript
// From src/lib/api.ts
const apiUrl = import.meta.env.VITE_API_URL || '/api';

// From wrangler.toml (server-side)
[vars]
JWT_SECRET = "YOUR_JWT_SECRET_HERE"

// Database binding
[[d1_databases]]
binding = "DB"
database_name = "serp-checklists-db"
```

### Environment Setup
The project uses:
- **Vite** for client-side environment variables (prefix with `VITE_`)
- **Cloudflare Workers** for server-side configuration (wrangler.toml)
- **D1 Database** binding for database access

### Current Variables
```env
# Client-side (should be in .env.local)
VITE_API_URL=http://localhost:8788/api  # Development API URL

# Server-side (in wrangler.toml)
JWT_SECRET=your_jwt_secret_here

# Database
DATABASE_NAME=serp-checklists-db
```

## Error Boundary Standards

```typescript
class ErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error boundary caught:', error, info);
    // Log to error reporting service
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

## Accessibility Standards

### ARIA Labels
```typescript
<button
  aria-label="Delete template"
  aria-pressed={isActive}
  aria-describedby="delete-description"
>
  <Trash2 className="h-4 w-4" />
</button>
```

### Keyboard Navigation
```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  switch (e.key) {
    case 'Enter':
    case ' ':
      e.preventDefault();
      handleSelect();
      break;
    case 'Escape':
      handleClose();
      break;
  }
};
```

### Focus Management
```typescript
useEffect(() => {
  if (isOpen) {
    inputRef.current?.focus();
  }
}, [isOpen]);
```