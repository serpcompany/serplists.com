import type { ReactNode } from 'react';

import { IconTile } from '@/components/layout/IconTile';
import { Link } from '@/components/navigation/Link';
import { cn } from '@/lib/utils';

type MediaCardProps = {
  action?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
  clampDescription?: boolean;
  description?: ReactNode;
  eyebrow?: ReactNode;
  href?: string | null;
  icon: ReactNode;
  mediaOverlay?: ReactNode;
  orientation?: 'vertical' | 'horizontal';
  title: ReactNode;
  titleAs?: 'h2' | 'h3';
};

export function MediaCard({
  action,
  badge,
  children,
  clampDescription = false,
  className,
  description,
  eyebrow,
  href,
  icon,
  mediaOverlay,
  orientation = 'vertical',
  title,
  titleAs: Title = 'h3',
}: MediaCardProps) {
  const horizontal = orientation === 'horizontal';

  return (
    <article
      className={cn(
        'group relative flex flex-col gap-3',
        horizontal && 'sm:flex-row sm:gap-5',
        className,
      )}
      data-slot="media-card"
      data-orientation={orientation}
    >
      <div
        className={cn(
          'relative flex aspect-2/1 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-foreground/10',
          horizontal && 'sm:aspect-auto sm:min-h-32 sm:w-44',
        )}
      >
        <IconTile size="lg" tone="card">
          {icon}
        </IconTile>
        {badge ? <div className="absolute top-3 right-3">{badge}</div> : null}
        {mediaOverlay}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {eyebrow ? <div className="text-xs font-medium text-muted-foreground">{eyebrow}</div> : null}
        <Title className="text-base font-semibold tracking-tight text-balance wrap-break-word">
          {href ? (
            <Link
              href={href}
              data-slot="media-card-link"
              className="rounded-sm underline-offset-4 outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </Title>
        {description ? (
          <p className={cn('text-sm text-muted-foreground', clampDescription && 'line-clamp-2')}>
            {description}
          </p>
        ) : null}
        {children ? (
          <div className="mt-auto flex flex-col gap-3 pt-1 [&_a]:relative [&_a]:z-10 [&_button]:relative [&_button]:z-10">
            {children}
          </div>
        ) : null}
      </div>
      {action ? <div className="absolute top-2 right-2 z-10">{action}</div> : null}
    </article>
  );
}
