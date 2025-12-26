# Tab Creation Pattern

The tab creation pattern uses Radix UI primitives through shadcn/ui for accessible tabbed interfaces, along with conditional rendering patterns for complex UI state management.

**Related Files:**
- `src/components/ui/tabs.tsx` - Radix UI tabs components
- `src/pages/UserProfile.tsx` - User profile tabs (Overview/Templates)
- `src/components/template-editor/content-types/TextContentEditor.tsx` - Edit/Preview tabs
- `src/pages/TemplateEditor.tsx` - Conditional content switching (tab-like behavior)
- `src/hooks/useTemplateEditorState.ts` - State management for conditional UI

## Pattern Overview

The application uses two main tab patterns:
1. **Radix UI Tabs** - Accessible tabs with built-in keyboard navigation
2. **Conditional Rendering** - Custom tab-like behavior with state management
3. **Content Switching** - Edit/Preview modes for content editors
4. **Profile Organization** - User profile sections
5. **Sidebar Navigation** - Tab-like selection in template editor

## Implementation

### 1. Radix UI Tabs (Actual Implementation)

```typescript
// src/components/ui/tabs.tsx - Real shadcn/ui implementation
import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }

// Usage in src/pages/UserProfile.tsx - Real implementation
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

<Tabs defaultValue="overview" className="space-y-6">
  <TabsList className="grid w-full grid-cols-2">
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="templates">All Templates</TabsTrigger>
  </TabsList>

  <TabsContent value="overview" className="space-y-6">
    {/* Featured Templates */}
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Star className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Featured Templates</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {getFeaturedTemplates().map((template) => (
          <Card key={template.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-base line-clamp-2">{template.title}</CardTitle>
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
  </TabsContent>

  <TabsContent value="templates" className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((template) => (
        <TemplateCard key={template.id} template={template} />
      ))}
    </div>
  </TabsContent>
</Tabs>
```

### 2. Edit/Preview Tabs (Actual Implementation)

```typescript
// src/components/template-editor/content-types/TextContentEditor.tsx - Real tabs usage
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

### 3. Conditional Content Switching (Tab-like Pattern)

```typescript
// src/pages/TemplateEditor.tsx - Conditional rendering that acts like tabs
import { useTemplateEditorState } from "@/hooks/useTemplateEditorState";

const TemplateEditor = () => {
  const {
    // State for what content to show (like active tab)
    selectedSectionIndex,
    selectedItemIndex,
    showingSEO,
    showingTemplateInfo,
    // Actions to switch content (like tab change handlers)
    handleSelectSection,
    handleSelectItem,
    handleSelectSEO,
    handleSelectTemplateInfo
  } = useTemplateEditorState();

  return (
    <div className="min-h-screen bg-background">
      {/* Three Column Layout */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Sidebar - Acts like TabsList */}
          <div className="lg:col-span-1 space-y-4">
            {/* Template Basic Info "Tab" */}
            <Card 
              className={`cursor-pointer transition-colors ${
                showingTemplateInfo ? 'ring-2 ring-primary' : 'hover:bg-muted/50'
              }`}
              onClick={handleSelectTemplateInfo}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Template Info</h3>
                    <p className="text-sm text-muted-foreground">
                      {title || description || categories.length > 0 || tags.length > 0
                        ? 'Configured' 
                        : 'Click to configure'
                      }
                    </p>
                  </div>
                  <div className="text-muted-foreground">
                    {title || description || categories.length > 0 || tags.length > 0 ? '✓' : '→'}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SEO Meta "Tab" */}
            <Card 
              className={`cursor-pointer transition-colors ${
                showingSEO ? 'ring-2 ring-primary' : 'hover:bg-muted/50'
              }`}
              onClick={handleSelectSEO}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">SEO & Meta</h3>
                    <p className="text-sm text-muted-foreground">
                      {seoTitle || seoDescription || seoUrl 
                        ? 'Configured' 
                        : 'Click to configure'
                      }
                    </p>
                  </div>
                  <div className="text-muted-foreground">
                    {seoTitle || seoDescription || seoUrl ? '✓' : '→'}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section/Item Navigation */}
            <SectionSidebar
              sections={sections}
              selectedSectionIndex={selectedSectionIndex}
              selectedItemIndex={selectedItemIndex}
              onSelectSection={handleSelectSection}
              onSelectItem={handleSelectItem}
              // ... other props
            />
          </div>

          {/* Right Content - Acts like TabsContent */}
          <div className="lg:col-span-2">
            {showingTemplateInfo ? (
              <TemplateBasicInfo
                title={title}
                description={description}
                categories={categories}
                tags={tags}
                isPublic={isPublic}
                onTitleChange={setTitle}
                onDescriptionChange={setDescription}
                onCategoriesChange={setCategories}
                onTagsChange={setTags}
                onPublicChange={setIsPublic}
                errors={errors}
                isPremiumUser={isPremiumUser}
              />
            ) : showingSEO ? (
              <SEOMetaEditor
                seoTitle={seoTitle}
                seoDescription={seoDescription}
                seoUrl={seoUrl}
                onSeoTitleChange={setSeoTitle}
                onSeoDescriptionChange={setSeoDescription}
                onSeoUrlChange={setSeoUrl}
              />
            ) : selectedSection ? (
              <div className="space-y-6">
                {selectedItemIndex === null ? (
                  <SectionEditor
                    section={selectedSection}
                    sectionIndex={selectedSectionIndex}
                    onUpdateSection={updateSection}
                    errors={errors}
                  />
                ) : selectedItem ? (
                  <ItemEditor
                    item={selectedItem}
                    sectionIndex={selectedSectionIndex}
                    itemIndex={selectedItemIndex}
                    onUpdateItem={updateItem}
                    // ... other props
                  />
                ) : null}
              </div>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2">No tasks yet</h3>
                    <p className="text-muted-foreground mb-4">Create your first task to get started</p>
                    <Button onClick={addSection}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Task
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
```

### 4. State Management for Tab-like Behavior

```typescript
// src/hooks/useTemplateEditorState.ts - State management for conditional UI
import { useState } from "react";

interface ValidationError {
  field: string;
  message: string;
}

export const useTemplateEditorState = () => {
  // Content selection state (similar to active tab)
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [showingSEO, setShowingSEO] = useState(false);
  const [showingTemplateInfo, setShowingTemplateInfo] = useState(false);
  
  // Other form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoUrl, setSeoUrl] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  // Tab-like selection handlers
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
    // Actions (like tab change handlers)
    handleSelectSection,
    handleSelectItem,
    handleSelectSEO,
    handleSelectTemplateInfo,
  };
};
```

### 5. Visual Tab Indicators

```typescript
// Real visual patterns from TemplateEditor - showing active state
<Card 
  className={`cursor-pointer transition-colors ${
    showingTemplateInfo ? 'ring-2 ring-primary' : 'hover:bg-muted/50'
  }`}
  onClick={handleSelectTemplateInfo}
>
  <CardContent className="p-4">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="font-medium">Template Info</h3>
        <p className="text-sm text-muted-foreground">
          {title || description || categories.length > 0 || tags.length > 0
            ? 'Configured' 
            : 'Click to configure'
          }
        </p>
      </div>
      <div className="text-muted-foreground">
        {title || description || categories.length > 0 || tags.length > 0 ? '✓' : '→'}
      </div>
    </div>
  </CardContent>
</Card>

// Sidebar selection with active state
<Card 
  className={`cursor-pointer transition-colors ${
    selectedSectionIndex === sectionIndex ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
  }`}
>
  <CardContent className="p-4">
    <div className="flex items-center justify-between" onClick={() => {
      onSelectSection(sectionIndex);
    }}>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium truncate">
          {section.title || `Section ${sectionIndex + 1}`}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {section.items.length} task{section.items.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
    
    {/* Nested item selection */}
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
          <span className="truncate flex-1 font-medium">
            {item.title || `Task ${itemIndex + 1}`}
          </span>
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

### 6. Accessibility with Radix UI

```typescript
// Radix UI tabs provide built-in accessibility features:
// - ARIA attributes automatically applied
// - Keyboard navigation (arrow keys)
// - Focus management
// - Screen reader support

// The shadcn/ui implementation maintains these features:
const Tabs = TabsPrimitive.Root // Inherits all Radix accessibility

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props} // Spreads all accessibility props
  />
))

// Automatic ARIA attributes:
// - role="tablist" on TabsList
// - role="tab" on TabsTrigger 
// - role="tabpanel" on TabsContent
// - aria-selected on active tab
// - aria-controls linking tabs to panels
// - tabindex management

// Keyboard navigation:
// - Arrow keys to navigate between tabs
// - Enter/Space to activate tab
// - Tab to focus tab list
// - Focus visible ring on keyboard focus

// Usage maintains accessibility:
<Tabs defaultValue="overview" className="space-y-6">
  <TabsList className="grid w-full grid-cols-2">
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="templates">All Templates</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">
    {/* Content automatically gets proper ARIA attributes */}
  </TabsContent>
</Tabs>
```

### 7. Performance Optimization

```typescript
// Radix UI tabs only render active content by default
// No need for manual lazy loading in most cases

// TabsContent is conditionally rendered based on active tab
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="templates">All Templates</TabsTrigger>
  </TabsList>
  
  {/* Only active TabsContent is rendered in DOM */}
  <TabsContent value="overview">
    {/* This is only rendered when overview tab is active */}
    <ExpensiveOverviewComponent />
  </TabsContent>
  
  <TabsContent value="templates">
    {/* This is only rendered when templates tab is active */}
    <ExpensiveTemplatesComponent />
  </TabsContent>
</Tabs>

// For conditional rendering pattern, use early returns:
const TemplateEditor = () => {
  const { showingSEO, showingTemplateInfo } = useTemplateEditorState();
  
  // Early returns prevent unnecessary component mounting
  if (showingSEO) {
    return <SEOMetaEditor />;
  }
  
  if (showingTemplateInfo) {
    return <TemplateBasicInfo />;
  }
  
  return <SectionEditor />;
};

// For heavy computations, use React.memo:
const ExpensiveTabContent = React.memo(({ data }) => {
  const processedData = useMemo(() => {
    return expensiveDataProcessing(data);
  }, [data]);
  
  return <div>{/* Expensive rendering */}</div>;
});
```

## Best Practices (From Actual Implementation)

1. **Use Radix UI primitives via shadcn/ui** - Built-in accessibility and keyboard navigation
2. **Prefer conditional rendering for complex UIs** - More flexible than rigid tab constraints
3. **Use visual indicators for state** - Ring borders, background colors, icons (✓, →)
4. **Leverage defaultValue for initial state** - Simpler than controlled state for basic tabs
5. **Combine tabs with other patterns** - Cards as clickable "tabs" for complex layouts
6. **Use proper TypeScript interfaces** - Type tab values and content props
7. **Handle empty states gracefully** - Show helpful messages when no content
8. **Maintain consistent spacing** - Use className utilities for layout
9. **Support both mouse and keyboard** - Radix UI handles this automatically
10. **Test with screen readers** - Radix UI provides proper ARIA attributes

## Tab Pattern Comparison

### When to Use Radix UI Tabs
- **Simple content switching** - Overview/Templates in user profile
- **Edit/Preview modes** - TextContentEditor with markdown preview
- **Built-in accessibility needs** - Screen reader support, keyboard navigation
- **Standard tab behavior** - User expects typical tab interaction

### When to Use Conditional Rendering
- **Complex layouts** - TemplateEditor with sidebar navigation
- **Multi-level navigation** - Sections → Items → Content
- **Custom visual design** - Card-based "tabs" with status indicators
- **State that doesn't fit tab model** - Multiple active selections

### Accessibility Notes
- **Radix UI tabs are fully accessible** - No additional work needed
- **Conditional rendering requires manual ARIA** - Add role, aria-selected, etc.
- **Focus management is automatic** with Radix UI
- **Keyboard navigation works out of the box** with Radix UI

```typescript
// Good: Radix UI handles accessibility
<Tabs defaultValue="edit">
  <TabsList>
    <TabsTrigger value="edit">Edit</TabsTrigger>
    <TabsTrigger value="preview">Preview</TabsTrigger>
  </TabsList>
  <TabsContent value="edit">{/* Content */}</TabsContent>
  <TabsContent value="preview">{/* Content */}</TabsContent>
</Tabs>

// More complex: Custom pattern with manual accessibility
<Card 
  role="tab"
  aria-selected={showingTemplateInfo}
  tabIndex={showingTemplateInfo ? 0 : -1}
  onClick={handleSelectTemplateInfo}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleSelectTemplateInfo();
    }
  }}
>
  {/* Card content */}
</Card>
```

## Architecture Summary

The codebase uses two main tab patterns:
- **Radix UI Tabs** - For standard tabbed interfaces with built-in accessibility
- **Conditional Rendering** - For complex, multi-level navigation that doesn't fit the tab model

Both patterns work together to provide intuitive navigation:
- shadcn/ui components for consistent styling
- TypeScript interfaces for type safety
- Custom hooks for complex state management
- Visual indicators for active states
- Proper accessibility support

## See Also:
- [Component Pattern](./component-pattern.md) - Component structure and custom hooks
- [Data Service Pattern](./data-service-pattern.md) - Server state management
- [Message Handler Pattern](./message-handler-pattern.md) - Event handling patterns