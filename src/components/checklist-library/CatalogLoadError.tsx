import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Shown when the public catalog request failed, so discovery pages never present a failed
// load as "no templates" or as a missing page.
export const CatalogLoadError = ({
  className,
  onRetry,
}: {
  className?: string;
  onRetry: () => void;
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-12 text-center',
      className,
    )}
    role="alert"
  >
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
      <AlertCircle className="h-7 w-7 text-muted-foreground" />
    </div>
    <h3 className="mb-1 text-sm font-medium text-foreground">
      Could not load templates
    </h3>
    <p className="text-sm text-muted-foreground">
      Check your connection and try again.
    </p>
    <Button className="mt-6" onClick={onRetry} variant="outline">
      Try again
    </Button>
  </div>
);
