import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { cn } from '@/lib/utils';

interface PublicPageContainerProps {
  children: React.ReactNode;
  className?: string;
}

interface PublicPageBackLinkProps {
  children: React.ReactNode;
  className?: string;
  to: string;
}

interface PublicPageSplitLayoutProps {
  aside?: React.ReactNode;
  asideClassName?: string;
  asidePosition?: 'end' | 'start';
  className?: string;
  main: React.ReactNode;
  mainClassName?: string;
}

interface PublicSidebarSectionProps {
  children: React.ReactNode;
  className?: string;
  divider?: boolean;
  title: React.ReactNode;
}

export function PublicPageContainer({
  children,
  className,
}: PublicPageContainerProps) {
  return (
    <div className={cn('mx-auto max-w-[1160px] px-4 sm:px-6 lg:px-8', className)}>
      {children}
    </div>
  );
}

export function PublicPageBackLink({
  children,
  className,
  to,
}: PublicPageBackLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground',
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" />
      {children}
    </Link>
  );
}

export function PublicPageSplitLayout({
  aside,
  asideClassName,
  asidePosition = 'end',
  className,
  main,
  mainClassName,
}: PublicPageSplitLayoutProps) {
  const isStartRail = asidePosition === 'start';

  return (
    <div
      className={cn(
        'grid gap-8',
        isStartRail
          ? 'lg:grid-cols-[248px_minmax(0,1fr)]'
          : 'lg:grid-cols-[minmax(0,1fr)_280px]',
        className,
      )}
    >
      {isStartRail ? (
        <>
          {aside ? (
            <aside
              className={cn(
                'space-y-6 lg:border-r lg:border-border/70 lg:pr-6',
                asideClassName,
              )}
            >
              {aside}
            </aside>
          ) : null}
          <div className={cn('min-w-0', mainClassName)}>{main}</div>
        </>
      ) : (
        <>
          <div className={cn('min-w-0', mainClassName)}>{main}</div>
          {aside ? (
            <aside
              className={cn(
                'space-y-6 lg:border-l lg:border-border/70 lg:pl-6',
                asideClassName,
              )}
            >
              {aside}
            </aside>
          ) : null}
        </>
      )}
    </div>
  );
}

export function PublicSidebarSection({
  children,
  className,
  divider = false,
  title,
}: PublicSidebarSectionProps) {
  return (
    <section
      className={cn(divider && 'border-t border-border/70 pt-5', className)}
    >
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
