import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Briefcase,
  CheckSquare,
  Compass,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
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
  buildPublicProfilePath,
  buildPublicTemplatesPath,
  resolveConsoleSection,
  resolvePublicRouteTier,
  resolveRouteShell,
} from '@/lib/routes';
import { PageContainer } from '@/components/layout/page-shell';

interface LayoutProps {
  children: React.ReactNode;
}

type NavigationItem = {
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  description?: string;
};

const consoleNavigation: NavigationItem[] = [
  {
    href: buildConsoleHomePath(),
    icon: LayoutDashboard,
    label: 'Home',
    description: 'Overview, stats, and recent activity',
  },
  {
    href: buildConsoleTemplatesPath(),
    icon: Briefcase,
    label: 'Templates',
    description: 'Create, import, and manage checklist assets',
  },
  {
    href: buildConsoleRunsPath(),
    icon: CheckSquare,
    label: 'Runs',
    description: 'Track execution progress and shared runs',
  },
  {
    href: '/account',
    icon: Settings,
    label: 'Account',
    description: 'Profile, access, and billing settings',
  },
];

const isPathActive = (pathname: string, href: string): boolean => {
  if (href === buildConsoleHomePath()) {
    return pathname === href;
  }

  if (href === '/account') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
};

const BrandMark = () => (
  <span className="relative inline-flex h-10 w-10 overflow-hidden rounded-xl border border-border/80 bg-card">
    <span className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--muted))_0%,hsl(var(--background))_100%)]" />
    <span className="absolute inset-[6px] rounded-lg border border-border/70 bg-background" />
    <span className="absolute inset-[12px] rounded-md bg-primary" />
  </span>
);

const BrandLink = ({ to }: { to: string }) => (
  <Link to={to} className="group inline-flex items-center gap-3">
    <BrandMark />
    <span className="flex flex-col">
      <span className="text-lg font-semibold tracking-tight text-foreground">
        SERP Lists
      </span>
      <span className="text-xs text-muted-foreground">
        Checklist discovery and execution
      </span>
    </span>
  </Link>
);

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const shell = resolveRouteShell(location.pathname);
  const publicTier = resolvePublicRouteTier(location.pathname);
  const consoleSection = resolveConsoleSection(location.pathname);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const userInitial =
    user?.name?.charAt(0)?.toUpperCase() ??
    user?.email?.charAt(0)?.toUpperCase() ??
    'U';

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'h-11 rounded-md px-2 hover:bg-transparent',
            shell === 'console' ? 'text-foreground' : 'text-foreground',
          )}
        >
          <Avatar className="h-9 w-9 border border-border">
            <AvatarFallback
              className={cn(
                'text-sm font-semibold',
                shell === 'console'
                  ? 'bg-secondary text-foreground'
                  : 'bg-primary text-primary-foreground',
              )}
            >
              {userInitial}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          'w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-xl',
        )}
        sideOffset={10}
      >
        <div className="px-3 py-2">
          <p className="font-medium text-popover-foreground">
            {user?.name || 'Your workspace'}
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
            My templates
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/account" className="cursor-pointer rounded-md">
            Account settings
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
              Public profile
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer rounded-lg text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (shell === 'console') {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-border/80 bg-background/88 px-5 py-5 text-foreground backdrop-blur lg:flex">
          <BrandLink to={buildConsoleHomePath()} />

          <div className="mt-8">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
              Workspace
            </p>
            <div className="mt-3 rounded-xl border border-border/80 bg-card/90 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search templates"
                  placeholder="Search templates"
                  className="h-10 border-border/70 bg-background pl-9 shadow-none"
                  readOnly
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Flattened workspace navigation inspired by product docs layouts.
              </p>
            </div>
          </div>

          <nav className="mt-6 space-y-1">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
              Navigate
            </p>
            {consoleNavigation.map((item) => {
              const Icon = item.icon ?? Compass;
              const active = item.label.toLowerCase() === consoleSection;

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border-l-2 px-3 py-3 transition',
                    active
                      ? 'border-primary bg-card text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                  )}
                >
                  <Icon
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0',
                      active ? 'text-primary' : 'text-muted-foreground',
                    )}
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">
                      {item.label}
                    </span>
                    <span
                      className={cn(
                        'block text-xs leading-5',
                        active
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border/80 pt-4">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
              Library
            </p>
            <Button
              asChild
              variant="ghost"
              className="mt-2 w-full justify-start rounded-lg px-3 text-muted-foreground hover:text-foreground"
            >
              <Link to={buildPublicTemplatesPath()}>
                <BookOpen className="mr-2 h-4 w-4" />
                Browse templates
              </Link>
            </Button>
          </div>
        </aside>

        <div className="lg:pl-72">
          <header className="sticky top-0 z-30 border-b border-border/80 bg-background/82 backdrop-blur">
            <PageContainer
              className="flex items-center justify-between gap-4 py-4 lg:px-10"
              width="shell"
            >
              <div className="flex items-center gap-3">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="lg:hidden"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="left"
                    className="border-r border-border bg-background p-0 text-foreground"
                  >
                    <SheetHeader className="border-b border-border px-6 py-6 text-left">
                      <SheetTitle className="text-foreground">
                        SERP Lists Console
                      </SheetTitle>
                      <SheetDescription className="text-muted-foreground">
                        Navigate your templates, runs, and account settings.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-3 p-6">
                      <div className="rounded-xl border border-border/80 bg-card/90 p-3">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            aria-label="Search templates"
                            placeholder="Search templates"
                            className="h-10 border-border/70 bg-background pl-9 shadow-none"
                            readOnly
                          />
                        </div>
                      </div>
                      {consoleNavigation.map((item) => {
                        const Icon = item.icon ?? Compass;
                        const active =
                          item.label.toLowerCase() === consoleSection;

                        return (
                          <Link
                            key={item.href}
                            to={item.href}
                            className={cn(
                              'flex items-center gap-3 rounded-lg border-l-2 px-4 py-3 transition',
                              active
                                ? 'border-primary bg-card text-foreground'
                                : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
                            )}
                          >
                            <Icon
                              className={cn(
                                'h-4 w-4',
                                active ? 'text-primary' : 'text-muted-foreground',
                              )}
                            />
                            <span className="text-sm font-medium">
                              {item.label}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </SheetContent>
                </Sheet>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Console
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {consoleNavigation.find(
                      (item) => item.label.toLowerCase() === consoleSection,
                    )?.description ?? 'Manage your workspace'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  asChild
                  variant="outline"
                  className="hidden rounded-lg border-border/80 bg-card/80 md:inline-flex"
                >
                  <Link to={buildPublicTemplatesPath()}>
                    <BookOpen className="mr-2 h-4 w-4" />
                    Public templates
                  </Link>
                </Button>
                {accountMenu}
              </div>
            </PageContainer>
          </header>

          <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
            <PageContainer className="px-0 sm:px-0 lg:px-0" width="shell">
              {children}
            </PageContainer>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/92 backdrop-blur">
        <PageContainer
          className="flex items-center justify-between gap-6 py-4"
          width="shell"
        >
          <BrandLink to="/" />

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
            {user ? (
              <>
                <Button
                  asChild
                  variant="outline"
                  className="hidden md:inline-flex"
                >
                  <Link to={buildConsoleHomePath()}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Dashboard
                  </Link>
                </Button>
                {accountMenu}
              </>
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

        <div className="border-t border-border/80 bg-background/92 md:hidden">
          <nav>
            <PageContainer
              className="flex gap-2 overflow-x-auto py-3"
              width="shell"
            >
              {publicHeaderLinks.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'whitespace-nowrap rounded-full border border-border/80 px-3 py-1.5 text-sm text-muted-foreground transition',
                    isPathActive(location.pathname, item.href) &&
                      'border-foreground/20 bg-card text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </PageContainer>
          </nav>
        </div>
      </header>

      <main className="relative flex-1">
        {publicTier !== 'minimal' ? (
          <>
            <div className="public-dot-grid pointer-events-none absolute inset-x-0 top-0 h-80 opacity-70" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-muted/70 via-background to-transparent" />
          </>
        ) : null}
        <div className="relative">{children}</div>
      </main>

      <footer className="border-t border-border bg-background">
        <PageContainer
          className="grid gap-10 py-12 lg:grid-cols-[1.2fr_repeat(3,minmax(0,0.72fr))]"
          width="shell"
        >
          <div className="space-y-4">
            <BrandLink to="/" />
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              Build repeatable checklists, publish them cleanly, and run them
              like operations.
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
    </div>
  );
};
