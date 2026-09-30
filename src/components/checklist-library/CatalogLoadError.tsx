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
  titleAs: Title = 'h2',
}: {
  className?: string;
  onRetry: () => void;
  // h2 in place of a page's first section; h1 when the failure is the whole page.
  titleAs?: 'h1' | 'h2';
}) => (
  <Empty className={cn('border', className)} role="alert">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <AlertCircle />
      </EmptyMedia>
      <EmptyTitle>
        <Title>Could not load templates</Title>
      </EmptyTitle>
      <EmptyDescription>Check your connection and try again.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button onClick={onRetry} variant="outline">
        Try again
      </Button>
    </EmptyContent>
  </Empty>
);
