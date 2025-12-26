# Recipe: Add Message Handler

This recipe guides you through adding message handlers and event handling patterns using real implementation examples from the codebase.

**Related Files:**
- `/Users/devin/repos/projects/serp-checklists/src/contexts/TemplatesContext.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/hooks/useTemplateSave.ts`
- `/Users/devin/repos/projects/serp-checklists/src/pages/Account.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/pages/Register.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/components/ui/sonner.tsx`

## Steps

### 1. Form Submit Handler (Real Pattern from Register.tsx)

The codebase uses a consistent pattern for form submission with validation and error handling:

```typescript
// Real implementation from src/pages/Register.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function RegistrationForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Client-side validation
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await register(name, email, password);
      if (success) {
        toast.success("Registration successful");
        navigate("/dashboard");
      } else {
        toast.error("Registration failed. Email might already be in use.");
      }
    } catch (error) {
      toast.error("An error occurred during registration");
      console.error("Registration error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input 
          id="name" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="Your name" 
          required 
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input 
          id="email" 
          type="email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          placeholder="you@example.com" 
          required 
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input 
          id="password" 
          type="password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          placeholder="••••••••" 
          required 
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input 
          id="confirmPassword" 
          type="password" 
          value={confirmPassword} 
          onChange={(e) => setConfirmPassword(e.target.value)} 
          placeholder="••••••••" 
          required 
        />
      </div>
      
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating account...
          </>
        ) : (
          "Create account"
        )}
      </Button>
    </form>
  );
}
```

### 2. Async Action Handler with Validation (Real Pattern from Account.tsx)

The codebase uses validation before API calls and comprehensive error handling:

```typescript
// Real implementation from src/pages/Account.tsx
import { toast } from "sonner";

export function ProfileUpdateHandler() {
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState({
    fullName: '',
    username: '',
    avatar_url: ''
  });
  const { user, refreshProfile } = useAuth();

  const handleProfileUpdate = async () => {
    if (!user) return;

    // Validation before API call
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

      // Refresh the profile in AuthContext so avatar updates
      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      
      // Specific error handling
      if (error instanceof Error && error.message.includes('Username is already taken')) {
        toast.error('Username is already taken. Please choose a different one.');
      } else {
        toast.error('Failed to update profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const testIntegration = async () => {
    try {
      setLoading(true);
      toast.info('Testing integration...');
      
      // API call
      const data = await someApiCall();
      
      if (data) {
        toast.success('Integration test completed! Check the logs.');
      }
    } catch (error) {
      console.error('Error testing integration:', error);
      toast.error('Integration test failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Input
        value={profileData.fullName}
        onChange={(e) => setProfileData(prev => ({
          ...prev,
          fullName: e.target.value
        }))}
        placeholder="Full name"
      />
      <Input
        value={profileData.username}
        onChange={(e) => setProfileData(prev => ({
          ...prev,
          username: e.target.value
        }))}
        placeholder="Username"
      />
      
      <div className="flex gap-2">
        <Button 
          onClick={handleProfileUpdate} 
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            "Update Profile"
          )}
        </Button>
        
        <Button 
          variant="outline" 
          onClick={testIntegration}
          disabled={loading}
        >
          Test Integration
        </Button>
      </div>
    </div>
  );
}
```

### 3. Custom Hook for Complex Actions (Real Pattern from useTemplateSave.ts)

The codebase extracts complex handlers into custom hooks:

```typescript
// Real implementation from src/hooks/useTemplateSave.ts
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTemplates } from "@/contexts/TemplatesContext";
import { toast } from "sonner";

export const useTemplateSave = () => {
  const navigate = useNavigate();
  const { getTemplate, createTemplate, updateTemplate } = useTemplates();
  const [isSaving, setIsSaving] = useState(false);

  const saveTemplate = async (
    id: string | undefined,
    title: string,
    description: string,
    sections: ChecklistSection[],
    seoTitle: string,
    seoDescription: string,
    seoUrl: string,
    categories: string[],
    tags: string[],
    isPublic: boolean = true
  ) => {
    setIsSaving(true);
    
    try {
      if (id) {
        // Update existing template
        const template = getTemplate(id);
        if (template) {
          const updatedTemplate: ChecklistTemplate = {
            ...template,
            title,
            description,
            sections,
            seoTitle,
            seoDescription,
            seoUrl,
            categories,
            tags,
            isPublic,
          };
          
          updateTemplate(updatedTemplate);
          toast.success("Template updated successfully");
          // Stay on editing page
        }
      } else {
        // Create new template
        await createTemplate({
          title,
          description,
          sections,
          seoTitle,
          seoDescription,
          seoUrl,
          categories,
          tags,
        });
        
        toast.success("Template created successfully");
        navigate("/templates");
      }
      
      return { success: true, errors: [] };
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
      return { success: false, errors: [] };
    } finally {
      setIsSaving(false);
    }
  };

  return {
    saveTemplate,
    isSaving
  };
};

// Usage in component
export function TemplateEditor() {
  const { saveTemplate, isSaving } = useTemplateSave();
  
  const handleSave = async () => {
    const result = await saveTemplate(
      id,
      title,
      description,
      sections,
      seoTitle,
      seoDescription,
      seoUrl,
      categories,
      tags,
      isPublic
    );
    
    if (!result.success) {
      // Handle errors if needed
      console.log('Save failed:', result.errors);
    }
  };

  return (
    <Button onClick={handleSave} disabled={isSaving}>
      {isSaving ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Saving...
        </>
      ) : (
        "Save Template"
      )}
    </Button>
  );
}
```

### 4. Event Handling with State Updates

For components that need to handle multiple types of events:

```typescript
// Pattern for handling multiple input events
export function MultiInputHandler() {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    categories: [],
    tags: [],
    isPublic: true
  });
  const [errors, setErrors] = useState<string[]>([]);

  // Generic handler for string inputs
  const handleInputChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }));
    
    // Clear errors when user starts typing
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  // Handler for textarea
  const handleTextareaChange = (field: string) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };

  // Handler for array updates (like categories/tags)
  const handleArrayUpdate = (field: string) => (newValue: string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: newValue
    }));
  };

  // Handler for boolean toggles
  const handleToggle = (field: string) => (checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: checked
    }));
  };

  // Handler for complex operations
  const handleAddItem = (field: string) => (item: string) => {
    if (!formData[field].includes(item)) {
      setFormData(prev => ({
        ...prev,
        [field]: [...prev[field], item]
      }));
      toast.success(`${item} added successfully`);
    } else {
      toast.error(`${item} already exists`);
    }
  };

  const handleRemoveItem = (field: string) => (item: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter(i => i !== item)
    }));
    toast.info(`${item} removed`);
  };

  return (
    <div className="space-y-4">
      <Input
        value={formData.title}
        onChange={handleInputChange('title')}
        placeholder="Title"
      />
      
      <Textarea
        value={formData.description}
        onChange={handleTextareaChange('description')}
        placeholder="Description"
      />
      
      <MultiSelect
        options={availableCategories}
        selected={formData.categories}
        onChange={handleArrayUpdate('categories')}
        placeholder="Select categories..."
      />
      
      <Switch
        checked={formData.isPublic}
        onCheckedChange={handleToggle('isPublic')}
      />
    </div>
  );
}
```

### 5. Error Boundary and Global Error Handling

For handling unexpected errors:

```typescript
// Error boundary component
import { Component, ReactNode } from 'react';
import { toast } from 'sonner';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('Error caught by boundary:', error, errorInfo);
    toast.error('Something went wrong. Please try again.');
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 text-center">
          <p className="text-red-600">Something went wrong.</p>
          <Button 
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2"
          >
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Global error handler hook
export function useErrorHandler() {
  const handleError = (error: unknown, context?: string) => {
    console.error(`Error in ${context}:`, error);
    
    if (error instanceof Error) {
      // Handle specific error types
      if (error.message.includes('Network')) {
        toast.error('Network error. Please check your connection.');
      } else if (error.message.includes('Unauthorized')) {
        toast.error('Please log in to continue.');
      } else {
        toast.error(error.message);
      }
    } else {
      toast.error('An unexpected error occurred.');
    }
  };

  return { handleError };
}
```

### 6. Context-Based Message Handling (Real Pattern from TemplatesContext)

For global state management and actions:

```typescript
// Pattern from src/contexts/TemplatesContext.tsx
import { createContext, useContext, ReactNode } from 'react';
import { toast } from 'sonner';

interface TemplatesContextType {
  templates: ChecklistTemplate[];
  createTemplate: (template: Partial<ChecklistTemplate>) => Promise<void>;
  updateTemplate: (template: ChecklistTemplate) => void;
  deleteTemplate: (id: string) => void;
  loading: boolean;
}

const TemplatesContext = createContext<TemplatesContextType | undefined>(undefined);

export function TemplatesProvider({ children }: { children: ReactNode }) {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const createTemplate = async (templateData: Partial<ChecklistTemplate>) => {
    setLoading(true);
    try {
      const { api } = await import('@/lib/api');
      const newTemplate = await api.createTemplate(templateData);
      
      setTemplates(prev => [...prev, newTemplate]);
      toast.success('Template created successfully');
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Failed to create template');
    } finally {
      setLoading(false);
    }
  };

  const updateTemplate = (updatedTemplate: ChecklistTemplate) => {
    try {
      setTemplates(prev => 
        prev.map(t => t.id === updatedTemplate.id ? updatedTemplate : t)
      );
      toast.success('Template updated');
    } catch (error) {
      console.error('Error updating template:', error);
      toast.error('Failed to update template');
    }
  };

  const deleteTemplate = (id: string) => {
    try {
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success('Template deleted');
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  const value = {
    templates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    loading
  };

  return (
    <TemplatesContext.Provider value={value}>
      {children}
    </TemplatesContext.Provider>
  );
}

export function useTemplates() {
  const context = useContext(TemplatesContext);
  if (!context) {
    throw new Error('useTemplates must be used within TemplatesProvider');
  }
  return context;
}
```

### 7. Toast Notification Patterns (Real Usage from Codebase)

The codebase uses Sonner for all notifications:

```typescript
import { toast } from "sonner";

// Success notifications
toast.success("Profile updated successfully");
toast.success("Template created successfully");

// Error notifications
toast.error("Failed to save template");
toast.error("Username is already taken. Please choose a different one.");

// Info notifications
toast.info("Testing integration...");

// Loading pattern with promise
const savePromise = saveData();
toast.promise(savePromise, {
  loading: 'Saving...',
  success: 'Data saved successfully',
  error: 'Failed to save data'
});

// Custom toast with actions
toast("Template saved", {
  action: {
    label: "View",
    onClick: () => navigate(`/template/${id}`)
  }
});
```

### 8. Testing Message Handlers

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { ProfileUpdateForm } from './ProfileUpdateForm';

// Mock the toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}));

describe('ProfileUpdateForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows success toast on successful update', async () => {
    const mockUpdateProfile = jest.fn().mockResolvedValue(true);
    
    render(<ProfileUpdateForm updateProfile={mockUpdateProfile} />);
    
    const nameInput = screen.getByPlaceholderText('Full name');
    const submitButton = screen.getByText('Update Profile');
    
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Profile updated successfully');
    });
  });

  it('shows error toast on validation failure', () => {
    render(<ProfileUpdateForm />);
    
    const usernameInput = screen.getByPlaceholderText('Username');
    const submitButton = screen.getByText('Update Profile');
    
    fireEvent.change(usernameInput, { target: { value: 'ab' } }); // Too short
    fireEvent.click(submitButton);
    
    expect(toast.error).toHaveBeenCalledWith('Username must be at least 3 characters long');
  });

  it('shows loading state during submission', async () => {
    const mockUpdateProfile = jest.fn(() => new Promise(resolve => 
      setTimeout(resolve, 100)
    ));
    
    render(<ProfileUpdateForm updateProfile={mockUpdateProfile} />);
    
    const submitButton = screen.getByText('Update Profile');
    fireEvent.click(submitButton);
    
    expect(screen.getByText('Updating...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });
});
```

## Common Patterns from the Codebase

1. **Always prevent default** - Use `e.preventDefault()` for form submissions
2. **Loading states** - Show loading indicators during async operations
3. **Validation first** - Validate inputs before making API calls
4. **Specific error messages** - Provide meaningful error messages to users
5. **Finally blocks** - Always reset loading states in finally blocks
6. **Toast notifications** - Use Sonner for consistent user feedback
7. **Error logging** - Log errors to console for debugging
8. **State cleanup** - Clear errors when users start typing
9. **Optimistic updates** - Update UI immediately for better UX
10. **Context for global actions** - Use context for app-wide state changes

## Common Pitfalls

1. **Not preventing default** - Forms will reload the page
2. **Missing loading states** - Users won't know something is happening
3. **No error boundaries** - Unexpected errors crash the app
4. **Generic error messages** - Users don't know what went wrong
5. **Not clearing errors** - Old errors persist when users retry
6. **Memory leaks** - Not cleaning up event listeners or async operations
7. **Race conditions** - Multiple rapid clicks can cause issues
8. **Missing validation** - Server errors when client validation would suffice

## See Also:
- [Add Data Type Recipe](./add-data-type.md)
- [Add Dropdown Recipe](./add-dropdown.md)
- [Add New Tab Recipe](./add-new-tab.md)
- [Component Development Best Practices](../patterns/component-pattern.md)