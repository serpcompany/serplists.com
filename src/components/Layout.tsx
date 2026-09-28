import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  LogOut,
} from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import {
  publicFooterGroups,
  publicHeaderLinks,
} from '@/components/layout/publicSiteLinks';
import { cn } from '@/lib/utils';
import {
  buildConsoleHomePath,
  buildConsoleRunsPath,
  buildConsoleTemplatesPath,
  buildConsoleSettingsPath,
  buildPublicProfilePath,
  resolvePublicRouteTier,
  resolveRouteShell,
} from '@/lib/routes';
import { PageContainer } from '@/components/layout/page-shell';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { MobileBottomNav, MobileNav } from '@/components/MobileNav';
import { APP_BRAND_NAME } from '@/lib/brand';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';

interface LayoutProps {
  children?: React.ReactNode;
}

interface SiteFooterProps {
  className?: string;
}

const isPathActive = (pathname: string, href: string): boolean => {
  if (href === buildConsoleHomePath()) {
    return pathname === href;
  }

  if (href === '/account') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
};

const BrandLink = ({ to }: { to: string }) => (
  <Link to={to} className="inline-flex items-center gap-2">
    <LayoutGrid className="h-5 w-5 text-primary" />
    <span className="text-sm font-semibold text-foreground">
      {APP_BRAND_NAME}
    </span>
  </Link>
);

const SiteFooter = ({ className }: SiteFooterProps) => (
  <footer className={cn('border-t border-border bg-background', className)}>
    <PageContainer
      className="grid gap-10 py-12 lg:grid-cols-[1.2fr_repeat(3,minmax(0,0.72fr))]"
      width="shell"
    >
      <div className="space-y-4">
        <BrandLink to="/" />
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Build repeatable checklists, publish them cleanly, and run them like
          operations.
        </p>
      </div>

      {publicFooterGroups.map((column) => (
        <div key={column.title}>
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {column.title}
          </h3>
          <div className="mt-4 space-y-3">
            {column.items.map((item) =>
              item.external ? (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-muted-foreground transition hover:text-foreground"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  to={item.href}
                  className="block text-sm text-muted-foreground transition hover:text-foreground"
                >
                  {item.label}
                </Link>
              ),
            )}
          </div>
        </div>
      ))}
    </PageContainer>
  </footer>
);

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const shell = resolveRouteShell(location.pathname);
  const publicTier = resolvePublicRouteTier(location.pathname);
  const content = children ?? <Outlet />;
  const shouldRenderFooter = publicTier !== 'minimal';

  const handleLogout = () => {
    void logout();
    navigate('/');
  };

  const userInitial =
    user?.name?.charAt(0)?.toUpperCase() ??
    user?.email?.charAt(0)?.toUpperCase() ??
    'U';

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 px-2 hover:bg-transparent">
          <Avatar className="h-8 w-8 border border-border">
            <AvatarFallback className="bg-secondary text-sm font-semibold text-foreground">
              {userInitial}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 rounded-lg border bg-popover p-2 text-popover-foreground"
        sideOffset={10}
      >
        <div className="px-3 py-2">
          <p className="font-medium text-popover-foreground">
            {user?.name || 'Your account'}
          </p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={buildConsoleHomePath()} className="cursor-pointer rounded-md">
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to={buildConsoleTemplatesPath()}
            className="cursor-pointer rounded-md"
          >
            My Templates
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={buildConsoleRunsPath()} className="cursor-pointer rounded-md">
            My Runs
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={buildConsoleSettingsPath()} className="cursor-pointer rounded-md">
            Settings
          </Link>
        </DropdownMenuItem>
        {user?.username ? (
          <DropdownMenuItem asChild>
            <Link
              to={buildPublicProfilePath(user.username)}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer rounded-md"
            >
              Profile
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer rounded-md text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const siteHeader = (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <PageContainer
        className="flex h-14 items-center justify-between gap-6"
        width="shell"
      >
        <div className="flex min-w-0 items-center gap-3">
          <BrandLink to="/" />
          {user && shell === 'console' ? (
            <div className="hidden md:block">
              <WorkspaceSwitcher />
            </div>
          ) : null}
        </div>

        <nav className="hidden items-center gap-5 md:flex">
          {publicHeaderLinks.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'text-sm font-medium text-muted-foreground transition hover:text-foreground',
                isPathActive(location.pathname, item.href) &&
                  'text-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            accountMenu
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                className="hidden text-muted-foreground md:inline-flex"
              >
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link to="/register">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </PageContainer>
    </header>
  );

  if (shell === 'console') {
    return (
      <div
        className="min-h-screen bg-background text-foreground"
        data-app-shell="console"
      >
        {siteHeader}

        <div className="flex min-h-[calc(100vh-3.5rem)]">
          <DashboardSidebar />

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-14 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
              <MobileNav />
              <div className="min-w-0 flex-1 px-3">
                <WorkspaceSwitcher />
              </div>
              <div className="w-10" />
            </header>

            <main className="min-w-0 flex-1 pb-20 md:pb-0">{content}</main>
          </div>
        </div>

        <SiteFooter className="pb-20 md:pb-0" />
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      data-app-shell="public"
    >
      {siteHeader}

      <main className="relative flex-1">
        {publicTier !== 'minimal' ? (
          <>
            <div className="public-dot-grid pointer-events-none absolute inset-x-0 top-0 h-80 opacity-70" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-muted/30 via-background to-transparent" />
          </>
        ) : null}
        <div className="relative">{content}</div>
      </main>

      {shouldRenderFooter ? (
        <SiteFooter />
      ) : null}
    </div>
  );
};
