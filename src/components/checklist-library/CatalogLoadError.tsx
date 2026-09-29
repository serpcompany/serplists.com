import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
  <Empty className={cn('border', className)} role="alert">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <AlertCircle />
      </EmptyMedia>
      <EmptyTitle>Could not load templates</EmptyTitle>
      <EmptyDescription>Check your connection and try again.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button onClick={onRetry} variant="outline">
        Try again
      </Button>
    </EmptyContent>
  </Empty>
);
