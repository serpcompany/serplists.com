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
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  href?: string;
  icon: ReactNode;
  meta?: ReactNode;
  orientation?: 'horizontal' | 'vertical';
  title: ReactNode;
  titleAs?: 'h2' | 'h3';
};

export function ListCard({
  actions,
  className,
  description,
  href,
  icon,
  meta,
  orientation = 'horizontal',
  title,
  titleAs: Title,
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
        <ItemTitle className="line-clamp-2">{Title ? <Title>{title}</Title> : title}</ItemTitle>
        {description ? <ItemDescription className="line-clamp-none">{description}</ItemDescription> : null}
      </ItemContent>
      {meta ? <ItemActions className="text-sm text-muted-foreground">{meta}</ItemActions> : null}
      {actions ? <ItemActions className="basis-full justify-end sm:basis-auto">{actions}</ItemActions> : null}
    </Item>
  );
}
