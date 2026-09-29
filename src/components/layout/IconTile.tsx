import type { HTMLAttributes } from 'react';
import type { VariantProps } from 'class-variance-authority';

import { iconTileVariants } from '@/components/layout/page-shell.styles';
import { cn } from '@/lib/utils';

type IconTileProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof iconTileVariants>;

// A square tile holding one icon: category tiles, list cards, card media, detail headers.
// The icon is decoration, so the tile is hidden from assistive technology.
export function IconTile({ children, className, size, tone, ...props }: IconTileProps) {
  return (
    <div
      aria-hidden="true"
      data-slot="icon-tile"
      className={cn(iconTileVariants({ size, tone }), className)}
      {...props}
    >
      {children}
    </div>
  );
}
