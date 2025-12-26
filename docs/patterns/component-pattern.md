# Component Pattern

The application follows a consistent React component pattern with TypeScript, utilizing hooks, proper prop typing, and composition. Components are built using shadcn/ui as the base UI library with custom implementations on top.

**Related Files:**
- `src/components/ui/` - shadcn/ui base components (Radix UI primitives)
- `src/components/shared/` - Reusable application components
- `src/components/template-editor/` - Template editor specific components
- `src/components/checklist-library/` - Library browse components
- `src/components/account/` - Account management components
- `src/pages/` - Page-level route components
- `src/hooks/` - Custom React hooks for business logic

## Pattern Overview

Components are organized into:
1. **UI Components** - shadcn/ui base components (Radix UI primitives with Tailwind styling)
2. **Shared Components** - App-specific reusable components (LoadingSpinner, EmptyState, etc.)
3. **Feature Components** - Feature-specific components grouped by domain
4. **Page Components** - Route-level components that compose features
5. **Custom Hooks** - Business logic extracted into reusable hooks

## Component Structure

### Basic Component Template

```typescript
// src/components/checklist-library/TemplateCard.tsx - Real example from codebase
import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserInfo } from "@/components/shared/UserInfo";
import { ChecklistSection } from "@/lib/schemas/checklistSchema";

// 1. Define props interface with actual types
interface Template {
  id: string;
  title: string;
  description: string | null;
  sections: ChecklistSection[];
  categories: string[];
  slug: string | null;
  user_id: string;
}

interface TemplateCardProps {
  template: Template;
  viewMode: "grid" | "list";
  onTemplateClick: (template: Template) => void;
}

// 2. Component implementation with actual patterns
export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  viewMode,
  onTemplateClick,
}) => {
  // 3. React Router navigation
  const navigate = useNavigate();
  
  // 4. Event handlers with proper event handling
  const handleCategoryClick = (e: React.MouseEvent, category: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/checklists/category/${encodeURIComponent(category)}`);
  };
  
  // 5. Computed values
  const totalItems = template.sections.reduce(
    (count: number, section) => count + section.items.length, 
    0
  );
  
  // 6. Conditional rendering based on view mode
  if (viewMode === "list") {
    return (
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
        onClick={() => onTemplateClick(template)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg line-clamp-1 mb-1">
                {template.title}
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                {template.description || "No description provided"}
              </p>
              {template.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {template.categories.slice(0, 4).map((cat) => (
                    <a
                      key={cat}
                      href={`/checklists/category/${encodeURIComponent(cat)}`}
                      onClick={(e) => handleCategoryClick(e, cat)}
                      className="hover:opacity-80 transition-opacity"
                    >
                      <Badge variant="secondary" className="text-xs cursor-pointer">
                        {cat}
                      </Badge>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // 7. Default grid view render
  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onTemplateClick(template)}
    >
      <CardHeader>
        <CardTitle className="line-clamp-2">{template.title}</CardTitle>
        <CardDescription className="line-clamp-3">
          {template.description || "No description provided"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{template.sections.length} sections</span>
            <span>{totalItems} items</span>
          </div>
          <UserInfo userId={template.user_id} />
        </div>
      </CardContent>
    </Card>
  );
};
```

## Component Patterns

### 1. Custom Hook Pattern (Primary Pattern)

```typescript
// src/hooks/useTemplateEditor.ts - Business logic in custom hooks
import { useState } from "react";
import { ChecklistSection, ChecklistItem, ChecklistItemContent } from "@/types/checklist";
import { toast } from "sonner";

export const useTemplateEditor = (initialSections: ChecklistSection[] = []) => {
  const [sections, setSections] = useState<ChecklistSection[]>(initialSections);

  const addSection = () => {
    setSections([
      ...sections,
      {
        id: `section_${Date.now()}`,
        title: "",
        items: [],
      },
    ]);
  };

  const updateSection = (index: number, field: string, value: string) => {
    const updatedSections = [...sections];
    updatedSections[index] = { ...updatedSections[index], [field]: value };
    setSections(updatedSections);
  };

  const removeSection = (index: number) => {
    if (sections.length === 1) {
      toast.error("You must have at least one section");
      return;
    }
    
    const updatedSections = [...sections];
    updatedSections.splice(index, 1);
    setSections(updatedSections);
  };

  // ... more methods

  return {
    sections,
    setSections,
    addSection,
    updateSection,
    removeSection,
    addItem,
    updateItem,
    removeItem,
    // ... more methods
  };
};

// Used in components like TemplateEditor.tsx
const {
  sections,
  addSection,
  updateSection,
  removeSection,
  // ...
} = useTemplateEditor();
```

### 2. shadcn/ui Compound Component Pattern (Actual Implementation)

```typescript
// src/components/ui/card.tsx - Real shadcn/ui implementation
import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }

// Usage in components
<Card className="cursor-pointer hover:shadow-md transition-shadow">
  <CardHeader>
    <CardTitle className="line-clamp-2">{template.title}</CardTitle>
    <CardDescription className="line-clamp-3">
      {template.description || "No description provided"}
    </CardDescription>
  </CardHeader>
  <CardContent>
    {/* Card content */}
  </CardContent>
</Card>
```

### 3. Context + TanStack Query Pattern (Actual Implementation)

```typescript
// src/contexts/TemplatesContext.tsx - Real data fetching pattern
import React, { createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

const TemplatesContext = createContext<TemplatesContextProps | undefined>(undefined);

export const TemplatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch templates with React Query
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
              // Legacy format - wrap in single section
              const parsedItems = typeof template.items === 'string' ? JSON.parse(template.items) : template.items;
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
          version: template.version || 1
        }));

        return transformedTemplates;
      } catch (error) {
        console.error('Error fetching templates:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create mutation with optimistic updates
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
      toast.success("Template created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const value = {
    templates,
    createTemplate: createTemplateMutation.mutateAsync,
    // ... other methods
  };

  return (
    <TemplatesContext.Provider value={value}>
      {children}
    </TemplatesContext.Provider>
  );
};

// Usage in components
const { templates, createTemplate } = useTemplates();
```

### 4. RequireAuth Component Pattern (Actual Implementation)

```typescript
// src/components/RequireAuth.tsx - Route protection pattern
import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      // Save the attempted location for redirect after login
      navigate('/login', { 
        state: { from: location },
        replace: true 
      });
    }
  }, [user, isLoading, navigate, location]);

  if (isLoading) {
    return (
      <div className="flex h-52 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

// Used in routing configuration
<Route path="/templates" element={
  <RequireAuth>
    <Templates />
  </RequireAuth>
} />
```

### 5. State Management Hook Pattern (Actual Implementation)

```typescript
// src/hooks/useTemplateEditorState.ts - Complex state management
import { useState } from "react";

interface ValidationError {
  field: string;
  message: string;
}

export const useTemplateEditorState = () => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoUrl, setSeoUrl] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [showingSEO, setShowingSEO] = useState(false);
  const [showingTemplateInfo, setShowingTemplateInfo] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const handleSelectSection = (sectionIndex: number) => {
    setSelectedSectionIndex(sectionIndex);
    setSelectedItemIndex(null);
    setShowingSEO(false);
    setShowingTemplateInfo(false);
  };

  const handleSelectItem = (sectionIndex: number, itemIndex: number) => {
    setSelectedSectionIndex(sectionIndex);
    setSelectedItemIndex(itemIndex);
    setShowingSEO(false);
    setShowingTemplateInfo(false);
  };

  const handleSelectSEO = () => {
    setShowingSEO(true);
    setShowingTemplateInfo(false);
    setSelectedItemIndex(null);
  };

  const handleSelectTemplateInfo = () => {
    setShowingTemplateInfo(true);
    setShowingSEO(false);
    setSelectedItemIndex(null);
  };

  return {
    // State
    title,
    setTitle,
    description,
    setDescription,
    seoTitle,
    setSeoTitle,
    seoDescription,
    setSeoDescription,
    seoUrl,
    setSeoUrl,
    categories,
    setCategories,
    tags,
    setTags,
    selectedSectionIndex,
    selectedItemIndex,
    showingSEO,
    showingTemplateInfo,
    errors,
    setErrors,
    // Actions
    handleSelectSection,
    handleSelectItem,
    handleSelectSEO,
    handleSelectTemplateInfo,
  };
};

// Used in TemplateEditor.tsx
const {
  title,
  setTitle,
  description,
  setDescription,
  selectedSectionIndex,
  handleSelectSection,
  // ... other state and actions
} = useTemplateEditorState();
```

## Form Components

### Direct Input Control Pattern (Actual Implementation)

```typescript
// src/components/template-editor/TemplateBasicInfo.tsx - Real form pattern
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface TemplateBasicInfoProps {
  title: string;
  description: string;
  categories: string[];
  tags: string[];
  isPublic: boolean;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onCategoriesChange: (categories: string[]) => void;
  onTagsChange: (tags: string[]) => void;
  onPublicChange: (isPublic: boolean) => void;
  errors: ValidationError[];
  isPremiumUser: boolean;
}

export const TemplateBasicInfo: React.FC<TemplateBasicInfoProps> = ({
  title,
  description,
  categories,
  tags,
  isPublic,
  onTitleChange,
  onDescriptionChange,
  onCategoriesChange,
  onTagsChange,
  onPublicChange,
  errors,
  isPremiumUser
}) => {
  // Tag input handling
  const handleTagKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      e.preventDefault();
      const newTag = e.currentTarget.value.trim();
      if (!tags.includes(newTag)) {
        onTagsChange([...tags, newTag]);
      }
      e.currentTarget.value = '';
    }
  };

  const removeTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
        <CardDescription>Configure your template's basic details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Title Field */}
        <div className="space-y-2">
          <Label htmlFor="title">Template Title *</Label>
          <Input
            id="title"
            placeholder="Enter template title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className={errors.find(e => e.field === 'title') ? 'border-destructive' : ''}
          />
          {errors.find(e => e.field === 'title') && (
            <p className="text-sm text-destructive">
              {errors.find(e => e.field === 'title')?.message}
            </p>
          )}
        </div>

        {/* Description Field */}
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Describe what this template helps with..."
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={3}
          />
        </div>

        {/* Tags Section */}
        <div className="space-y-2">
          <Label>Tags</Label>
          <Input
            placeholder="Add tags (press Enter after each tag)"
            onKeyPress={handleTagKeyPress}
          />
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, index) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => removeTag(tag)}
                  />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Visibility Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Public Template</Label>
            <p className="text-sm text-muted-foreground">
              {isPremiumUser 
                ? "Make this template visible in the public library" 
                : "Free users can only create public templates"}
            </p>
          </div>
          <Switch
            checked={isPublic}
            onCheckedChange={onPublicChange}
            disabled={!isPremiumUser}
          />
        </div>
      </CardContent>
    </Card>
  );
};
```

## Loading States

### Simple Loading Spinner Pattern (Actual Implementation)

```typescript
// src/components/shared/LoadingSpinner.tsx - Real loading component
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = ({ size = 'default' }: { size?: 'small' | 'default' | 'large' }) => {
  const sizeClass = {
    small: 'h-4 w-4',
    default: 'h-8 w-8',
    large: 'h-12 w-12'
  }[size];

  return (
    <div className="flex items-center justify-center p-4">
      <Loader2 className={`animate-spin text-primary ${sizeClass}`} />
    </div>
  );
};

// src/components/shared/LoadingSkeleton.tsx - Skeleton for cards
export const LoadingSkeleton = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="border rounded-lg p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-4"></div>
          <div className="flex justify-between text-sm">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            <div className="h-4 bg-gray-200 rounded w-16"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Usage in pages
export default function ChecklistLibrary() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingSkeleton />
      </div>
    );
  }

  // In components with conditional loading
  {isSaving ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    'Save'
  )}
}
```

## Error Boundaries

```typescript
// src/components/ErrorBoundary.tsx - Real implementation with shadcn/ui
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Log to console for debugging
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2">
                <Button onClick={this.handleReset} variant="outline" className="w-full">
                  Try Again
                </Button>
                <Button onClick={this.handleRefresh} className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Page
                </Button>
              </div>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4 p-3 bg-muted rounded text-xs">
                  <summary className="cursor-pointer font-medium">Error Details</summary>
                  <pre className="mt-2 overflow-auto">
                    {this.state.error.message}
                    {'\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage in App.tsx
<ErrorBoundary>
  <Router>
    <Routes>
      <Route path="/" element={<Layout />}>
        {/* Routes */}
      </Route>
    </Routes>
  </Router>
</ErrorBoundary>
```

## Best Practices (Based on Actual Implementation)

1. **Always type component props** with TypeScript interfaces - Used consistently throughout
2. **Use custom hooks for business logic** - useTemplateEditor, useTemplateEditorState patterns
3. **Leverage shadcn/ui components** - Consistent design system with Tailwind classes
4. **Extract state management into contexts** - TemplatesContext with TanStack Query
5. **Handle loading states with simple spinners** - LoadingSpinner component for consistent UX
6. **Use Sonner for toast notifications** - Simple toast.success(), toast.error() calls
7. **Implement proper error boundaries** - Comprehensive error handling with user-friendly UI
8. **Use direct form control** - Simple controlled inputs rather than complex form libraries
9. **Organize components by domain** - template-editor/, checklist-library/, account/ folders
10. **Leverage React Router for navigation** - useNavigate() for programmatic navigation

## Component Testing (Actual Test Structure)

```typescript
// tests/unit/pages/ChecklistLibrary.test.tsx - Real test example
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChecklistLibrary from '@/pages/ChecklistLibrary';
import { TemplatesProvider } from '@/contexts/TemplatesContext';
import { AuthProvider } from '@/contexts/CloudflareAuthContext';

// Mock the API
jest.mock('@/lib/api', () => ({
  api: {
    getTemplates: jest.fn().mockResolvedValue([]),
  },
}));

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TemplatesProvider>
            {component}
          </TemplatesProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

describe('ChecklistLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the checklist library page', async () => {
    renderWithProviders(<ChecklistLibrary />);
    
    expect(screen.getByText('Checklist Library')).toBeInTheDocument();
    expect(screen.getByText('Browse and discover templates')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderWithProviders(<ChecklistLibrary />);
    
    // Check for loading skeleton or spinner
    expect(screen.getByText(/loading/i) || document.querySelector('.animate-pulse')).toBeTruthy();
  });
});

// tests/unit/contexts/TemplatesContext.test.ts - Context testing
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplatesProvider, useTemplates } from '@/contexts/TemplatesContext';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
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
  it('provides templates context', async () => {
    const { result } = renderHook(() => useTemplates(), { wrapper });
    
    await waitFor(() => {
      expect(result.current.templates).toBeDefined();
      expect(typeof result.current.createTemplate).toBe('function');
    });
  });
});
```

## Architecture Summary

The codebase uses a modern React architecture with:
- **shadcn/ui** for consistent, accessible components
- **Custom hooks** for business logic separation
- **TanStack Query** for server state management
- **React Router** for navigation
- **Sonner** for toast notifications
- **TypeScript** for type safety
- **Tailwind CSS** for styling

## See Also:
- [Data Service Pattern](./data-service-pattern.md) - TanStack Query + API client patterns
- [Message Handler Pattern](./message-handler-pattern.md) - Event handling and notifications
- [Tab Creation Pattern](./tab-creation-pattern.md) - Navigation and tab implementations