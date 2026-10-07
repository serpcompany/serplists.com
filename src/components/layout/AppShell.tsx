'use client';

import type { ReactNode } from 'react';

import { AppSidebar } from '@/components/layout/AppSidebar';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteNavigationMenu } from '@/components/layout/SiteNavigationMenu';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { WorkspaceGate } from '@/components/workspace/WorkspaceGate';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider data-app-shell="console">
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <SiteNavigationMenu align="end" className="ml-auto hidden flex-none md:flex" />
        </header>
        <div className="min-w-0 flex-1">
          <WorkspaceGate>{children}</WorkspaceGate>
        </div>
        <SiteFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
