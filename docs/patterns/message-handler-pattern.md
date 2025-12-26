# Message Handler Pattern

The message handler pattern manages communication between components, user interactions, and server operations using modern React patterns including Sonner toasts, custom hooks, and TanStack Query mutations.

**Related Files:**
- `src/hooks/useTemplateEditor.ts` - Template editing state management
- `src/hooks/useTemplateEditorState.ts` - UI state management
- `src/contexts/TemplatesContext.tsx` - Server state mutations with TanStack Query
- `src/contexts/CloudflareAuthContext.tsx` - Authentication actions
- `src/components/template-editor/SectionSidebar.tsx` - Component event handling
- `src/components/account/` - Form submission patterns

## Pattern Overview

The application uses modern React message handling patterns:
1. **Direct Prop Callbacks** - Parent-child component communication
2. **Context Actions with TanStack Query** - Server state mutations with optimistic updates
3. **Custom Hook State Management** - Complex component state logic
4. **Sonner Toast Notifications** - Simple, elegant user feedback
5. **Form Event Handling** - Direct controlled input patterns

## Implementation Patterns

### 1. Component Event Callbacks (Actual Implementation)

```typescript
// src/components/template-editor/SectionSidebar.tsx - Real event handling
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChecklistSection } from "@/types/checklist";

interface SectionSidebarProps {
  sections: ChecklistSection[];
  selectedSectionIndex: number;
  selectedItemIndex: number | null;
  onSelectSection: (sectionIndex: number) => void;
  onSelectItem: (sectionIndex: number, itemIndex: number) => void;
  onAddSection: () => void;
  onRemoveSection: (index: number) => void;
  onAddItem: (sectionIndex: number) => void;
  onRemoveItem: (sectionIndex: number, itemIndex: number) => void;
  onUpdateSection: (sectionIndex: number, field: string, value: string) => void;
  onUpdateItem: (sectionIndex: number, itemIndex: number, field: string, value: string) => void;
}

export const SectionSidebar = ({
  sections,
  selectedSectionIndex,
  selectedItemIndex,
  onSelectSection,
  onSelectItem,
  onAddSection,
  onRemoveSection,
  onAddItem,
  onRemoveItem,
  onUpdateSection,
  onUpdateItem
}: SectionSidebarProps) => {
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Inline editing handlers
  const handleSectionDoubleClick = (sectionIndex: number, currentTitle: string) => {
    setEditingSectionIndex(sectionIndex);
    setEditingValue(currentTitle || `Section ${sectionIndex + 1}`);
  };

  const handleSectionSave = (sectionIndex: number) => {
    onUpdateSection(sectionIndex, 'title', editingValue);
    setEditingSectionIndex(null);
    setEditingValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent, type: 'section' | 'item', sectionIndex: number, itemIndex?: number) => {
    if (e.key === 'Enter') {
      if (type === 'section') {
        handleSectionSave(sectionIndex);
      } else if (itemIndex !== undefined) {
        handleItemSave(sectionIndex, itemIndex);
      }
    } else if (e.key === 'Escape') {
      setEditingSectionIndex(null);
      setEditingItemIndex(null);
      setEditingValue("");
    }
  };

  return (
    <div className="sticky top-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Sections</h2>
        <Button onClick={onAddSection} size="sm" variant="outline">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="space-y-2">
        {sections.map((section, sectionIndex) => (
          <Card 
            key={section.id} 
            className={`cursor-pointer transition-colors ${
              selectedSectionIndex === sectionIndex ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between" onClick={() => {
                onSelectSection(sectionIndex);
              }}>
                <div className="flex-1 min-w-0">
                  {editingSectionIndex === sectionIndex ? (
                    <Input
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => handleSectionSave(sectionIndex)}
                      onKeyDown={(e) => handleKeyPress(e, 'section', sectionIndex)}
                      className="text-sm font-medium h-6 px-1"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <h3 
                      className="text-sm font-medium truncate cursor-pointer hover:text-primary"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleSectionDoubleClick(sectionIndex, section.title);
                      }}
                    >
                      {section.title || `Section ${sectionIndex + 1}`}
                    </h3>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 shrink-0" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSection(sectionIndex);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              
              {/* Items in this section */}
              <div className="mt-3 space-y-2">
                {section.items.map((item, itemIndex) => (
                  <div 
                    key={item.id} 
                    className={`text-sm p-3 rounded-md cursor-pointer transition-all duration-200 ${
                      selectedSectionIndex === sectionIndex && selectedItemIndex === itemIndex 
                        ? 'bg-primary text-primary-foreground shadow-sm' 
                        : 'bg-muted/50 hover:bg-muted border border-transparent hover:border-border'
                    }`} 
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectItem(sectionIndex, itemIndex);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate flex-1 font-medium">
                        {item.title || `Task ${itemIndex + 1}`}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 shrink-0" 
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveItem(sectionIndex, itemIndex);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-sm h-9 mt-2 border border-dashed" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddItem(sectionIndex);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
```

### 2. Custom Hook State Management (Actual Implementation)

```typescript
// src/hooks/useTemplateEditor.ts - Real state management hook
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
      toast.error("You must have at least one section"); // Sonner toast
      return;
    }
    
    const updatedSections = [...sections];
    updatedSections.splice(index, 1);
    setSections(updatedSections);
  };

  const addItem = (sectionIndex: number) => {
    const updatedSections = [...sections];
    updatedSections[sectionIndex].items.push({
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: "",
      contents: []
    });
    setSections(updatedSections);
  };

  const updateItem = (sectionIndex: number, itemIndex: number, field: string, value: string) => {
    const updatedSections = [...sections];
    updatedSections[sectionIndex].items[itemIndex] = {
      ...updatedSections[sectionIndex].items[itemIndex],
      [field]: value,
    };
    setSections(updatedSections);
  };

  const removeItem = (sectionIndex: number, itemIndex: number) => {
    const updatedSections = [...sections];
    updatedSections[sectionIndex].items.splice(itemIndex, 1);
    setSections(updatedSections);
  };

  const addItemContent = (sectionIndex: number, itemIndex: number, contentType: "text" | "image" | "video" | "file" | "embed" | "subItems" | "page") => {
    const updatedSections = [...sections];
    const item = updatedSections[sectionIndex].items[itemIndex];
    
    if (!item.contents) {
      item.contents = [];
    }
    
    const newContent: ChecklistItemContent = {
      id: `content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: contentType,
      value: ""
    } as ChecklistItemContent;
    
    if (contentType === "subItems") {
      newContent.subItems = [{ 
        id: `subitem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: ""
      }];
    }
    
    item.contents.push(newContent);
    setSections(updatedSections);
  };

  const updateItemContent = (
    sectionIndex: number, 
    itemIndex: number, 
    contentIndex: number, 
    value: string
  ) => {
    const updatedSections = [...sections];
    const item = updatedSections[sectionIndex].items[itemIndex];
    
    if (item.contents && item.contents[contentIndex]) {
      item.contents[contentIndex].value = value;
    }
    
    setSections(updatedSections);
  };

  return {
    sections,
    setSections,
    addSection,
    updateSection,
    removeSection,
    addItem,
    updateItem,
    removeItem,
    addItemContent,
    updateItemContent,
    // ... more methods
  };
};
```

### 3. TanStack Query Mutations (Actual Implementation)

```typescript
// src/contexts/TemplatesContext.tsx - Real mutation patterns
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export const TemplatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Create template mutation with comprehensive error handling
  const createTemplateMutation = useMutation({
    mutationFn: async (templateData: Omit<ChecklistTemplate, "id" | "userId" | "createdAt" | "updatedAt" | "slug">) => {
      if (!user) throw new Error("User must be logged in to create a template");
      
      // For now, all templates are public (can add premium check later)
      const finalIsPublic = templateData.isPublic ?? true;
      
      const result = await api.createTemplate({
        title: templateData.title,
        description: templateData.description,
        sections: templateData.sections, // Pass full sections structure
        is_public: finalIsPublic,
        categories: templateData.categories || [],
        tags: templateData.tags || []
      });
      
      return {
        id: result.id,
        title: templateData.title,
        description: templateData.description || '',
        sections: templateData.sections,
        categories: templateData.categories || [],
        tags: templateData.tags || [],
        userId: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPublic: finalIsPublic,
        slug: generateSlug(templateData.title),
        version: 1
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      toast.success("Template created successfully"); // Sonner toast
    },
    onError: (error: Error) => {
      toast.error(error.message); // Sonner error toast
    }
  });

  // Update template with related data invalidation
  const updateTemplateMutation = useMutation({
    mutationFn: async (template: ChecklistTemplate) => {
      if (!user) throw new Error("User must be logged in to update a template");
      
      console.log('Mutation - About to update template with:', {
        categories: template.categories,
        tags: template.tags,
        isPublic: template.isPublic
      });
      
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
      console.log('Update successful, invalidating queries...');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] }); // Also invalidate runs since they get updated
      toast.success("Template updated successfully - all related runs have been updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Create run from template
  const createRunMutation = useMutation({
    mutationFn: async ({ templateId, runName }: { templateId: string; runName?: string }) => {
      if (!user) throw new Error("User must be logged in to create a run");
      
      const template = allTemplates.find((t) => t.id === templateId);
      if (!template) throw new Error("Template not found");
      
      // Create a deep copy of the template sections with isCompleted set to false
      const runSections = JSON.parse(JSON.stringify(template.sections)).map((section: ChecklistSection) => ({
        ...section,
        items: section.items.map((item: ChecklistItem) => ({
          ...item,
          isCompleted: false
        }))
      }));
      
      const result = await api.createChecklist({
        template_id: templateId,
        title: runName || template.title,
        items: runSections,
        status: 'in_progress'
      });
      
      if (!result) throw new Error("Failed to create checklist run");
      
      return {
        id: result.id,
        templateId: templateId,
        title: runName || template.title,
        status: "in_progress" as const,
        progress: 0,
        sections: runSections,
        startedAt: new Date().toISOString(),
        completedAt: undefined,
        userId: user.id,
        templateVersion: template.version || 1
      };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['runs'] });
      await queryClient.refetchQueries({ queryKey: ['runs'] });
      toast.success("Checklist run created successfully");
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
    createRun: createRunMutation.mutateAsync,
    // ... other methods
  };

  return (
    <TemplatesContext.Provider value={value}>
      {children}
    </TemplatesContext.Provider>
  );
};
```

### 4. Sonner Toast Notifications (Actual Implementation)

```typescript
// Using Sonner throughout the application - much simpler than custom toast
import { toast } from "sonner";

// In components and hooks - simple, elegant notifications
toast.success("Template created successfully");
toast.error("Failed to save template");
toast.info("Processing your request...");
toast.warning("This action cannot be undone");

// In src/pages/Account.tsx - Real usage examples
const handleProfileUpdate = async () => {
  if (!user) return;

  // Validation with error toast
  if (profileData.username && profileData.username.length < 3) {
    toast.error('Username must be at least 3 characters long');
    return;
  }
  if (profileData.username && !/^[a-zA-Z0-9]+$/.test(profileData.username)) {
    toast.error('Username can only contain letters and numbers');
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

    // Success notification
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

// In hooks/useTemplateEditor.ts - Simple error feedback
const removeSection = (index: number) => {
  if (sections.length === 1) {
    toast.error("You must have at least one section");
    return;
  }
  
  const updatedSections = [...sections];
  updatedSections.splice(index, 1);
  setSections(updatedSections);
};

// In context mutations - consistent success/error patterns
const createTemplateMutation = useMutation({
  mutationFn: async (templateData) => {
    // ... mutation logic
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    toast.success("Template created successfully");
  },
  onError: (error: Error) => {
    toast.error(error.message);
  }
});

const deleteRunMutation = useMutation({
  mutationFn: async (id: string) => {
    await api.deleteChecklist(id);
    return true;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['runs'] });
    toast.success("Checklist run deleted successfully");
  },
  onError: (error: Error) => {
    console.error('Delete run error:', error);
    toast.error(error.message === 'Checklist not found or unauthorized' 
      ? 'Unable to delete this checklist. It may have already been deleted.'
      : `Failed to delete checklist: ${error.message}`);
  }
});
```

### 5. Form Input Event Handling (Actual Implementation)

```typescript
// src/components/template-editor/TemplateBasicInfo.tsx - Real form handling
import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { toast } from 'sonner';

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
  // Tag input handling with Enter key
  const handleTagKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      e.preventDefault();
      const newTag = e.currentTarget.value.trim();
      if (!tags.includes(newTag)) {
        onTagsChange([...tags, newTag]);
      } else {
        toast.error('Tag already exists');
      }
      e.currentTarget.value = '';
    }
  };

  // Category input handling
  const handleCategoryKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      e.preventDefault();
      const newCategory = e.currentTarget.value.trim();
      if (!categories.includes(newCategory)) {
        onCategoriesChange([...categories, newCategory]);
      } else {
        toast.error('Category already exists');
      }
      e.currentTarget.value = '';
    }
  };

  const removeTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove));
  };

  const removeCategory = (categoryToRemove: string) => {
    onCategoriesChange(categories.filter(cat => cat !== categoryToRemove));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
        <CardDescription>Configure your template's basic details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Title Field with validation */}
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

        {/* Category Input with Enter key handling */}
        <div className="space-y-2">
          <Label>Categories</Label>
          <Input
            placeholder="Add categories (press Enter after each category)"
            onKeyPress={handleCategoryKeyPress}
          />
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categories.map((category, index) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1">
                  {category}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => removeCategory(category)}
                  />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Tags Section with dynamic management */}
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

        {/* Visibility Toggle with conditional logic */}
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

### 6. Authentication Event Handlers (Actual Implementation)

```typescript
// src/contexts/CloudflareAuthContext.tsx - Real auth event handling
import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<unknown | null>(null);

  const isAuthenticated = !!user;

  // Initialize auth state on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      setSession({ token });
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

  // Login event handler with proper error handling
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

  // Registration event handler
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

  // Logout event handler with cleanup
  const logout = () => {
    api.logout(); // Clears token from API client and localStorage
    setUser(null);
    setSession(null);
  };

  // Profile refresh handler
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
```

## Message Flow Patterns (Real Implementation)

### User Action → Custom Hook → Context Mutation → Server → Toast
```typescript
// Real flow from the application
1. User clicks save button in TemplateEditor
2. handleSave called from useTemplateSave hook
3. updateTemplate mutation triggered in TemplatesContext
4. API request sent via api.updateTemplate()
5. onSuccess: queryClient.invalidateQueries() + toast.success()
6. onError: toast.error() with specific message
```

### Form Input → Validation → State Update
```typescript
// Real form handling flow
1. User types in input field
2. onChange handler called immediately
3. State updated via custom hook (useTemplateEditor)
4. UI re-renders with new value
5. Validation runs on blur/submit
6. Error state shown with toast.error() if invalid
```

### Component Interaction → Event Callback → State Update
```typescript
// Real component communication flow
1. User double-clicks section title in SectionSidebar
2. handleSectionDoubleClick sets editing state
3. Input field appears with autoFocus
4. User presses Enter or clicks outside
5. handleSectionSave calls onUpdateSection prop
6. Parent updates state via custom hook
7. Component re-renders with new title
```

## Best Practices (From Actual Implementation)

1. **Use Sonner for simple, elegant notifications** - toast.success(), toast.error()
2. **Extract complex logic into custom hooks** - useTemplateEditor, useTemplateEditorState
3. **Use TanStack Query for server state mutations** - automatic loading/error states
4. **Handle errors at multiple levels** - API client, mutations, and component level
5. **Provide immediate UI feedback** - Loading spinners, optimistic updates
6. **Use proper TypeScript interfaces** - Type all props and event handlers
7. **Validate user input with helpful messages** - Toast errors for validation failures
8. **Keep event handlers simple and focused** - Delegate complex logic to hooks
9. **Use controlled components for forms** - Direct state management, no complex form libs

## Common Patterns (From Actual Code)

### Input Validation with Immediate Feedback
```typescript
// Real validation from Account.tsx
const handleProfileUpdate = async () => {
  if (!user) return;

  // Immediate validation with toast feedback
  if (profileData.username && profileData.username.length < 3) {
    toast.error('Username must be at least 3 characters long');
    return;
  }
  if (profileData.username && !/^[a-zA-Z0-9]+$/.test(profileData.username)) {
    toast.error('Username can only contain letters and numbers');
    return;
  }
  
  // Proceed with update...
};
```

### Loading States with Visual Feedback
```typescript
// Real loading pattern from components
{isSaving ? (
  <Loader2 className="h-4 w-4 animate-spin" />
) : (
  'Save'
)}

// Page-level loading
if (isLoading) {
  return (
    <div className="flex h-52 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
```

### Error Handling with Recovery Options
```typescript
// Real error handling from TemplatesContext
const deleteRunMutation = useMutation({
  mutationFn: async (id: string) => {
    await api.deleteChecklist(id);
    return true;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['runs'] });
    toast.success("Checklist run deleted successfully");
  },
  onError: (error: Error) => {
    console.error('Delete run error:', error);
    // Specific error message based on error type
    toast.error(error.message === 'Checklist not found or unauthorized' 
      ? 'Unable to delete this checklist. It may have already been deleted.'
      : `Failed to delete checklist: ${error.message}`);
  }
});
```

### Keyboard Event Handling
```typescript
// Real keyboard handling from SectionSidebar
const handleKeyPress = (e: React.KeyboardEvent, type: 'section' | 'item', sectionIndex: number, itemIndex?: number) => {
  if (e.key === 'Enter') {
    if (type === 'section') {
      handleSectionSave(sectionIndex);
    } else if (itemIndex !== undefined) {
      handleItemSave(sectionIndex, itemIndex);
    }
  } else if (e.key === 'Escape') {
    setEditingSectionIndex(null);
    setEditingItemIndex(null);
    setEditingValue("");
  }
};
```

## Architecture Summary

The message handler pattern uses:
- **Sonner Toasts** - Simple, elegant user notifications
- **Custom Hooks** - Business logic separation and state management
- **TanStack Query Mutations** - Server state updates with automatic error handling
- **Direct Event Callbacks** - Parent-child component communication
- **Controlled Components** - Direct form input management
- **TypeScript Interfaces** - Type-safe event handlers and payloads
- **Loading States** - Visual feedback for async operations
- **Error Boundaries** - Comprehensive error handling at multiple levels

## See Also:
- [Data Service Pattern](./data-service-pattern.md) - Server state management patterns
- [Component Pattern](./component-pattern.md) - Component structure and organization
- [Tab Creation Pattern](./tab-creation-pattern.md) - Navigation and tab patterns