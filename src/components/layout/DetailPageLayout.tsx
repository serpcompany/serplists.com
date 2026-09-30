import type { ReactNode } from 'react';

import { IconTile } from '@/components/layout/IconTile';
import { PageBreadcrumb, type BreadcrumbTrailItem } from '@/components/layout/PageBreadcrumb';
import { PageContainer } from '@/components/layout/page-shell';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type DetailPageLayoutProps = {
  // Buttons under the header text.
  actions?: ReactNode;
  // The panel beside the header on wide screens (under it on phones).
  aside?: ReactNode;
  // The trail after Home; the last one, the current page, has no href.
  breadcrumbs: BreadcrumbTrailItem[];
  // False leaves Home out of the trail, for a console page whose trail starts at its section.
  breadcrumbHome?: boolean;
  // The page's content, under a separator.
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: ReactNode;
  // Small facts under the description: owner, dates, chips.
  meta?: ReactNode;
  // Above the header: notices the page needs to show first.
  notice?: ReactNode;
  title: ReactNode;
};

// A detail page: breadcrumb, a header (icon tile, title, description, meta and actions) with a
// panel beside it, then the content.
export function DetailPageLayout({
  actions,
  aside,
  breadcrumbHome = true,
  breadcrumbs,
  children,
  className,
  description,
  icon,
  meta,
  notice,
  title,
}: DetailPageLayoutProps) {
  return (
    <PageContainer width="shell" className={cn('py-8 sm:py-10', className)} data-slot="detail-page">
      <PageBreadcrumb home={breadcrumbHome} items={breadcrumbs} />

      {notice ? <div className="mb-6">{notice}</div> : null}

      <div className={cn('grid gap-8', aside && 'lg:grid-cols-2 lg:items-start lg:gap-12')}>
        {/* A div, not <header>: inside <main> a header is no landmark, and the site's header
            stays the page's only one. */}
        <div className="flex min-w-0 flex-col items-start gap-4" data-slot="detail-page-header">
          {icon ? <IconTile size="lg">{icon}</IconTile> : null}
          <h1 className="text-3xl font-semibold tracking-tight text-balance wrap-break-word sm:text-4xl">{title}</h1>
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
