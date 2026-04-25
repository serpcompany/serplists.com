import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FileText,
  FolderOpen,
  Globe,
  Home,
  Import,
  LayoutGrid,
  Menu,
  Play,
  Plus,
  Search,
  Settings,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { cn } from '@/lib/utils';
import {
  buildConsoleHomePath,
  buildConsoleProfilePath,
  buildConsoleRunsPath,
  buildConsoleSettingsPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplateImportPath,
  buildConsoleTemplatesPath,
  buildPublicCategoriesPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import { APP_BRAND_NAME } from '@/lib/brand';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

const navItems = [
  { href: '/', icon: Home, title: 'Home' },
  { href: buildConsoleHomePath(), icon: LayoutGrid, title: 'Dashboard' },
  { href: buildConsoleTemplatesPath(), icon: FileText, title: 'Templates' },
  {
    href: buildConsoleTemplateImportPath(),
    icon: Import,
    title: 'Import Templates',
  },
  { href: buildConsoleRunsPath(), icon: Play, title: 'Runs' },
  { href: buildPublicTemplatesPath(), icon: Globe, title: 'Browse Templates' },
  { href: buildPublicCategoriesPath(), icon: FolderOpen, title: 'Categories' },
  { href: buildConsoleSettingsPath(), icon: Settings, title: 'Settings' },
];

const bottomNavItems = [
  { href: '/', icon: Home, title: 'Home' },
  { href: buildConsoleTemplatesPath(), icon: FileText, title: 'Templates' },
  {
    href: buildConsoleTemplateCreatePath(),
    icon: Plus,
    primary: true,
    title: 'New',
  },
  { href: buildConsoleRunsPath(), icon: Play, title: 'Runs' },
  { href: buildPublicTemplatesPath(), icon: Globe, title: 'Browse' },
];

const isActivePath = (pathname: string, href: string) =>
  pathname === href ||
  (href !== '/' && pathname.startsWith(href)) ||
  (href === buildConsoleRunsPath() && pathname.startsWith('/run/'));

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-left">{APP_BRAND_NAME}</SheetTitle>
        </SheetHeader>

        <div className="border-b border-border p-4">
          <div className="flex gap-2">
            <Button
              asChild
              className="flex-1"
              size="sm"
              onClick={() => setOpen(false)}
            >
              <Link to={buildConsoleTemplateCreatePath()}>
                <Plus className="mr-2 h-4 w-4" />
                New Template
              </Link>
            </Button>
            <Button
              asChild
              onClick={() => setOpen(false)}
              size="sm"
              variant="outline"
            >
              <Link to={buildPublicTemplatesPath()}>
                <Search className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {navItems.map((item) => {
            const active = isActivePath(location.pathname, item.href);

            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4">
          <ThemeToggle showLabel className="mb-2" />
          <Link
            to={buildConsoleProfilePath()}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {(user?.name?.charAt(0) || user?.email?.charAt(0) || 'U').toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="text-foreground">{user?.name || 'Your profile'}</p>
              <p className="text-xs text-muted-foreground">
                {user?.username ? `@${user.username}` : user?.email || 'Account'}
              </p>
            </div>
            <User className="h-4 w-4" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MobileBottomNav() {
  const location = useLocation();
  const pathname = location.pathname;

  if (pathname.includes('/edit') || pathname.includes('/new')) {
    return null;
  }

  return (
    <nav
      aria-label="Mobile console navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden"
      data-mobile-bottom-nav="true"
    >
      <div className="flex h-16 items-center justify-around px-2">
        {bottomNavItems.map((item) => {
          const active = isActivePath(pathname, item.href);

          if (item.primary) {
            return (
              <Link
                key={item.href}
                to={item.href}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
              >
                <item.icon className="h-5 w-5" />
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px]">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
