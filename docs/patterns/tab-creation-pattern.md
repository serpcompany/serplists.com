# Tab Creation Pattern

Tabs use the shadcn/ui wrapper around Radix Tabs in `src/components/ui/tabs.tsx`.

## Related files

- `src/components/ui/tabs.tsx`
- `src/components/template-editor/content-types/TextContentEditor.tsx`

## Example

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

<Tabs defaultValue="overview" className="space-y-6">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="details">Details</TabsTrigger>
  </TabsList>

  <TabsContent value="overview">Overview content</TabsContent>
  <TabsContent value="details">Details content</TabsContent>
</Tabs>;
```
