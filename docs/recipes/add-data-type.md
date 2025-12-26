# Recipe: Add Data Type

This recipe guides you through adding a new content type to the checklist system. This example shows how to add a "link" content type for storing external links.

**Related Files:**
- `/Users/devin/repos/projects/serp-checklists/src/types/checklist.ts`
- `/Users/devin/repos/projects/serp-checklists/src/lib/schemas/checklistSchema.ts`
- `/Users/devin/repos/projects/serp-checklists/src/components/template-editor/content-types/`
- `/Users/devin/repos/projects/serp-checklists/src/components/shared/ContentRenderer.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/components/template-editor/ContentAddPanel.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/components/template-editor/ContentEditor.tsx`

## Steps

### 1. Define the Type Interface

First, add your new content type to the existing type definitions. The codebase uses a unified `ChecklistItemContent` type:

```typescript
// src/types/checklist.ts

// The existing content type structure
export type ChecklistItemContent = {
  type: "text" | "image" | "video" | "file" | "embed" | "subItems" | "page" | "link";  // Add "link"
  value: string; // URL for image/video/file/link, embed code, markdown for text, page ID for pages, or empty for subItems
  uploadType?: "url" | "upload"; // For image/video/file: whether it's a URL or uploaded file
  fileName?: string; // Original filename for uploaded files
  fileSize?: number; // File size in bytes for uploaded files
  subItems?: ChecklistSubItem[]; // Only used when type is "subItems"
  pageId?: string; // Only used when type is "page"
  linkTitle?: string; // New field for link type
  linkDescription?: string; // New field for link type
};
```

### 2. Update Zod Schema

Add validation for the new content type in the existing schema structure:

```typescript
// src/lib/schemas/checklistSchema.ts
import { z } from "zod";

// Update the existing schema to include the new "link" type
export const checklistItemContentSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "video", "file", "embed", "subItems", "page", "link"]), // Add "link"
  value: z.string(), // URL for image/video/file/link, embed code, markdown for text, page ID for pages, or empty for subItems
  uploadType: z.enum(["url", "upload"]).optional(), // For image/video/file: whether it's a URL or uploaded file
  fileName: z.string().optional(), // Original filename for uploaded files
  fileSize: z.number().optional(), // File size in bytes for uploaded files
  subItems: z.array(checklistSubItemSchema).optional(),
  pageId: z.string().optional(), // For page content type
  linkTitle: z.string().optional(), // New field for link type
  linkDescription: z.string().optional() // New field for link type
});
```

### 3. Create Content Editor Component

Create a new editor component following the existing pattern:

```typescript
// src/components/template-editor/content-types/LinkContentEditor.tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LinkContentEditorProps {
  value: string;
  linkTitle?: string;
  linkDescription?: string;
  onValueChange: (value: string) => void;
  onUpdateMeta: (updates: { linkTitle?: string; linkDescription?: string }) => void;
}

export const LinkContentEditor = ({
  value,
  linkTitle,
  linkDescription,
  onValueChange,
  onUpdateMeta
}: LinkContentEditorProps) => {
  const { toast } = useToast();
  const [isValidating, setIsValidating] = useState(false);

  const validateUrl = async (url: string) => {
    if (!url) return;
    
    try {
      new URL(url);
      setIsValidating(true);
      
      // Optional: Fetch page title and description
      // This would require a backend service to avoid CORS issues
      // const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      // if (response.ok) {
      //   const { title, description } = await response.json();
      //   onUpdateMeta({ linkTitle: title, linkDescription: description });
      // }
      
      toast({
        title: "Valid URL",
        description: "Link has been validated successfully"
      });
    } catch (error) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL starting with http:// or https://",
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleUrlChange = (newUrl: string) => {
    onValueChange(newUrl);
    if (newUrl) {
      validateUrl(newUrl);
    }
  };

  return (
    <div className="space-y-4">
      <Label className="flex items-center gap-2 mb-3">
        <ExternalLink className="h-4 w-4" />
        External Link
      </Label>
      
      <div className="space-y-3">
        <div>
          <Label htmlFor="link-url">URL</Label>
          <Input
            id="link-url"
            type="url"
            value={value}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://example.com"
            disabled={isValidating}
          />
        </div>
        
        <div>
          <Label htmlFor="link-title">Link Title (Optional)</Label>
          <Input
            id="link-title"
            value={linkTitle || ''}
            onChange={(e) => onUpdateMeta({ linkTitle: e.target.value })}
            placeholder="Enter a custom title for this link"
          />
        </div>
        
        <div>
          <Label htmlFor="link-description">Description (Optional)</Label>
          <Textarea
            id="link-description"
            value={linkDescription || ''}
            onChange={(e) => onUpdateMeta({ linkDescription: e.target.value })}
            placeholder="Enter a description for this link"
            rows={3}
          />
        </div>
      </div>
      
      {value && (
        <div className="p-3 border rounded-lg bg-muted/20">
          <div className="flex items-center gap-2 text-sm">
            <ExternalLink className="h-4 w-4" />
            <span className="font-medium">{linkTitle || 'External Link'}</span>
          </div>
          {linkDescription && (
            <p className="text-sm text-muted-foreground mt-1">{linkDescription}</p>
          )}
          <a 
            href={value} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline mt-1 inline-block"
          >
            {value}
          </a>
        </div>
      )}
    </div>
  );
};
```

### 4. Update Content Renderer

Add rendering logic to the existing ContentRenderer component:

```typescript
// src/components/shared/ContentRenderer.tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Checkbox } from '@/components/ui/checkbox';
import { VideoEmbed } from './VideoEmbed';
import { File, Code, ListCheck, ExternalLink } from 'lucide-react';
import { ChecklistItemContent, ChecklistSubItem } from '@/types/checklist';

// Add the new link case to the existing switch statement
export const ContentRenderer: React.FC<ContentRendererProps> = ({ 
  contents, 
  disabled = false 
}) => {
  if (!contents || contents.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <File className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No additional content for this task</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {contents.map((content, contentIndex: number) => (
        <div key={contentIndex} className="space-y-3">
          {/* Existing content types... */}
          
          {/* Add new link content type */}
          {content.type === "link" && content.value && (
            <div className="border rounded-lg p-4 bg-blue-50/50">
              <div className="flex items-start gap-3">
                <ExternalLink className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium text-blue-900">
                    {content.linkTitle || 'External Link'}
                  </h4>
                  {content.linkDescription && (
                    <p className="text-sm text-gray-600 mt-1">
                      {content.linkDescription}
                    </p>
                  )}
                  <a 
                    href={content.value} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline mt-2 inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {content.value}
                  </a>
                </div>
              </div>
            </div>
          )}
          
          {/* Continue with existing content types... */}
        </div>
      ))}
    </div>
  );
};
```

### 5. Update Content Add Panel

Add the new content type to the existing ContentAddPanel:

```typescript
// src/components/template-editor/ContentAddPanel.tsx
import { Button } from "@/components/ui/button";
import { 
  FileText, Image, Video, File, Code, ListCheck, 
  X, PanelRightOpen, ExternalLink  // Add ExternalLink
} from "lucide-react";

interface ContentAddPanelProps {
  showAddPanel: boolean;
  onTogglePanel: () => void;
  onAddContent: (contentType: "text" | "image" | "video" | "file" | "embed" | "subItems" | "page" | "link") => void;
}

export const ContentAddPanel = ({ 
  showAddPanel, 
  onTogglePanel, 
  onAddContent 
}: ContentAddPanelProps) => {
  const contentTypeButtons = [
    { type: "text" as const, icon: FileText, label: "Add Text" },
    { type: "image" as const, icon: Image, label: "Add Image" },
    { type: "video" as const, icon: Video, label: "Add Video" },
    { type: "file" as const, icon: File, label: "Add File" },
    { type: "embed" as const, icon: Code, label: "Add Embed" },
    { type: "subItems" as const, icon: ListCheck, label: "Add Sub-tasks" },
    { type: "page" as const, icon: FileText, label: "Add Page" },
    { type: "link" as const, icon: ExternalLink, label: "Add Link" },  // Add new type
  ];

  // Rest of the component remains the same...
};
```

### 6. Update Content Editor Switch

Add the new editor to the existing ContentEditor component:

```typescript
// src/components/template-editor/ContentEditor.tsx
import { LinkContentEditor } from './content-types/LinkContentEditor';

// Add to the renderContentEditor function's switch statement
const renderContentEditor = (content: ChecklistItemContent, contentIndex: number) => {
  const commonProps = {
    key: `content-${contentIndex}`,
    value: content.value,
    onValueChange: (value: string) => onUpdateItemContent(sectionIndex, itemIndex, contentIndex, value),
    onUpdateMeta: (updates: unknown[]) => onUpdateItemContentMeta(sectionIndex, itemIndex, contentIndex, updates)
  };

  switch (content.type) {
    case "text":
      return (
        <TextContentEditor
          value={content.value}
          onChange={(value: unknown) => onUpdateItemContent(sectionIndex, itemIndex, contentIndex, value)}
        />
      );

    case "link":  // Add new case
      return (
        <LinkContentEditor
          value={content.value}
          linkTitle={content.linkTitle}
          linkDescription={content.linkDescription}
          onValueChange={(value: unknown) => onUpdateItemContent(sectionIndex, itemIndex, contentIndex, value)}
          onUpdateMeta={(updates: { linkTitle?: string; linkDescription?: string }) => 
            onUpdateItemContentMeta(sectionIndex, itemIndex, contentIndex, updates)
          }
        />
      );

    // ... other existing cases
    
    default:
      return null;
  }
};
```

### 7. Update Template Editor Hooks

Ensure your template editor hooks can handle the new content type:

```typescript
// src/hooks/useTemplateEditor.ts
// The existing addItemContent function should automatically handle new types:

const addItemContent = (sectionIndex: number, itemIndex: number, contentType: ContentType) => {
  const newContent: ChecklistItemContent = {
    id: `content_${Date.now()}`,
    type: contentType,
    value: "",
    // For link type, initialize with empty optional fields
    ...(contentType === "link" && {
      linkTitle: "",
      linkDescription: ""
    })
  };
  
  // Rest of function remains the same
};
```

### 8. Add Link Preview API (Optional)

To fetch link metadata, you can add an API endpoint:

```typescript
// functions/api/handlers/link-preview.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const linkPreview = new Hono();

linkPreview.use('*', cors());

linkPreview.get('/', async (c) => {
  const url = c.req.query('url');
  
  if (!url) {
    return c.json({ error: 'URL parameter is required' }, 400);
  }
  
  try {
    // Validate URL
    const validUrl = new URL(url);
    
    // Fetch the page
    const response = await fetch(validUrl.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreview/1.0)'
      }
    });
    
    if (!response.ok) {
      return c.json({ error: 'Failed to fetch URL' }, 400);
    }
    
    const html = await response.text();
    
    // Extract title and description using regex (basic implementation)
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                     html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    
    const title = titleMatch ? titleMatch[1].trim() : '';
    const description = descMatch ? descMatch[1].trim() : '';
    
    return c.json({
      title,
      description,
      url: validUrl.href
    });
    
  } catch (error) {
    return c.json({ error: 'Invalid URL or fetch failed' }, 400);
  }
});

export { linkPreview };
```

### 9. Add Type Guards (Optional)

```typescript
// src/utils/typeGuards.ts
import { ChecklistItemContent } from '@/types/checklist';

export function isLinkContent(
  content: ChecklistItemContent
): content is ChecklistItemContent & { type: 'link'; linkTitle?: string; linkDescription?: string } {
  return content.type === 'link';
}

export function hasLinkMetadata(content: ChecklistItemContent): boolean {
  return isLinkContent(content) && !!(content.linkTitle || content.linkDescription);
}

// Usage
if (isLinkContent(content)) {
  console.log('Link title:', content.linkTitle);
  console.log('Link description:', content.linkDescription);
}
```

### 10. Add Tests

```typescript
// src/components/template-editor/content-types/__tests__/LinkContentEditor.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LinkContentEditor } from '../LinkContentEditor';

const mockProps = {
  value: 'https://example.com',
  linkTitle: 'Example Site',
  linkDescription: 'An example website',
  onValueChange: jest.fn(),
  onUpdateMeta: jest.fn()
};

describe('LinkContentEditor', () => {
  it('renders link input fields', () => {
    render(<LinkContentEditor {...mockProps} />);
    
    expect(screen.getByLabelText('URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Link Title (Optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (Optional)')).toBeInTheDocument();
  });
  
  it('validates URL input', async () => {
    const onValueChange = jest.fn();
    render(<LinkContentEditor {...mockProps} onValueChange={onValueChange} />);
    
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, { target: { value: 'https://newsite.com' } });
    
    expect(onValueChange).toHaveBeenCalledWith('https://newsite.com');
  });
  
  it('updates link metadata', () => {
    const onUpdateMeta = jest.fn();
    render(<LinkContentEditor {...mockProps} onUpdateMeta={onUpdateMeta} />);
    
    const titleInput = screen.getByLabelText('Link Title (Optional)');
    fireEvent.change(titleInput, { target: { value: 'New Title' } });
    
    expect(onUpdateMeta).toHaveBeenCalledWith({ linkTitle: 'New Title' });
  });
  
  it('displays link preview', () => {
    render(<LinkContentEditor {...mockProps} />);
    
    expect(screen.getByText('Example Site')).toBeInTheDocument();
    expect(screen.getByText('An example website')).toBeInTheDocument();
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });
});
```

## Complete Example

Here's how all the pieces work together:

```typescript
// Creating a checklist item with the new link content type
const newItem: ChecklistItem = {
  id: 'item_123',
  title: 'Research Documentation',
  description: 'Review the official documentation',
  contents: [
    {
      id: 'content_456',
      type: 'link',
      value: 'https://docs.example.com/api-guide',
      linkTitle: 'API Documentation',
      linkDescription: 'Complete guide to using our REST API'
    },
    {
      id: 'content_789',
      type: 'text',
      value: '## Notes\n\nKey points to remember when reviewing the documentation:'
    }
  ],
  isCompleted: false,
};

// The content will be automatically handled by:
// 1. ContentRenderer for display
// 2. LinkContentEditor for editing
// 3. Zod schema for validation
// 4. Template editor hooks for state management
```

## Common Pitfalls

1. **Forgetting type guards** - Always check content type before accessing properties
2. **Missing validation** - Validate URLs and sanitize user input
3. **No error handling** - Handle URL validation failures gracefully
4. **Security issues** - Validate and sanitize URLs to prevent XSS
5. **Missing optional fields** - Remember to handle optional metadata fields (linkTitle, linkDescription)
6. **Not updating all components** - Make sure to update ContentEditor, ContentRenderer, and ContentAddPanel
7. **Forgetting schema updates** - Update Zod schema to include new fields

## See Also:
- [Add Message Handler Recipe](./add-message-handler.md)
- [Add Dropdown Recipe](./add-dropdown.md)
- [Add New Tab Recipe](./add-new-tab.md)
- [Component Development Best Practices](../patterns/component-pattern.md)