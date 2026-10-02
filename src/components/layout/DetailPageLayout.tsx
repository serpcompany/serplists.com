import type { ReactNode } from 'react';

import { IconTile } from '@/components/layout/IconTile';
import { PageBreadcrumb, type BreadcrumbTrailItem } from '@/components/layout/PageBreadcrumb';
import { PageContainer } from '@/components/layout/page-shell';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type DetailPageLayoutProps = {
  actions?: ReactNode;
  aside?: ReactNode;
  breadcrumbs?: BreadcrumbTrailItem[];
  breadcrumbHome?: boolean;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: ReactNode;
  media?: ReactNode;
  meta?: ReactNode;
  notice?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
};

export function DetailPageLayout({
  actions,
  aside,
  breadcrumbHome = true,
  breadcrumbs,
  children,
  className,
  description,
  icon,
  media,
  meta,
  notice,
  subtitle,
  title,
}: DetailPageLayoutProps) {
  return (
    <PageContainer width="shell" className={cn('py-8 sm:py-10', className)} data-slot="detail-page">
      {breadcrumbs ? <PageBreadcrumb home={breadcrumbHome} items={breadcrumbs} /> : null}

      {notice ? <div className="mb-6">{notice}</div> : null}

      <div className={cn('grid gap-8', aside && 'lg:grid-cols-2 lg:items-start lg:gap-12')}>
        <div className="flex min-w-0 flex-col items-start gap-4" data-slot="detail-page-header">
          {media ?? (icon ? <IconTile size="lg">{icon}</IconTile> : null)}
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight text-balance wrap-break-word sm:text-4xl">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {description ? (
            <p className="text-base whitespace-pre-line text-pretty text-muted-foreground sm:text-lg">
              {description}
            </p>
          ) : null}
          {meta ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {meta}
            </div>
          ) : null}
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {aside ? (
          <aside className="rounded-xl bg-muted p-6 ring-1 ring-foreground/10">{aside}</aside>
        ) : null}
      </div>

      {children ? (
        <>
          <Separator className="my-10" />
          {children}
        </>
      ) : null}
    </PageContainer>
  );
}
