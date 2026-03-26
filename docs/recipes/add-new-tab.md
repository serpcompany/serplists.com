# Recipe: Add New Tab

Tabs are implemented with shadcn/ui in `src/components/ui/tabs.tsx`.

## Reference usage

- `src/components/template-editor/content-types/TextContentEditor.tsx`

## Steps

1. Import `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.
2. Add a new trigger with a matching value.
3. Add a new `TabsContent` block with the same value.

## Example

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
