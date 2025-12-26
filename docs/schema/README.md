# Checklist Template JSON Schema Documentation

This document explains the current structure and validation for importing/exporting checklist templates in JSON format (Updated January 2025).

## Overview

The application supports downloading and uploading checklist templates through the Template Backup feature. The system uses comprehensive Zod schemas for validation to ensure data integrity and security.

**Current Implementation**: Template backup/restore is implemented in `src/components/TemplateBackup.tsx` and uses validation schemas from `src/lib/schemas/checklistSchema.ts`.

## Current JSON Structure (2025)

### Root Object (TemplateBackup)

```typescript
// From src/lib/schemas/checklistSchema.ts
export const templateBackupSchema = z.object({
  version: z.string(),                    // Schema version (currently "1.0.0")
  exportedAt: z.string(),                 // ISO timestamp of export
  exportedBy: z.string().optional(),      // Exporter name/system
  templates: z.array(checklistTemplateSchema),  // Array of templates
  metadata: z.object({
    totalTemplates: z.number(),
    publicTemplates: z.number(),
    privateTemplates: z.number()
  }).optional()
});
```

### Template Object (ChecklistTemplate)

Each template in the `templates` array follows this structure:

```typescript
// Current schema from src/lib/schemas/checklistSchema.ts
export const checklistTemplateSchema = z.object({
  id: z.string(),                         // Unique template identifier
  title: z.string(),                      // Template title
  description: z.string().optional(),     // Optional description
  sections: z.array(checklistSectionSchema),  // Array of sections
  userId: z.string(),                     // Creator's user ID
  createdAt: z.string(),                  // ISO timestamp
  updatedAt: z.string(),                  // ISO timestamp
  isPublic: z.boolean(),                  // Public visibility flag
  slug: z.string().optional(),            // URL-friendly identifier
  categories: z.array(z.string()).optional(),  // Category tags
  tags: z.array(z.string()).optional()    // General tags
});
```

**Additional Properties** (from TypeScript interface in `src/types/checklist.ts`):
```typescript
export interface Template {
  // ... core schema properties above, plus:
  seoTitle?: string;           // SEO-optimized title
  seoDescription?: string;     // SEO meta description
  seoUrl?: string;            // Custom URL slug for SEO
  version?: number;           // Template version number
  ownerProfile?: UserProfile; // Template owner information
}
```

### Section Object (ChecklistSection)

```typescript
export const checklistSectionSchema = z.object({
  id: z.string(),                    // Unique section identifier
  title: z.string(),                 // Section title
  items: z.array(checklistItemSchema)  // Array of checklist items
});
```

### Item Object (ChecklistItem)

```typescript
export const checklistItemSchema = z.object({
  id: z.string(),                              // Unique item identifier
  title: z.string(),                           // Item title
  description: z.string().optional(),          // Optional description
  contents: z.array(checklistItemContentSchema).optional(),  // Content array
  isCompleted: z.boolean().optional()          // Completion status
});
```

### Content Object (ChecklistItemContent) - Current Types

The content system supports multiple types with comprehensive validation:

```typescript
export const checklistItemContentSchema = z.object({
  id: z.string(),                                    // Unique content identifier
  type: z.enum([
    "text",      // Text/markdown content
    "image",     // Image content
    "video",     // Video content  
    "file",      // File attachments
    "embed",     // Embedded content (maps, widgets)
    "subItems",  // Sub-checklist items
    "page"       // Page references
  ]),
  value: z.string(),                                 // Main content value
  uploadType: z.enum(["url", "upload"]).optional(),  // How content was added
  fileName: z.string().optional(),                   // Original filename
  fileSize: z.number().optional(),                   // File size in bytes
  subItems: z.array(checklistSubItemSchema).optional(), // For subItems type
  pageId: z.string().optional()                      // For page type
});
```

### Sub-Item Object (ChecklistSubItem)

```typescript
export const checklistSubItemSchema = z.object({
  id: z.string(),                          // Unique sub-item identifier
  title: z.string(),                       // Sub-item title
  isCompleted: z.boolean().optional()      // Completion status
});
```

## Content Types and Usage (Current Implementation)

### Text Content
- **Type**: `"text"`
- **Value**: Markdown-formatted text content
- **Usage**: Instructions, descriptions, rich text
- **Example**:
```json
{
  "id": "content-1",
  "type": "text",
  "value": "# Important Note\n\nThis is **bold** text with [links](https://example.com)."
}
```

### Image Content
- **Type**: `"image"`
- **Value**: Image URL or path
- **uploadType**: `"url"` (external link) or `"upload"` (uploaded file)
- **fileName**: Original filename (for uploaded files)
- **fileSize**: File size in bytes (for uploaded files)
- **Example**:
```json
{
  "id": "content-2",
  "type": "image",
  "value": "https://example.com/image.jpg",
  "uploadType": "url",
  "fileName": "example-image.jpg",
  "fileSize": 245760
}
```

### Video Content
- **Type**: `"video"`
- **Value**: Video URL or embed URL
- **uploadType**: `"url"` or `"upload"`
- **Example**:
```json
{
  "id": "content-3",
  "type": "video", 
  "value": "https://youtube.com/embed/dQw4w9WgXcQ",
  "uploadType": "url"
}
```

### File Content
- **Type**: `"file"`
- **Value**: File URL or path
- **fileName**: Required for files
- **fileSize**: File size in bytes
- **uploadType**: How the file was added
- **Example**:
```json
{
  "id": "content-4",
  "type": "file",
  "value": "/uploads/document.pdf",
  "fileName": "important-document.pdf",
  "fileSize": 1048576,
  "uploadType": "upload"
}
```

### Embed Content
- **Type**: `"embed"`
- **Value**: Embed code or iframe source
- **Usage**: Google Maps, widgets, external tools
- **Example**:
```json
{
  "id": "content-5",
  "type": "embed",
  "value": "<iframe src=\"https://maps.google.com/embed?pb=!1m18...\"></iframe>"
}
```

### Sub-Items Content
- **Type**: `"subItems"`
- **Value**: Usually empty string
- **subItems**: Array of sub-checklist items
- **Usage**: Nested checklist functionality
- **Example**:
```json
{
  "id": "content-6",
  "type": "subItems",
  "value": "",
  "subItems": [
    {
      "id": "sub-1",
      "title": "Sub-task 1",
      "isCompleted": false
    },
    {
      "id": "sub-2", 
      "title": "Sub-task 2",
      "isCompleted": true
    }
  ]
}
```

### Page Content
- **Type**: `"page"`
- **Value**: Page content or title
- **pageId**: Reference to a page ID
- **Usage**: Cross-references between templates/pages
- **Example**:
```json
{
  "id": "content-7",
  "type": "page",
  "value": "Reference to Setup Guide",
  "pageId": "setup-guide-123"
}
```

## Validation System (Current Implementation)

### Zod Schema Validation

The application uses comprehensive Zod schemas for type-safe validation:

```typescript
// From src/lib/schemas/checklistSchema.ts

// Main validation functions
export const validateTemplate = (data: unknown): ChecklistTemplate => {
  return checklistTemplateSchema.parse(data);
};

export const validateBackup = (data: unknown): TemplateBackup => {
  return templateBackupSchema.parse(data);
};

export const validateTemplateArray = (data: unknown): ChecklistTemplate[] => {
  return z.array(checklistTemplateSchema).parse(data);
};
```

### Field Requirements (Current Schema)

#### Required Fields
- `id`: Unique string identifier (auto-generated if missing)
- `title`: Non-empty string
- `sections`: Array of sections (can be empty)
- `userId`: Creator's user ID string
- `createdAt`: ISO date string
- `updatedAt`: ISO date string
- `isPublic`: Boolean visibility flag

#### Optional Fields
- `description`: Text description
- `slug`: URL-friendly identifier (auto-generated from title if missing)
- `categories`: Array of category strings
- `tags`: Array of tag strings
- `seoTitle`, `seoDescription`, `seoUrl`: SEO metadata
- `version`: Numeric version identifier
- `ownerProfile`: User profile information

### Data Types and Validation Rules

```typescript
// String validation
z.string()                    // Basic string
z.string().min(1, 'Required') // Non-empty string
z.string().optional()         // Optional string

// Number validation  
z.number()                    // Any number
z.number().positive()         // Positive numbers only
z.number().optional()         // Optional number

// Boolean validation
z.boolean()                   // true/false
z.boolean().default(false)    // Default to false

// Array validation
z.array(z.string())          // Array of strings
z.array(schemaObject)        // Array of objects matching schema

// Date validation
z.string()                   // ISO date strings (YYYY-MM-DDTHH:mm:ss.sssZ)

// Enum validation
z.enum(["text", "image", "video", "file", "embed", "subItems", "page"])
```

## Example Templates (Current)

The documentation includes three working example templates:

### 1. Camping Checklist (`camping-checklist.json`)
- Outdoor adventure preparation
- Multiple sections (gear, food, safety)
- Mixed content types (text, images, sub-items)

### 2. Comprehensive Template Demo (`comprehensive-template-demo.json`)  
- Showcases all available content types
- Complex nested structure
- SEO metadata examples

### 3. Wedding Checklist (`wedding-checklist.json`)
- Event planning timeline
- Vendor management
- Task dependencies

## Import/Export Usage (Current Implementation)

### Exporting Templates

**Location**: Templates page → "Template Backup & Import" section

```typescript
// From src/components/TemplateBackup.tsx
const handleExportAll = async () => {
  try {
    const backupData = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      exportedBy: user?.name || "System",
      templates: templates,
      metadata: {
        totalTemplates: templates.length,
        publicTemplates: templates.filter(t => t.isPublic).length,
        privateTemplates: templates.filter(t => !t.isPublic).length
      }
    };
    
    // Validate before export
    const validated = validateBackup(backupData);
    
    // Download JSON file
    const blob = new Blob([JSON.stringify(validated, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `templates-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  } catch (error) {
    toast({
      title: 'Export Error',
      description: 'Failed to export templates',
      variant: 'destructive'
    });
  }
};
```

### Importing Templates

**Process**:
1. Select JSON file via file input
2. Parse and validate JSON structure
3. Preview templates to be imported
4. Confirm import and process

```typescript
// From src/components/TemplateBackup.tsx
const handleImport = async (file: File) => {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate backup format
    const validatedBackup = validateBackup(data);
    
    // Process each template
    for (const template of validatedBackup.templates) {
      // Generate new IDs to avoid conflicts
      const processedTemplate = {
        ...template,
        id: crypto.randomUUID(),
        userId: user?.id,
        slug: generateSlug(template.title),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPublic: true, // Default to public
        sections: template.sections.map(section => ({
          ...section,
          id: crypto.randomUUID(),
          items: section.items.map(item => ({
            ...item,
            id: crypto.randomUUID(),
            isCompleted: false, // Reset completion status
            contents: item.contents?.map(content => ({
              ...content,
              id: crypto.randomUUID()
            })) || []
          }))
        }))
      };
      
      // Create template via API
      await createTemplate(processedTemplate);
    }
    
    toast({
      title: 'Import Successful',
      description: `Imported ${validatedBackup.templates.length} templates`
    });
  } catch (error) {
    toast({
      title: 'Import Error',
      description: error.message,
      variant: 'destructive'
    });
  }
};
```

### Import Processing Rules (Current)

1. **ID Generation**: New unique IDs generated for all objects to prevent conflicts
2. **User Assignment**: Templates assigned to current user
3. **Slug Generation**: URL-friendly slugs regenerated if conflicts exist
4. **Public by Default**: Imported templates marked as public
5. **Reset Completion**: All completion states reset to false
6. **Timestamp Update**: Created/updated timestamps set to import time

## Schema Validation Errors (Current Handling)

The system provides detailed validation error messages:

```typescript
// Common validation errors and handling
try {
  const validated = validateTemplate(templateData);
} catch (error) {
  if (error instanceof z.ZodError) {
    const issues = error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
      received: issue.received
    }));
    
    console.error('Validation errors:', issues);
    
    toast({
      title: 'Validation Error',
      description: `Invalid template format: ${issues[0].message}`,
      variant: 'destructive'
    });
  }
}
```

### Common Validation Issues

1. **Missing Required Fields**: `title`, `userId`, timestamps
2. **Invalid Data Types**: Non-string IDs, non-boolean flags
3. **Invalid Content Types**: Unsupported content type values
4. **Array Structure**: Malformed sections or items arrays
5. **Date Format**: Non-ISO timestamp strings

## File Size and Limits (Current Implementation)

### Recommended Limits
- **Max File Size**: 50MB per backup file
- **Max Templates**: 1000 templates per backup
- **Max Sections**: 100 sections per template
- **Max Items**: 500 items per template
- **Max Content**: 50 content objects per item

### Performance Considerations
- Large templates with many content objects may slow import/export
- Image and file references should use external URLs when possible
- Consider splitting very large backups into multiple files

## Migration and Compatibility (Current System)

### Version Handling
- Current schema version: `1.0.0`
- Forward compatibility: New optional fields added without version bump
- Breaking changes: Version bump required with migration logic

### Legacy Support
- Templates created before schema implementation are auto-migrated
- Missing fields populated with default values during import
- Backward compatibility maintained for existing templates

## API Integration (Current Endpoints)

### Template CRUD Operations

```typescript
// Template API endpoints (from functions/api/handlers/templates.ts)
GET    /api/templates              // List user templates
POST   /api/templates              // Create template (validates schema)
PUT    /api/templates/:id          // Update template (validates schema)
DELETE /api/templates/:id          // Delete template
GET    /api/templates/public       // List public templates
```

### Validation at API Level

```typescript
// API-level validation (example)
export async function createTemplate(templateData: unknown) {
  try {
    // Validate against schema
    const validTemplate = validateTemplate(templateData);
    
    // Additional business logic validation
    if (!validTemplate.userId) {
      throw new Error('User ID required');
    }
    
    // Store in database
    const result = await db.insert('templates', validTemplate);
    return result;
  } catch (error) {
    throw new Error(`Template validation failed: ${error.message}`);
  }
}
```

## Security Considerations (Current Implementation)

### ⚠️ Known Security Issues
1. **XSS Vulnerability**: HTML content in templates not sanitized before rendering
2. **File Upload Security**: Limited validation of uploaded content
3. **Input Sanitization**: Some user inputs may not be properly sanitized

### Required Security Enhancements

```typescript
// Install and use DOMPurify for HTML sanitization
import DOMPurify from 'dompurify';

// Sanitize HTML content before rendering
const sanitizeHtml = (htmlContent: string): string => {
  return DOMPurify.sanitize(htmlContent, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false
  });
};

// Use in content rendering
const SafeContentRenderer = ({ content }: { content: string }) => (
  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
);
```

### Best Practices
1. **Validate All Input**: Use Zod schemas consistently
2. **Sanitize HTML**: Clean all HTML content before rendering  
3. **File Size Limits**: Enforce reasonable file size restrictions
4. **Content Type Validation**: Verify file types match declared types
5. **Rate Limiting**: Implement upload/import rate limits

## Development Tools and Testing

### Schema Testing

```typescript
// Test schema validation (from tests/unit/lib/schemas/checklistSchema.test.ts)
import { describe, it, expect } from 'vitest';
import { validateTemplate, validateBackup } from '@/lib/schemas/checklistSchema';

describe('Template Schema Validation', () => {
  it('validates correct template structure', () => {
    const validTemplate = {
      id: 'test-id',
      title: 'Test Template',
      sections: [],
      userId: 'user-123',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      isPublic: true
    };
    
    expect(() => validateTemplate(validTemplate)).not.toThrow();
  });
  
  it('throws error for invalid template', () => {
    const invalidTemplate = {
      // Missing required fields
      title: 'Test Template'
    };
    
    expect(() => validateTemplate(invalidTemplate)).toThrow();
  });
});
```

### Backup Testing

```typescript
// Test backup functionality (from tests/unit/lib/utils/templateBackup.test.ts)
describe('Template Backup', () => {
  it('creates valid backup structure', () => {
    const templates = [/* valid templates */];
    const backup = createBackup(templates);
    
    expect(() => validateBackup(backup)).not.toThrow();
    expect(backup.version).toBe('1.0.0');
    expect(backup.templates).toHaveLength(templates.length);
  });
});
```

## Conclusion

The current JSON schema system provides:

- **Type Safety**: Comprehensive Zod validation prevents invalid data
- **Flexibility**: Support for multiple content types and nested structures  
- **Extensibility**: Optional fields allow for future enhancements
- **Import/Export**: Robust backup and restore functionality
- **API Integration**: Schema validation at all data entry points

**Critical Issues**: The system needs immediate attention for XSS vulnerabilities and input sanitization before production use.

**Future Enhancements**: Consider implementing schema versioning, migration utilities, and enhanced security measures for a production-ready system.

This documentation reflects the current implementation as of January 2025 and should be updated as the schema evolves.