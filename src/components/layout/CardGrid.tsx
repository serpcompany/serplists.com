import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const cardGridVariants = cva('grid gap-6', {
  variants: {
    columns: {
      1: 'grid-cols-1',
      2: 'sm:grid-cols-2',
      3: 'sm:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-2 gap-4 lg:grid-cols-4',
    },
  },
  defaultVariants: {
    columns: 3,
  },
});

type CardGridProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardGridVariants>;

export function CardGrid({ className, columns, ...props }: CardGridProps) {
  return <div className={cn(cardGridVariants({ columns }), className)} data-slot="card-grid" {...props} />;
}
