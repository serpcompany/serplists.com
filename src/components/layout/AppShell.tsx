'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { AppSidebar } from '@/components/layout/AppSidebar';
import { publicHeaderLinks } from '@/components/layout/publicSiteLinks';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Link } from '@/components/navigation/Link';
import { buttonVariants } from '@/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { WorkspaceGate } from '@/components/workspace/WorkspaceGate';
import { isPathWithin } from '@/lib/routes';
import { cn } from '@/lib/utils';

// The signed-in console: the sidebar, and beside it a top bar (the sidebar trigger and the
// site's links) over the page and the site footer.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <SidebarProvider data-app-shell="console">
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {publicHeaderLinks.map((item) => {
              const active = isPathWithin(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    !active && 'text-muted-foreground',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <div className="min-w-0 flex-1">
          <WorkspaceGate>{children}</WorkspaceGate>
        </div>
        <SiteFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
