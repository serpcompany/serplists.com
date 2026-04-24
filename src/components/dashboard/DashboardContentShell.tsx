import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface DashboardContentShellProps {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
}

export function DashboardContentShell({
  children,
  className,
  scrollable = true,
}: DashboardContentShellProps) {
  return (
    <section
      className={cn(
        'flex min-h-full flex-col bg-background',
        scrollable && 'overflow-hidden',
        className,
      )}
      data-dashboard-content-shell="true"
    >
      {children}
    </section>
  );
}

interface DashboardPageHeaderProps {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}

export function DashboardPageHeader({
  actions,
  description,
  title,
}: DashboardPageHeaderProps) {
  return (
    <header
      className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between"
      data-dashboard-page-header="true"
    >
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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

export function DashboardToolbar({
  children,
  className,
}: DashboardToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-border px-4 py-3 sm:px-6 lg:flex-row lg:items-center',
        className,
      )}
      data-dashboard-toolbar="true"
    >
      {children}
    </div>
  );
}

interface DashboardScrollAreaProps {
  children: ReactNode;
  className?: string;
}

export function DashboardScrollArea({
  children,
  className,
}: DashboardScrollAreaProps) {
  return (
    <div
      className={cn('flex-1 overflow-auto p-4 sm:p-6', className)}
      data-dashboard-scroll-area="true"
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
}

export function DashboardEmptyState({
  action,
  description,
  icon,
  title,
}: DashboardEmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 text-center"
      data-dashboard-empty-state="true"
    >
      {icon ? (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <h3 className="mb-1 text-sm font-medium text-foreground">{title}</h3>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

interface DashboardMetricCardProps {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
}

export function DashboardMetricCard({
  icon,
  label,
  value,
}: DashboardMetricCardProps) {
  return (
    <div className="border bg-card p-5" data-dashboard-metric-card="true">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-4 text-3xl font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}
