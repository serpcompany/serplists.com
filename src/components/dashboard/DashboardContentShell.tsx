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

interface DashboardContentShellProps {
  children: ReactNode;
  className?: string;
  width?: PageContainerWidth;
}

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
  meta?: ReactNode;
  title: ReactNode;
  titleEditor?: ReactNode;
}

export function DashboardPageHeader({
  actions,
  description,
  meta,
  title,
  titleEditor,
}: DashboardPageHeaderProps) {
  return (
    <header
      className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      data-dashboard-page-header="true"
    >
      <div className="flex min-w-0 flex-col gap-1">
        {titleEditor ?? <h1 className="text-2xl font-semibold tracking-tight wrap-break-word">{title}</h1>}
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

interface DashboardPageBodyProps {
  children: ReactNode;
  className?: string;
}

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
  titleAs?: 'h1' | 'h2' | 'h3';
}

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
