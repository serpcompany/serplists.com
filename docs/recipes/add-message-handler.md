# Recipe: Add Message Handler

Handlers usually live next to the UI component and call context or API methods, then show toast feedback.

## Example
```tsx
import { toast } from "sonner";
import { api } from "@/lib/api";

const handleSave = async () => {
  try {
    await api.updateProfile({ name: "New Name" });
    toast.success("Profile updated");
  } catch (error) {
    console.error("Profile update failed", error);
    toast.error("Failed to update profile");
  }
};
```

## Tips
- Use `useMutation` from React Query for server writes when available.
- Keep handlers small and delegate heavy logic to helpers.
