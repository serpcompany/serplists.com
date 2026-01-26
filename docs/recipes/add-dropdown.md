# Recipe: Add Dropdown

This project uses shadcn/ui dropdown components (Radix) located in `src/components/ui/`.

## Options
- `Select` for form-style dropdowns
- `DropdownMenu` for action menus

## Example (Select)
```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const [status, setStatus] = useState("open");

<Select value={status} onValueChange={setStatus}>
  <SelectTrigger className="w-48">
    <SelectValue placeholder="Choose status" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="open">Open</SelectItem>
    <SelectItem value="closed">Closed</SelectItem>
  </SelectContent>
</Select>
```

## Notes
- Keep the value in React state or form state.
- If the value must be persisted, update the corresponding type and API payload.
