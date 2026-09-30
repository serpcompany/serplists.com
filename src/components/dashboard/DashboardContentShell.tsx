import type { ReactNode } from 'react';

import { PageContainer } from '@/components/layout/page-shell';
import type { PageContainerWidth } from '@/components/layout/page-shell.styles';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

// The console's page blocks (docs/DESIGN.md): a console page is a DashboardContentShell
// holding a DashboardPageHeader, an optional DashboardToolbar and the page's content. The
// window scrolls, never a box inside the page, so sticky parts of a page stick to the window.

interface DashboardContentShellProps {
  children: ReactNode;
  className?: string;
  // The page width (page-shell.styles.ts): `content` by default, `narrow` for forms.
  width?: PageContainerWidth;
}

// The page: the site's page width, with the header, toolbar and content stacked.
export function DashboardContentShell({
  children,
  className,
  width = 'content',
}: DashboardContentShellProps) {
  return (
    <section
      className={cn('flex min-h-full min-w-0 flex-col', className)}
      data-dashboard-content-shell="true"
    >
      <PageContainer className="flex min-w-0 flex-1 flex-col gap-6 py-6 md:py-8" width={width}>
        {children}
      </PageContainer>
    </section>
  );
}

interface DashboardPageHeaderProps {
  actions?: ReactNode;
  description?: ReactNode;
  // Badges under the description, such as a status.
  meta?: ReactNode;
  title: ReactNode;
}

// The page's title (its h1), a muted description and badges, with the page's actions on the
// right (under the text on phones).
export function DashboardPageHeader({
  actions,
  description,
  meta,
  title,
}: DashboardPageHeaderProps) {
  return (
    <header
      className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      data-dashboard-page-header="true"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight wrap-break-word">{title}</h1>
        {description ? (
          <p className="text-sm whitespace-pre-line text-muted-foreground">{description}</p>
        ) : null}
        {meta ? <div className="mt-1 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

interface DashboardToolbarProps {
  children: ReactNode;
  className?: string;
}

// The row of filters over a list: labelled fields side by side, stacked on phones.
export function DashboardToolbar({ children, className }: DashboardToolbarProps) {
  return (
    <div
      className={cn('flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end', className)}
      data-dashboard-toolbar="true"
    >
      {children}
    </div>
  );
}

interface DashboardPageBodyProps {
  children: ReactNode;
  className?: string;
}

// The page's content under its header and toolbar.
export function DashboardPageBody({ children, className }: DashboardPageBodyProps) {
  return (
    <div
      className={cn('flex min-w-0 flex-1 flex-col gap-6', className)}
      data-dashboard-page-body="true"
    >
      {children}
    </div>
  );
}

interface DashboardEmptyStateProps {
  action?: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  // The title's heading level: h1 when the state is the whole page (a record that failed to
  // load or does not exist), h3 inside a card that has its own title.
  titleAs?: 'h1' | 'h2' | 'h3';
}

// An empty, error or not-found state in place of a list or a page (the shadcn Empty).
export function DashboardEmptyState({
  action,
  description,
  icon,
  title,
  titleAs: Title = 'h2',
}: DashboardEmptyStateProps) {
  return (
    <Empty className="border" data-dashboard-empty-state="true">
      <EmptyHeader>
        {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
        <EmptyTitle>
          <Title>{title}</Title>
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

// A page or panel that is loading: the shadcn Spinner, with what is loading under it.
export function DashboardLoadingState({ label }: { label?: string }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground"
      data-dashboard-loading-state="true"
    >
      <Spinner className="size-6" />
      {label ? <p>{label}</p> : null}
    </div>
  );
}
