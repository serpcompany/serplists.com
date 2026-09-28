# Template Content Types

Checklist items hold typed content blocks (text, image, video, file, embed,
sub-items). This doc shows how to add a content type and how editor tabs work.

## Adding a content type

Example: a "link" type.

### Files involved
- `src/types/checklist.ts`
- `src/lib/schemas/checklistSchema.ts`
- `src/lib/forms/templateEditorForm.ts`
- `src/components/template-editor/content-types/`
- `src/components/template-editor/ContentAddPanel.tsx`
- `src/components/template-editor/ContentEditor.tsx`
- `src/components/shared/ContentRenderer.tsx`

### Steps

#### 1. Extend the TypeScript types
Add the new type to `ChecklistItemContent` and define any extra fields.

```ts
// src/types/checklist.ts
export type ChecklistItemContent = {
  type: "text" | "image" | "video" | "file" | "embed" | "subItems" | "link";
  value: string;
  linkTitle?: string;
};
```

#### 2. Update the Zod schema
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

Also add the type to `templateEditorContentSchema` in
`src/lib/forms/templateEditorForm.ts`; the editor's form types are inferred from it.

#### 3. Create an editor component
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

#### 4. Add to the content picker
Add a button in `ContentAddPanel` and allow the new type in `onAddContent`.

#### 5. Render the editor
Update `ContentEditor` to render the new editor in the `switch` block.

#### 6. Render in view mode
Update `ContentRenderer` to display the new content type in the checklist view.

#### 7. Consider uploads
If the type needs file uploads, reuse the existing buckets in `functions/api/handlers/uploads.ts` and the helpers in `src/lib/utils/fileUpload.ts`.
An upload finishes after the render that started it, so apply its result as one write
built from the current form values: find the block with `findTemplateEditorContentPath`
(by id, since blocks can move or be removed meanwhile) and never spread the
render-time `useWatch` snapshot, which still holds the old value (see
`handleFileChange` in `ContentEditor`). Never delete the previous file: templates,
runs, and copies may still use it ([R2 uploads](database-operations.md#r2-uploads)).

## Editor tabs

Tabs use shadcn/ui `src/components/ui/tabs.tsx`; see
`src/components/template-editor/content-types/TextContentEditor.tsx` for real usage.
Each `TabsTrigger` value needs a matching `TabsContent` value:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="activity">Activity</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">...</TabsContent>
  <TabsContent value="activity">...</TabsContent>
</Tabs>;
```
