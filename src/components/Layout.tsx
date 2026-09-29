'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { AppShell } from '@/components/layout/AppShell';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { resolvePublicRouteTier, resolveRouteShell } from '@/lib/routes';

interface LayoutProps {
  children?: ReactNode;
}

// Every page's frame, picked from the path: the console shell (the sidebar) for signed-in
// pages, and the public shell (site header and footer) for the rest.
export const Layout = ({ children }: LayoutProps) => {
  const pathname = usePathname();
  const shell = resolveRouteShell(pathname);
  const content = <RouteErrorBoundary>{children}</RouteErrorBoundary>;

  if (shell === 'console') {
    return <AppShell>{content}</AppShell>;
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground" data-app-shell="public">
      <SiteHeader />
      <main className="flex-1">{content}</main>
      {resolvePublicRouteTier(pathname) === 'minimal' ? null : <SiteFooter />}
    </div>
  );
};
