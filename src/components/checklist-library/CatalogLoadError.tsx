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

export const CatalogLoadError = ({
  className,
  onRetry,
  titleAs: Title = 'h2',
}: {
  className?: string;
  onRetry: () => void;
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
