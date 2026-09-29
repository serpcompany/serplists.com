import type { ReactNode } from 'react';

import { IconTile } from '@/components/layout/IconTile';
import { Link } from '@/components/navigation/Link';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemHeader,
  ItemTitle,
} from '@/components/ui/item';
import { cn } from '@/lib/utils';

type ListCardProps = {
  className?: string;
  description?: ReactNode;
  // The page the card opens; the whole card is the link.
  href?: string;
  icon: ReactNode;
  // Trailing text, such as a count.
  meta?: ReactNode;
  // `vertical` puts the icon on its own row above the title, as in category tiles.
  orientation?: 'horizontal' | 'vertical';
  title: ReactNode;
};

// A bordered card with an icon tile and a title (the shadcn Item, outline variant): list
// rows, feature lists and category tiles.
export function ListCard({
  className,
  description,
  href,
  icon,
  meta,
  orientation = 'horizontal',
  title,
}: ListCardProps) {
  const vertical = orientation === 'vertical';
  const tile = (
    <IconTile size="sm" className={vertical ? undefined : 'self-start'}>
      {icon}
    </IconTile>
  );

  return (
    <Item
      variant="outline"
      className={cn(vertical && 'gap-y-4', className)}
      data-list-card={orientation}
      render={href ? <Link href={href} /> : undefined}
    >
      {vertical ? <ItemHeader>{tile}</ItemHeader> : tile}
      <ItemContent className="min-w-0">
        <ItemTitle className="line-clamp-2">{title}</ItemTitle>
        {description ? <ItemDescription className="line-clamp-none">{description}</ItemDescription> : null}
      </ItemContent>
      {meta ? <ItemActions className="text-sm text-muted-foreground">{meta}</ItemActions> : null}
    </Item>
  );
}
