# Component Pattern

## Conventions used in this repo
- Function components with typed props.
- Base UI comes from `src/components/ui/` (shadcn/ui + Radix).
- Utility class composition via `cn` from `src/lib/utils.ts`.
- Toasts via `sonner` (see usage in pages and contexts).
- Markdown rendering via `react-markdown` with `safeUrl`.

## Example skeleton
```tsx
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ExampleCardProps {
  title: string;
  onAction?: () => void;
}

export function ExampleCard({ title, onAction }: ExampleCardProps) {
  return (
    <div className={cn("rounded border p-4")}> 
      <h3 className="font-semibold">{title}</h3>
      {onAction && (
        <Button size="sm" onClick={onAction}>
          Action
        </Button>
      )}
    </div>
  );
}
```
