import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const publicPillVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
  {
    variants: {
      tone: {
        active:
          'border-border bg-secondary text-secondary-foreground hover:bg-secondary/80',
        neutral:
          'border-border/70 bg-background text-muted-foreground hover:border-border hover:bg-muted/25 hover:text-foreground',
        subtle:
          'border-border/70 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/35 hover:text-foreground',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export interface PublicPillProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof publicPillVariants> {
  asChild?: boolean;
}

export function PublicPill({
  asChild = false,
  className,
  tone,
  ...props
}: PublicPillProps) {
  const Comp = asChild ? Slot : 'div';

  return (
    <Comp className={cn(publicPillVariants({ tone }), className)} {...props} />
  );
}
