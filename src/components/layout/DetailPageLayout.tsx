import { Fragment, type ReactNode } from 'react';
import { House } from 'lucide-react';

import { IconTile } from '@/components/layout/IconTile';
import { PageContainer } from '@/components/layout/page-shell';
import { Link } from '@/components/navigation/Link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { buildHomePath } from '@/lib/routes';
import { cn } from '@/lib/utils';

export type DetailBreadcrumb = { href?: string; label: ReactNode };

type DetailPageLayoutProps = {
  // Buttons under the header text.
  actions?: ReactNode;
  // The panel beside the header on wide screens (under it on phones).
  aside?: ReactNode;
  // The trail after Home; the last one is the current page and is not a link.
  breadcrumbs: DetailBreadcrumb[];
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
      <Breadcrumb className="mb-8">
        <BreadcrumbList>
          {breadcrumbHome ? (
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href={buildHomePath()} />}>
                <House className="size-4" aria-hidden="true" />
                <span className="sr-only">Home</span>
              </BreadcrumbLink>
            </BreadcrumbItem>
          ) : null}
          {breadcrumbs.map((crumb, index) => {
            const last = index === breadcrumbs.length - 1;
            return (
              <Fragment key={index}>
                {breadcrumbHome || index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {last || !crumb.href ? (
                    <BreadcrumbPage className="line-clamp-1">{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {notice ? <div className="mb-6">{notice}</div> : null}

      <div className={cn('grid gap-8', aside && 'lg:grid-cols-2 lg:items-start lg:gap-12')}>
        <header className="flex min-w-0 flex-col items-start gap-4">
          {icon ? <IconTile size="lg">{icon}</IconTile> : null}
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
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
        </header>
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
