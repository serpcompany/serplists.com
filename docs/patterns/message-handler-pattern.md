# Message Handler Pattern

Event handlers follow a consistent flow:
1. Validate or normalize input.
2. Call a context action or `api` method.
3. Update UI and show toast feedback.
4. Handle errors via `toast.error` and `console.error`.

## Example
```tsx
import { toast } from "sonner";
import { useTemplates } from "@/contexts/TemplatesContext";

const { createTemplate } = useTemplates();

const handleCreate = async () => {
  try {
    await createTemplate({
      title: "New Template",
      sections: [],
      isPublic: true,
    });
    toast.success("Template created");
  } catch (error) {
    console.error("Create template failed", error);
    toast.error("Failed to create template");
  }
};
```
