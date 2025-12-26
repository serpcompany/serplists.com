# Recipe: Add New Tab

This recipe guides you through adding tab navigation using the actual shadcn/ui Tabs implementation patterns from the codebase.

**Related Files:**
- `/Users/devin/repos/projects/serp-checklists/src/components/ui/tabs.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/pages/UserProfile.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/components/template-editor/content-types/TextContentEditor.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/components/markdown-editor/MarkdownEditor.tsx`

## Steps

### 1. Basic Tab Implementation (Real Pattern from TextContentEditor)

The simplest tab pattern from the codebase for switching between modes:

```typescript
// Real implementation from src/components/template-editor/content-types/TextContentEditor.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import { FileText } from "lucide-react";

interface TextContentEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const TextContentEditor = ({ value, onChange }: TextContentEditorProps) => {
  return (
    <div>
      <Label className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4" /> Text Content
      </Label>
      <Tabs defaultValue="edit">
        <TabsList className="mb-2">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter text or markdown content"
            rows={6}
          />
        </TabsContent>
        <TabsContent value="preview">
          <div className="prose prose-sm max-w-none rounded-md border p-3 min-h-[150px]">
            <ReactMarkdown>{value}</ReactMarkdown>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
```

### 2. Page-Level Tabs with Complex Content (Real Pattern from UserProfile)

The codebase uses tabs for organizing complex page content:

```typescript
// Real implementation from src/pages/UserProfile.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, Clock, ExternalLink, CheckCircle } from "lucide-react";

export function UserProfileTabs({ templates, profile }) {
  const getFeaturedTemplates = () => {
    return templates.filter(template => template.isFeatured).slice(0, 6);
  };

  const getRecentTemplates = () => {
    return templates
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8);
  };

  const getTotalItems = (template) => {
    return template.sections.reduce((total, section) => total + section.items.length, 0);
  };

  if (templates.length === 0) {
    return (
      <EmptyState 
        title="No Public Checklists" 
        description={`@${profile.username} hasn't published any public checklists yet.`} 
        icon={CheckCircle} 
      />
    );
  }

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="templates">All Templates</TabsTrigger>
      </TabsList>

      {/* Overview Tab */}
      <TabsContent value="overview" className="space-y-6">
        {/* Featured Templates */}
        {getFeaturedTemplates().length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Star className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Featured Templates</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {getFeaturedTemplates().map((template) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base line-clamp-2">
                      {template.title}
                    </CardTitle>
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                      <span>{template.sections.length} sections</span>
                      <span>{getTotalItems(template)} items</span>
                    </div>
                    <Link to={`/template/${template.slug || template.id}`}>
                      <Button variant="outline" size="sm" className="w-full">
                        <ExternalLink className="mr-2 h-3 w-3" />
                        View Template
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Recent Templates */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Recent Templates</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {getRecentTemplates().map((template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm line-clamp-2">
                    {template.title}
                  </CardTitle>
                  {template.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {template.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>{template.sections.length} sections</span>
                    <span>{getTotalItems(template)} items</span>
                  </div>
                  <Link to={`/template/${template.slug || template.id}`}>
                    <Button variant="outline" size="sm" className="w-full h-7 text-xs">
                      <ExternalLink className="mr-2 h-2 w-2" />
                      View
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </TabsContent>

      {/* All Templates Tab */}
      <TabsContent value="templates" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            All Templates ({templates.length})
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm line-clamp-2">
                  {template.title}
                </CardTitle>
                {template.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                  <span>{template.sections.length} sections</span>
                  <span>{getTotalItems(template)} items</span>
                </div>
                <Link to={`/template/${template.slug || template.id}`}>
                  <Button variant="outline" size="sm" className="w-full h-7 text-xs">
                    <ExternalLink className="mr-2 h-2 w-2" />
                    View Template
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}
```

### 3. Controlled Tabs with State Management

For tabs that need external state control:

```typescript
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ControlledTabsExample() {
  const [activeTab, setActiveTab] = useState('profile');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const handleTabChange = (newTab: string) => {
    if (hasUnsavedChanges) {
      const confirm = window.confirm('You have unsaved changes. Are you sure you want to switch tabs?');
      if (!confirm) return;
    }
    
    setActiveTab(newTab);
    setHasUnsavedChanges(false);
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      
      <TabsContent value="profile" className="space-y-4">
        <ProfileForm 
          onDataChange={() => setHasUnsavedChanges(true)}
        />
      </TabsContent>
      
      <TabsContent value="billing" className="space-y-4">
        <BillingSettings />
      </TabsContent>
      
      <TabsContent value="settings" className="space-y-4">
        <AppSettings 
          onSettingChange={() => setHasUnsavedChanges(true)}
        />
      </TabsContent>
    </Tabs>
  );
}
```

### 4. URL-Based Tab Navigation

For tabs that should sync with the browser URL:

```typescript
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function URLSyncedTabs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const handleTabChange = (newTab: string) => {
    setSearchParams(prev => {
      prev.set('tab', newTab);
      return prev;
    });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview">
        <DashboardOverview />
      </TabsContent>
      
      <TabsContent value="analytics">
        <AnalyticsDashboard />
      </TabsContent>
      
      <TabsContent value="users">
        <UserManagement />
      </TabsContent>
      
      <TabsContent value="settings">
        <AdminSettings />
      </TabsContent>
    </Tabs>
  );
}
```

### 5. Dynamic Tabs with Add/Remove Functionality

For applications that need dynamic tab management:

```typescript
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

interface TabData {
  id: string;
  title: string;
  content: React.ReactNode;
  closeable?: boolean;
}

export function DynamicTabs() {
  const [tabs, setTabs] = useState<TabData[]>([
    { id: 'home', title: 'Home', content: <div>Home content</div> },
    { id: 'settings', title: 'Settings', content: <div>Settings content</div> }
  ]);
  const [activeTab, setActiveTab] = useState('home');

  const addTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTab: TabData = {
      id: newId,
      title: `New Tab ${tabs.length + 1}`,
      content: <div>Content for {newId}</div>,
      closeable: true
    };
    
    setTabs(prev => [...prev, newTab]);
    setActiveTab(newId);
  };

  const closeTab = (tabId: string) => {
    const tabToClose = tabs.find(tab => tab.id === tabId);
    if (!tabToClose?.closeable) return;
    
    setTabs(prev => prev.filter(tab => tab.id !== tabId));
    
    // Switch to first tab if closing active tab
    if (activeTab === tabId) {
      const remainingTabs = tabs.filter(tab => tab.id !== tabId);
      if (remainingTabs.length > 0) {
        setActiveTab(remainingTabs[0].id);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2>Dynamic Tabs</h2>
        <Button onClick={addTab} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Tab
        </Button>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {tabs.map((tab) => (
            <div key={tab.id} className="flex items-center">
              <TabsTrigger value={tab.id} className="pr-1">
                {tab.title}
              </TabsTrigger>
              {tab.closeable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 ml-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </TabsList>
        
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
```

### 6. Tabs with Loading States and Error Handling

For tabs that load data asynchronously:

```typescript
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { toast } from "sonner";

interface TabConfig {
  value: string;
  label: string;
  queryKey: string[];
  queryFn: () => Promise<any>;
}

export function AsyncTabs() {
  const [activeTab, setActiveTab] = useState('overview');
  
  const tabConfigs: TabConfig[] = [
    {
      value: 'overview',
      label: 'Overview',
      queryKey: ['overview'],
      queryFn: () => fetch('/api/overview').then(res => res.json())
    },
    {
      value: 'analytics',
      label: 'Analytics',
      queryKey: ['analytics'],
      queryFn: () => fetch('/api/analytics').then(res => res.json())
    },
    {
      value: 'reports',
      label: 'Reports',
      queryKey: ['reports'],
      queryFn: () => fetch('/api/reports').then(res => res.json())
    }
  ];

  const currentTabConfig = tabConfigs.find(tab => tab.value === activeTab);
  
  const { data, isLoading, error } = useQuery({
    queryKey: currentTabConfig?.queryKey || [],
    queryFn: currentTabConfig?.queryFn || (() => Promise.resolve(null)),
    enabled: !!currentTabConfig
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load ${activeTab} data`);
    }
  }, [error, activeTab]);

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList className="grid w-full grid-cols-3">
        {tabConfigs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      
      {tabConfigs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4">
          {isLoading && activeTab === tab.value ? (
            <LoadingSkeleton rows={4} />
          ) : error && activeTab === tab.value ? (
            <div className="text-center py-8">
              <p className="text-red-600">Failed to load data</p>
              <Button 
                onClick={() => window.location.reload()} 
                className="mt-2"
                size="sm"
              >
                Try Again
              </Button>
            </div>
          ) : activeTab === tab.value ? (
            <div>
              {/* Render tab content based on tab.value */}
              {tab.value === 'overview' && <OverviewContent data={data} />}
              {tab.value === 'analytics' && <AnalyticsContent data={data} />}
              {tab.value === 'reports' && <ReportsContent data={data} />}
            </div>
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
```

### 7. Vertical Tabs Layout

For layouts that need vertical tab navigation:

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function VerticalTabs() {
  return (
    <Tabs defaultValue="account" orientation="vertical" className="flex">
      <TabsList className="flex flex-col h-fit w-48 mr-4">
        <TabsTrigger value="account" className="w-full justify-start">
          Account Settings
        </TabsTrigger>
        <TabsTrigger value="profile" className="w-full justify-start">
          Public Profile
        </TabsTrigger>
        <TabsTrigger value="billing" className="w-full justify-start">
          Billing & Plans
        </TabsTrigger>
        <TabsTrigger value="notifications" className="w-full justify-start">
          Notifications
        </TabsTrigger>
        <TabsTrigger value="security" className="w-full justify-start">
          Security
        </TabsTrigger>
      </TabsList>
      
      <div className="flex-1">
        <TabsContent value="account">
          <AccountSettings />
        </TabsContent>
        
        <TabsContent value="profile">
          <ProfileSettings />
        </TabsContent>
        
        <TabsContent value="billing">
          <BillingSettings />
        </TabsContent>
        
        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>
        
        <TabsContent value="security">
          <SecuritySettings />
        </TabsContent>
      </div>
    </Tabs>
  );
}
```

### 8. Tabs with Form Validation

For tabs containing forms that need validation:

```typescript
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const personalInfoSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
});

const addressSchema = z.object({
  street: z.string().min(1, 'Street address is required'),
  city: z.string().min(1, 'City is required'),
  zipCode: z.string().min(5, 'ZIP code must be at least 5 characters'),
});

export function FormTabs() {
  const [activeTab, setActiveTab] = useState('personal');
  const [completedTabs, setCompletedTabs] = useState<string[]>([]);

  const personalForm = useForm({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: { firstName: '', lastName: '', email: '' }
  });

  const addressForm = useForm({
    resolver: zodResolver(addressSchema),
    defaultValues: { street: '', city: '', zipCode: '' }
  });

  const handlePersonalSubmit = (data: any) => {
    console.log('Personal info:', data);
    setCompletedTabs(prev => [...prev.filter(tab => tab !== 'personal'), 'personal']);
    toast.success('Personal information saved');
    setActiveTab('address');
  };

  const handleAddressSubmit = (data: any) => {
    console.log('Address info:', data);
    setCompletedTabs(prev => [...prev.filter(tab => tab !== 'address'), 'address']);
    toast.success('Address information saved');
    setActiveTab('review');
  };

  const isTabCompleted = (tab: string) => completedTabs.includes(tab);
  const canAccessTab = (tab: string) => {
    if (tab === 'personal') return true;
    if (tab === 'address') return isTabCompleted('personal');
    if (tab === 'review') return isTabCompleted('personal') && isTabCompleted('address');
    return false;
  };

  const handleTabChange = (newTab: string) => {
    if (canAccessTab(newTab)) {
      setActiveTab(newTab);
    } else {
      toast.error('Please complete the previous steps first');
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger 
          value="personal"
          className={isTabCompleted('personal') ? 'bg-green-100' : ''}
        >
          Personal Info {isTabCompleted('personal') && '✓'}
        </TabsTrigger>
        <TabsTrigger 
          value="address"
          disabled={!canAccessTab('address')}
          className={isTabCompleted('address') ? 'bg-green-100' : ''}
        >
          Address {isTabCompleted('address') && '✓'}
        </TabsTrigger>
        <TabsTrigger 
          value="review"
          disabled={!canAccessTab('review')}
        >
          Review
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="personal">
        <Form {...personalForm}>
          <form onSubmit={personalForm.handleSubmit(handlePersonalSubmit)} className="space-y-4">
            <FormField
              control={personalForm.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={personalForm.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={personalForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button type="submit">Save & Continue</Button>
          </form>
        </Form>
      </TabsContent>
      
      <TabsContent value="address">
        <Form {...addressForm}>
          <form onSubmit={addressForm.handleSubmit(handleAddressSubmit)} className="space-y-4">
            <FormField
              control={addressForm.control}
              name="street"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={addressForm.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={addressForm.control}
              name="zipCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ZIP Code</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setActiveTab('personal')}>
                Back
              </Button>
              <Button type="submit">Save & Continue</Button>
            </div>
          </form>
        </Form>
      </TabsContent>
      
      <TabsContent value="review">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Review Your Information</h3>
          
          <div className="space-y-2">
            <h4 className="font-medium">Personal Information</h4>
            <p>{personalForm.getValues('firstName')} {personalForm.getValues('lastName')}</p>
            <p>{personalForm.getValues('email')}</p>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium">Address</h4>
            <p>{addressForm.getValues('street')}</p>
            <p>{addressForm.getValues('city')}, {addressForm.getValues('zipCode')}</p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setActiveTab('address')}>
              Edit Address
            </Button>
            <Button onClick={() => toast.success('Information submitted!')}>
              Submit
            </Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
```

## Testing Tabs

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { UserProfileTabs } from './UserProfileTabs';

const mockTemplates = [
  {
    id: '1',
    title: 'Test Template',
    description: 'Test description',
    sections: [{ items: [1, 2, 3] }],
    isFeatured: true,
    updatedAt: '2023-01-01'
  }
];

const mockProfile = { username: 'testuser' };

describe('UserProfileTabs', () => {
  it('renders tab triggers', () => {
    render(<UserProfileTabs templates={mockTemplates} profile={mockProfile} />);
    
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('All Templates')).toBeInTheDocument();
  });
  
  it('switches tabs on click', () => {
    render(<UserProfileTabs templates={mockTemplates} profile={mockProfile} />);
    
    const templatesTab = screen.getByText('All Templates');
    fireEvent.click(templatesTab);
    
    expect(screen.getByText('All Templates (1)')).toBeInTheDocument();
  });
  
  it('shows empty state when no templates', () => {
    render(<UserProfileTabs templates={[]} profile={mockProfile} />);
    
    expect(screen.getByText('No Public Checklists')).toBeInTheDocument();
  });
});
```

## Key Patterns from the Codebase

1. **Use defaultValue for initial state** - Set the default active tab
2. **Grid layout for tab triggers** - Use `grid w-full grid-cols-n` for equal-width tabs
3. **Space-y for content spacing** - Consistent spacing with `space-y-6` or `space-y-4`
4. **Conditional rendering** - Show different content based on data availability
5. **Proper accessibility** - Tabs component handles ARIA attributes automatically
6. **Icon integration** - Use Lucide icons for visual hierarchy
7. **Responsive design** - Consider mobile layout with fewer columns

## Common Pitfalls

1. **Not setting defaultValue** - Tabs won't show initial content without it
2. **Missing TabsContent** - Each TabsTrigger needs corresponding TabsContent
3. **Inconsistent spacing** - Use consistent spacing classes across tabs
4. **No loading states** - Handle async content loading properly
5. **Poor mobile experience** - Consider responsive grid layouts
6. **Memory leaks** - Clean up subscriptions when tabs unmount
7. **Form state loss** - Consider persisting form data when switching tabs

## See Also:
- [Add Data Type Recipe](./add-data-type.md)
- [Add Dropdown Recipe](./add-dropdown.md)
- [Add Message Handler Recipe](./add-message-handler.md)
- [Component Development Best Practices](../patterns/component-pattern.md)