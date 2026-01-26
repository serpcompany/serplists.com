# Recipe: Add Data Type

This recipe explains how to add a new checklist content type (for example, a "link" type).

## Files involved
- `src/types/checklist.ts`
- `src/lib/schemas/checklistSchema.ts`
- `src/components/template-editor/content-types/`
- `src/components/template-editor/ContentAddPanel.tsx`
- `src/components/template-editor/ContentEditor.tsx`
- `src/components/shared/ContentRenderer.tsx`

## Steps

### 1. Extend the TypeScript types
Add the new type to `ChecklistItemContent` and define any extra fields.

```ts
// src/types/checklist.ts
export type ChecklistItemContent = {
  type: "text" | "image" | "video" | "file" | "embed" | "subItems" | "link";
  value: string;
  linkTitle?: string;
};
```

### 2. Update the Zod schema
Keep the Zod schema in sync with the type definition.

```ts
// src/lib/schemas/checklistSchema.ts
export const checklistItemContentSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "video", "file", "embed", "subItems", "link"]),
  value: z.string(),
  linkTitle: z.string().optional(),
  uploadType: z.enum(["url", "upload"]).optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  subItems: z.array(checklistSubItemSchema).optional(),
});
```

### 3. Create an editor component
Add a new component under `src/components/template-editor/content-types/`.

```tsx
// src/components/template-editor/content-types/LinkContentEditor.tsx
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface LinkContentEditorProps {
  value: string;
  onValueChange: (value: string) => void;
  linkTitle?: string;
  onLinkTitleChange: (value: string) => void;
}

export function LinkContentEditor({ value, onValueChange, linkTitle, onLinkTitleChange }: LinkContentEditorProps) {
  return (
    <div className="space-y-2">
      <Label>Link</Label>
      <Input value={linkTitle || ""} onChange={(e) => onLinkTitleChange(e.target.value)} placeholder="Link title" />
      <Input value={value} onChange={(e) => onValueChange(e.target.value)} placeholder="https://..." />
    </div>
  );
}
```

### 4. Add to the content picker
Add a button in `ContentAddPanel` and allow the new type in `onAddContent`.

### 5. Render the editor
Update `ContentEditor` to render the new editor in the `switch` block.

### 6. Render in view mode
Update `ContentRenderer` to display the new content type in the checklist view.

### 7. Consider uploads
If the type needs file uploads, reuse the existing buckets in `functions/api/handlers/uploads.ts` and the helpers in `src/lib/utils/fileUpload.ts`.
